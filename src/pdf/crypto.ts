/**
 * PDF Standard Security Handler, hand-written (pdf-lib can't encrypt or
 * decrypt). Everything runs locally with WebCrypto plus small MD5/RC4 code.
 *
 * - Decrypt: revisions 2–4 (RC4 40/128-bit, AES-128) and 5–6 (AES-256), with
 *   the user or the owner password. Objects are decrypted while pdf-lib
 *   parses them, so encrypted object streams load correctly.
 * - Encrypt: revision 6, AES-256 (PDF 2.0 / Acrobat X and later), with an
 *   open password, an optional separate owner password and permissions.
 */
import type { PDFDocument as PDFDocumentT, PDFObject, PDFRef as PDFRefT } from 'pdf-lib';

type Lib = typeof import('pdf-lib');

// ---------------------------------------------------------------------------
// Primitives

const PAD = new Uint8Array([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a]);

function concat(...parts: ArrayLike<number>[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p as Uint8Array, o);
    o += p.length;
  }
  return out;
}

/** MD5 (RFC 1321). Only used for legacy PDF key derivation. */
export function md5(data: Uint8Array): Uint8Array {
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const len = data.length;
  const total = ((len + 8) >> 6) * 64 + 64;
  const m = new Uint8Array(total);
  m.set(data);
  m[len] = 0x80;
  const bits = len * 8;
  const dv = new DataView(m.buffer);
  dv.setUint32(total - 8, bits >>> 0, true);
  dv.setUint32(total - 4, Math.floor(bits / 2 ** 32), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let off = 0; off < total; off += 64) {
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F: number;
      let g: number;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + dv.getUint32(off + g * 4, true)) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((F << s[i]) | (F >>> (32 - s[i])))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}

export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256);
  for (let i = 0; i < 256; i++) S[i] = i;
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 255;
    [S[i], S[j]] = [S[j], S[i]];
  }
  const out = new Uint8Array(data.length);
  for (let k = 0, i = 0, j = 0; k < data.length; k++) {
    i = (i + 1) & 255;
    j = (j + S[i]) & 255;
    [S[i], S[j]] = [S[j], S[i]];
    out[k] = data[k] ^ S[(S[i] + S[j]) & 255];
  }
  return out;
}

const subtle = () => globalThis.crypto.subtle;
const buf = (u: Uint8Array) => u as Uint8Array<ArrayBuffer>;

async function sha(alg: 'SHA-256' | 'SHA-384' | 'SHA-512', data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().digest(alg, buf(data)));
}

async function aesKey(key: Uint8Array): Promise<CryptoKey> {
  return subtle().importKey('raw', buf(key), 'AES-CBC', false, ['encrypt', 'decrypt']);
}

/** AES-CBC encryption with PKCS#7 padding. */
async function aesEncrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle().encrypt({ name: 'AES-CBC', iv: buf(iv) }, await aesKey(key), buf(data)));
}

/** AES-CBC encryption of whole blocks, without padding. */
async function aesEncryptRaw(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  return (await aesEncrypt(key, iv, data)).subarray(0, data.length);
}

/** AES-CBC decryption with PKCS#7 padding; null when the padding is wrong. */
async function aesDecrypt(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await subtle().decrypt({ name: 'AES-CBC', iv: buf(iv) }, await aesKey(key), buf(data)));
  } catch {
    return null;
  }
}

/**
 * AES-CBC decryption of whole blocks without padding. WebCrypto insists on
 * PKCS#7, so append a block that decrypts to a full padding block.
 */
async function aesDecryptRaw(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const last = data.subarray(data.length - 16);
  const padBlock = await aesEncryptRaw(key, last, new Uint8Array(16).fill(16));
  const out = await aesDecrypt(key, iv, concat(data, padBlock));
  if (!out) throw new Error('AES decryption failed');
  return out;
}

// ---------------------------------------------------------------------------
// Key derivation

/** PDF 2.0 Algorithm 2.B (revision 6 password hash). */
async function hash2B(pw: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  let K = await sha('SHA-256', concat(pw, salt, udata));
  for (let i = 0; ; i++) {
    const unit = concat(pw, K, udata);
    const K1 = new Uint8Array(unit.length * 64);
    for (let r = 0; r < 64; r++) K1.set(unit, r * unit.length);
    const E = await aesEncryptRaw(K.subarray(0, 16), K.subarray(16, 32), K1);
    let sum = 0;
    for (let b = 0; b < 16; b++) sum += E[b];
    const alg = (['SHA-256', 'SHA-384', 'SHA-512'] as const)[sum % 3];
    K = await sha(alg, E);
    if (i >= 63 && E[E.length - 1] <= i + 1 - 32) break;
  }
  return K.subarray(0, 32);
}

