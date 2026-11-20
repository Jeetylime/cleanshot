import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as lib from 'pdf-lib';
import { ALL_PERMISSIONS, loadDecrypted, md5, PasswordError, rc4, readEncryptInfo, saveEncrypted } from '../pdf/crypto';

const fixture = (n: string) => {
  const b = readFileSync(join(__dirname, 'fixtures', n));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** The page's content stream, decoded. */
function pageText(doc: lib.PDFDocument): string {
  const page = doc.getPage(0);
  const c = page.node.Contents();
  const stream = c instanceof lib.PDFArray ? (c.lookup(0) as lib.PDFRawStream) : (c as lib.PDFRawStream);
  return new TextDecoder('latin1').decode(lib.decodePDFRawStream(stream).decode());
}

describe('PDF crypto primitives', () => {
  it('md5 matches known vectors', () => {
    const hex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join('');
    expect(hex(md5(new Uint8Array()))).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(hex(md5(new TextEncoder().encode('The quick brown fox jumps over the lazy dog')))).toBe('9e107d9d372bb6826bd81d3542a419d6');
  });
  it('rc4 matches a known vector', () => {
    const out = rc4(new TextEncoder().encode('Key'), new TextEncoder().encode('Plaintext'));
    expect(Array.from(out, (v) => v.toString(16).padStart(2, '0')).join('')).toBe('bbf316e8d940af0ad3');
  });
});

describe('PDF decryption', () => {
  for (const alg of ['RC4-40', 'RC4-128', 'AES-128', 'AES-256-R5', 'AES-256']) {
    it(`opens ${alg} with the user and the owner password`, async () => {
      for (const pw of ['open sesame', 'boss']) {
        const doc = await loadDecrypted(lib, fixture(`enc-${alg}.pdf`), pw);
        expect(doc.isEncrypted).toBe(false);
        expect(pageText(doc)).toContain('Secret quarterly numbers');
        expect(doc.getTitle()).toBe('Plan');
      }
    });
  }
  it('rejects a wrong password', async () => {
    await expect(loadDecrypted(lib, fixture('enc-AES-256.pdf'), 'nope')).rejects.toBeInstanceOf(PasswordError);
    await expect(loadDecrypted(lib, fixture('enc-RC4-128.pdf'), 'nope')).rejects.toBeInstanceOf(PasswordError);
  });
});

describe('PDF encryption', () => {
  it('round-trips AES-256 with user and owner passwords', async () => {
    const doc = await lib.PDFDocument.load(fixture('plain.pdf'));
    const bytes = await saveEncrypted(lib, doc, 'hello', 'owner!', { ...ALL_PERMISSIONS, copy: false });
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, bytes);
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const probe = await lib.PDFDocument.load(ab, { ignoreEncryption: true });
    expect(readEncryptInfo(lib, probe)?.info.R).toBe(6);
    for (const pw of ['hello', 'owner!']) expect(pageText(await loadDecrypted(lib, ab, pw))).toContain('Secret quarterly numbers');
    await expect(loadDecrypted(lib, ab, 'wrong')).rejects.toBeInstanceOf(PasswordError);
  }, 20000);
});