async function hashR56(rev: number, pw: Uint8Array, salt: Uint8Array, udata: Uint8Array): Promise<Uint8Array> {
  return rev >= 6 ? hash2B(pw, salt, udata) : sha('SHA-256', concat(pw, salt, udata));
}

function passwordBytesLegacy(pw: string): Uint8Array {
  // PDFDocEncoding ≈ Latin-1 for typical passwords.
  const b = Uint8Array.from([...pw].map((c) => c.charCodeAt(0) & 0xff)).subarray(0, 32);
  return concat(b, PAD.subarray(0, 32 - b.length));
}

function passwordBytesUtf8(pw: string): Uint8Array {
  return new TextEncoder().encode(pw.normalize('NFKC')).subarray(0, 127);
}

const eq = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export interface Security {
  rev: number;
  /** File encryption key. */
  key: Uint8Array;
  /** 'rc4' | 'aes128' | 'aes256' | 'none' for streams and strings. */
  stm: Cipher;
  str: Cipher;
  encryptMetadata: boolean;
  /** Unlocked with the owner password (full rights). */
  asOwner: boolean;
}

type Cipher = 'rc4' | 'aes128' | 'aes256' | 'none';

export interface EncryptInfo {
  V: number;
  R: number;
  O: Uint8Array;
  U: Uint8Array;
  OE?: Uint8Array;
  UE?: Uint8Array;
  P: number;
  length: number;
  stmF: Cipher;
  strF: Cipher;
  encryptMetadata: boolean;
  id0: Uint8Array;
}

async function legacyKey(info: EncryptInfo, pw32: Uint8Array): Promise<Uint8Array> {
  const n = info.R === 2 ? 5 : info.length / 8;
  const p = new Uint8Array(4);
  new DataView(p.buffer).setInt32(0, info.P, true);
  let h = md5(concat(pw32, info.O.subarray(0, 32), p, info.id0, info.R >= 4 && !info.encryptMetadata ? [255, 255, 255, 255] : []));
  if (info.R >= 3) for (let i = 0; i < 50; i++) h = md5(h.subarray(0, n));
  return h.subarray(0, n);
}

async function checkLegacyUser(info: EncryptInfo, pw32: Uint8Array): Promise<Uint8Array | null> {
  const key = await legacyKey(info, pw32);
  if (info.R === 2) return eq(rc4(key, PAD), info.U.subarray(0, 32)) ? key : null;
  let x = rc4(key, md5(concat(PAD, info.id0)));
  for (let i = 1; i <= 19; i++) x = rc4(key.map((b) => b ^ i), x);
  return eq(x, info.U.subarray(0, 16)) ? key : null;
}

async function legacyOwnerToUser(info: EncryptInfo, owner: string): Promise<Uint8Array> {
  const n = info.R === 2 ? 5 : info.length / 8;
  let h = md5(passwordBytesLegacy(owner));
  if (info.R >= 3) for (let i = 0; i < 50; i++) h = md5(h);
  const k = h.subarray(0, n);
  let x = info.O.subarray(0, 32);
  if (info.R === 2) x = rc4(k, x);
  else for (let i = 19; i >= 0; i--) x = rc4(k.map((b) => b ^ i), x);
  return x;
}

/** Derive the file key from a password (user or owner). Null = wrong password. */
export async function unlock(info: EncryptInfo, password: string): Promise<Security | null> {
  const sec = (key: Uint8Array, asOwner = false): Security => ({ rev: info.R, key, stm: info.stmF, str: info.strF, encryptMetadata: info.encryptMetadata, asOwner });
  if (info.R >= 5) {
    const pw = passwordBytesUtf8(password);
    const U = info.U;
    const O = info.O;
    if (eq(await hashR56(info.R, pw, U.subarray(32, 40), new Uint8Array()), U.subarray(0, 32))) {
      const k = await hashR56(info.R, pw, U.subarray(40, 48), new Uint8Array());
      return sec(await aesDecryptRaw(k, new Uint8Array(16), info.UE!));
    }
    if (eq(await hashR56(info.R, pw, O.subarray(32, 40), U.subarray(0, 48)), O.subarray(0, 32))) {
      const k = await hashR56(info.R, pw, O.subarray(40, 48), U.subarray(0, 48));
      return sec(await aesDecryptRaw(k, new Uint8Array(16), info.OE!), true);
    }
    return null;
  }
  const user = await checkLegacyUser(info, passwordBytesLegacy(password));
  if (user) return sec(user);
  const viaOwner = await checkLegacyUser(info, await legacyOwnerToUser(info, password));
  return viaOwner ? sec(viaOwner, true) : null;
}

/** Algorithm 1: per-object key for RC4 / AES-128. */
function objectKey(s: Security, num: number, gen: number, aes: boolean): Uint8Array {
  const k = md5(concat(s.key, [num & 255, (num >> 8) & 255, (num >> 16) & 255, gen & 255, (gen >> 8) & 255], aes ? [0x73, 0x41, 0x6c, 0x54] : []));
  return k.subarray(0, Math.min(s.key.length + 5, 16));
}

async function decryptBytes(s: Security, c: Cipher, data: Uint8Array, num: number, gen: number): Promise<Uint8Array> {
  if (c === 'none') return data;
  if (c === 'rc4') return rc4(objectKey(s, num, gen, false), data);
  if (data.length < 32 || data.length % 16) return data.length < 16 ? new Uint8Array() : data;
  const key = c === 'aes256' ? s.key : objectKey(s, num, gen, true);
  return (await aesDecrypt(key, data.subarray(0, 16), data.subarray(16))) ?? new Uint8Array();
}

// ---------------------------------------------------------------------------
// Reading the Encrypt dictionary

function bytesOf(lib: Lib, o: PDFObject | undefined): Uint8Array {
  if (o instanceof lib.PDFString || o instanceof lib.PDFHexString) return o.asBytes();
  return new Uint8Array();
}

function cipherFor(lib: Lib, enc: import('pdf-lib').PDFDict, name: string, V: number): Cipher {
  if (V < 4) return 'rc4';
  const f = enc.lookup(lib.PDFName.of(name));
  const fname = f instanceof lib.PDFName ? f.decodeText() : 'Identity';
  if (fname === 'Identity') return 'none';
  const cf = enc.lookup(lib.PDFName.of('CF'), lib.PDFDict).lookup(lib.PDFName.of(fname));
  const cfm = cf instanceof lib.PDFDict ? cf.lookup(lib.PDFName.of('CFM')) : undefined;
  const m = cfm instanceof lib.PDFName ? cfm.decodeText() : 'None';
  return m === 'AESV3' ? 'aes256' : m === 'AESV2' ? 'aes128' : m === 'V2' ? 'rc4' : 'none';
}

export function readEncryptInfo(lib: Lib, doc: PDFDocumentT): { info: EncryptInfo; ref: PDFRefT | null } | null {
  const t = doc.context.trailerInfo;
  const raw = t.Encrypt;
  if (!raw) return null;
  const enc = doc.context.lookup(raw);
  if (!(enc instanceof lib.PDFDict)) return null;
  const filter = enc.lookup(lib.PDFName.of('Filter'));
  if (!(filter instanceof lib.PDFName) || filter.decodeText() !== 'Standard') throw new Error('This PDF uses a certificate or plug-in security handler, which isn’t supported.');
  const num = (k: string, d = 0) => {
    const v = enc.lookup(lib.PDFName.of(k));
    return v instanceof lib.PDFNumber ? v.asNumber() : d;
  };
  const V = num('V');
  const R = num('R');
  const em = enc.lookup(lib.PDFName.of('EncryptMetadata'));
  const idArr = t.ID ? doc.context.lookup(t.ID) : undefined;
  const id0 = idArr instanceof lib.PDFArray ? bytesOf(lib, idArr.get(0)) : new Uint8Array();
  return {
    ref: raw instanceof lib.PDFRef ? raw : null,
    info: {
      V,
      R,
      O: bytesOf(lib, enc.lookup(lib.PDFName.of('O'))),
      U: bytesOf(lib, enc.lookup(lib.PDFName.of('U'))),
      OE: bytesOf(lib, enc.lookup(lib.PDFName.of('OE'))),
      UE: bytesOf(lib, enc.lookup(lib.PDFName.of('UE'))),
      P: num('P') | 0,
      length: V === 1 ? 40 : num('Length', 40) || 40,
      stmF: cipherFor(lib, enc, 'StmF', V),
      strF: cipherFor(lib, enc, 'StrF', V),
      encryptMetadata: !(em instanceof lib.PDFBool) || em.asBoolean(),
      id0,
    },
  };
}

// ---------------------------------------------------------------------------
// Decrypting a document

export class PasswordError extends Error {}

/**
 * Load an encrypted PDF with `password` (user or owner) and return an
 * unencrypted pdf-lib document. Throws PasswordError for a wrong password.
 */
export class RestrictedError extends Error {}

/** Can the holder of the open password change this file (permission bit 4)? */
export function allowsChanges(info: EncryptInfo): boolean {
  return (info.P & 8) !== 0;
}

export async function loadDecrypted(lib: Lib, bytes: ArrayBuffer, password: string, opts: { requireChangeRights?: boolean } = {}): Promise<PDFDocumentT> {
  // Pass 1: read the (never encrypted) Encrypt dictionary and file ID.
  const probe = await lib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const found = readEncryptInfo(lib, probe);
  if (!found) return probe;
  const s = await unlock(found.info, password);
  if (!s) throw new PasswordError('That password isn’t right.');
  if (opts.requireChangeRights && !s.asOwner && !allowsChanges(found.info)) {
    throw new RestrictedError('The author restricted changes to this PDF. Enter the owner (permissions) password to remove its protection.');
  }
  const skipNum = found.ref?.objectNumber ?? -1;

  const decryptObj = async (o: PDFObject, num: number, gen: number): Promise<PDFObject> => {
    if (o instanceof lib.PDFString || o instanceof lib.PDFHexString) {
      return lib.PDFHexString.of(toHex(await decryptBytes(s, s.str, o.asBytes(), num, gen)));
    }
    if (o instanceof lib.PDFArray) {
      for (let i = 0; i < o.size(); i++) o.set(i, await decryptObj(o.get(i), num, gen));
      return o;
    }
    if (o instanceof lib.PDFRawStream) {
      await decryptObj(o.dict, num, gen);
      const type = o.dict.lookup(lib.PDFName.of('Type'));
      const tname = type instanceof lib.PDFName ? type.decodeText() : '';
      if (tname === 'XRef' || (tname === 'Metadata' && !s.encryptMetadata)) return o;
      return lib.PDFRawStream.of(o.dict, await decryptBytes(s, s.stm, o.contents, num, gen));
    }
    if (o instanceof lib.PDFDict) {
      for (const [k, v] of o.entries()) o.set(k, await decryptObj(v, num, gen));
      return o;
    }
    return o;
  };

  // Pass 2: read the top-level objects with object streams still packed,
  // decrypt them (WebCrypto is asynchronous, so this can't happen inside the
  // parser), write an unencrypted file and load that normally, which unpacks
  // the now readable object streams.
  const parsed = await parseKeepingObjectStreams(lib, new Uint8Array(bytes));
  const out = lib.PDFContext.create();
  out.trailerInfo = { ...parsed.trailerInfo };
  delete out.trailerInfo.Encrypt;
  for (const [ref, obj] of parsed.enumerateIndirectObjects()) {
    if (ref.objectNumber === skipNum) continue;
    out.assign(ref, await decryptObj(obj, ref.objectNumber, ref.generationNumber));
  }
  out.largestObjectNumber = parsed.largestObjectNumber;
  const plain = await lib.PDFWriter.forContext(out, 50).serializeToBuffer();
  return lib.PDFDocument.load(plain, { updateMetadata: false });
}

const toHex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');

/** Parse a file's top-level objects, leaving object streams packed. */
async function parseKeepingObjectStreams(lib: Lib, bytes: Uint8Array): Promise<import('pdf-lib').PDFContext> {
  const XRef = lib.PDFName.of('XRef');
  const P = lib.PDFParser.prototype as unknown as Record<string, unknown>;
  const original = P.parseIndirectObject;
  P.parseIndirectObject = async function (this: {
    parseIndirectObjectHeader: () => PDFRefT;
    skipWhitespaceAndComments: () => void;
    parseObject: () => PDFObject;
    matchKeyword: (k: number[]) => boolean;
    context: import('pdf-lib').PDFContext;
  }) {
    const ref = this.parseIndirectObjectHeader();
    this.skipWhitespaceAndComments();
    const object = this.parseObject();
    this.skipWhitespaceAndComments();
    this.matchKeyword(ENDOBJ);
    // Cross-reference streams carry the trailer (never encrypted); let pdf-lib read them.
    if (object instanceof lib.PDFRawStream && object.dict.lookup(lib.PDFName.of('Type')) === XRef) {
      lib.PDFXRefStreamParser.forStream(object).parseIntoContext();
      return ref;
    }
    this.context.assign(ref, object);
    return ref;
  };
  try {
    return await lib.PDFParser.forBytesWithOptions(bytes, Infinity, false, false).parseDocument();
  } finally {
    P.parseIndirectObject = original;
  }
}

const ENDOBJ = [...'endobj'].map((c) => c.charCodeAt(0));

// ---------------------------------------------------------------------------
// Encrypting a document (revision 6, AES-256)

export interface Permissions {
  print: boolean;
  copy: boolean;
  modify: boolean;
  annotate: boolean;
  fillForms: boolean;
  assemble: boolean;
}

export const ALL_PERMISSIONS: Permissions = { print: true, copy: true, modify: true, annotate: true, fillForms: true, assemble: true };

export function permissionBits(p: Permissions): number {
  let v = 0xfffff0c0; // reserved bits set, all permission bits cleared
  if (p.print) v |= 4 | 2048;
  if (p.modify) v |= 8;
  if (p.copy) v |= 16 | 512;
  if (p.annotate) v |= 32;
  if (p.fillForms) v |= 256;
  if (p.assemble) v |= 1024;
  return v | 0;
}

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));

/**
 * Encrypt a pdf-lib document in place with AES-256 and return the saved bytes.
 * `owner` defaults to a random password (so permissions can't be lifted by
 * anyone without it, unless they're the same as the open password).
 */
export async function saveEncrypted(lib: Lib, doc: PDFDocumentT, user: string, owner: string, perms: Permissions): Promise<Uint8Array> {
  await doc.flush();
  const ctx = doc.context;
  const fileKey = rand(32);
  const u = passwordBytesUtf8(user);
  const o = passwordBytesUtf8(owner || toHex(rand(16)));
  const uVal = rand(8);
  const uKey = rand(8);
  const U = concat(await hash2B(u, uVal, new Uint8Array()), uVal, uKey);
  const UE = await aesEncryptRaw(await hash2B(u, uKey, new Uint8Array()), new Uint8Array(16), fileKey);
  const oVal = rand(8);
  const oKey = rand(8);
  const O = concat(await hash2B(o, oVal, U), oVal, oKey);
  const OE = await aesEncryptRaw(await hash2B(o, oKey, U), new Uint8Array(16), fileKey);
  const P = permissionBits(perms);
  const permsPlain = new Uint8Array(16);
  new DataView(permsPlain.buffer).setInt32(0, P, true);
  permsPlain.set([0xff, 0xff, 0xff, 0xff, 0x54, 0x61, 0x64, 0x62], 4);
  permsPlain.set(rand(4), 12);
  const Perms = await aesEncryptRaw(fileKey, new Uint8Array(16), permsPlain);

  const enc = async (data: Uint8Array) => {
    const iv = rand(16);
    return concat(iv, await aesEncrypt(fileKey, iv, data));
  };
  const encryptObj = async (obj: PDFObject): Promise<PDFObject> => {
    if (obj instanceof lib.PDFString || obj instanceof lib.PDFHexString) return lib.PDFHexString.of(toHex(await enc(obj.asBytes())));
    if (obj instanceof lib.PDFArray) {
      for (let i = 0; i < obj.size(); i++) obj.set(i, await encryptObj(obj.get(i)));
      return obj;
    }
    if (obj instanceof lib.PDFStream) {
      const s = obj as unknown as { updateDict?: () => void; getContents: () => Uint8Array; dict: import('pdf-lib').PDFDict };
      s.updateDict?.();
      const contents = s.getContents();
      await encryptObj(s.dict);
      return lib.PDFRawStream.of(s.dict, await enc(contents));
    }
    if (obj instanceof lib.PDFDict) {
      for (const [k, v] of obj.entries()) obj.set(k, await encryptObj(v));
      return obj;
    }
    return obj;
  };
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) ctx.assign(ref, await encryptObj(obj));

  const hex = (b: Uint8Array) => lib.PDFHexString.of(toHex(b));
  const stdCF = ctx.obj({ AuthEvent: 'DocOpen', CFM: 'AESV3', Length: 32 });
  const encDict = ctx.obj({ Filter: 'Standard', V: 5, R: 6, Length: 256, StmF: 'StdCF', StrF: 'StdCF', P, EncryptMetadata: true });
  encDict.set(lib.PDFName.of('CF'), ctx.obj({ StdCF: stdCF }));
  encDict.set(lib.PDFName.of('O'), hex(O));
  encDict.set(lib.PDFName.of('U'), hex(U));
  encDict.set(lib.PDFName.of('OE'), hex(OE));
  encDict.set(lib.PDFName.of('UE'), hex(UE));
  encDict.set(lib.PDFName.of('Perms'), hex(Perms));
  ctx.trailerInfo.Encrypt = ctx.register(encDict);
  if (!ctx.trailerInfo.ID) {
    const id = hex(rand(16));
    ctx.trailerInfo.ID = ctx.obj([id, id]);
  }
  // Object streams would hide the per-object encryption; write plain objects.
  return doc.save({ useObjectStreams: false, updateFieldAppearances: false });
}
