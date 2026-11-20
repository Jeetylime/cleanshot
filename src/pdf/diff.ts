/**
 * Text comparison for Compare PDFs: Myers' O(ND) diff, first over lines,
 * then over the words inside changed line blocks.
 */

export type DiffOp = { op: 'eq' | 'del' | 'ins'; text: string };

/** Myers diff of two token arrays. Returns null if more than `maxD` edits are needed. */
export function myers<T>(a: T[], b: T[], maxD = 4000): DiffOp[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, maxD);
  const trace: Int32Array[] = [];
  let v = new Int32Array(3);
  const off = (d: number) => d + 1; // index shift inside each V of size 2d+3
  let found = -1;
  for (let d = 0; d <= max; d++) {
    const nv = new Int32Array(2 * d + 3);
    for (let k = -d; k <= d; k += 2) {
      const get = (kk: number) => (Math.abs(kk) <= d - 1 ? v[kk + d - 1 + 1] : -1);
      let x: number;
      if (k === -d || (k !== d && get(k - 1) < get(k + 1))) x = d === 0 ? 0 : get(k + 1);
      else x = get(k - 1) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      nv[k + d + 1] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    trace.push(nv);
    v = nv;
    void off;
    if (found >= 0) break;
  }
  if (found < 0) return null;
  // Backtrack from the end: each step is a snake (equal run) preceded by one edit.
  const ops: { op: 'eq' | 'del' | 'ins'; i: number }[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    const pv = trace[d - 1];
    const get = (kk: number) => (Math.abs(kk) <= d - 1 ? pv[kk + d] : -1);
    const k = x - y;
    const prevK = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1;
    const px = get(prevK);
    const py = px - prevK;
    // The edit lands at (px, py+1) for an insertion or (px+1, py) for a deletion; the snake runs from there.
    const sx = prevK === k + 1 ? px : px + 1;
    while (x > sx) {
      ops.push({ op: 'eq', i: x - 1 });
      x--;
      y--;
    }
    if (prevK === k + 1) ops.push({ op: 'ins', i: py });
    else ops.push({ op: 'del', i: px });
    x = px;
    y = py;
  }
  while (x > 0 && y > 0) {
    ops.push({ op: 'eq', i: x - 1 });
    x--;
    y--;
  }
  ops.reverse();
  return ops.map((o) => ({ op: o.op, text: String(o.op === 'ins' ? b[o.i] : a[o.i]) }));
}

/** Merge consecutive ops of the same kind, joining with `sep`. */
function merge(ops: DiffOp[], sep: string): DiffOp[] {
  const out: DiffOp[] = [];
  for (const o of ops) {
    const last = out[out.length - 1];
    if (last && last.op === o.op) last.text += sep + o.text;
    else out.push({ ...o });
  }
  return out;
}

const words = (s: string) => s.split(/(\s+)/).filter((w) => w.length);

/** Diff two texts: lines first, then words within each changed block. */
export function diffText(a: string, b: string): DiffOp[] {
  // Lines keep their newline so the pieces join back into the exact text.
  const split = (t: string) => t.split(/(?<=\n)/);
  const la = split(a);
  const lb = split(b);
  const lines = myers(la, lb, 6000);
  if (!lines) return [{ op: 'del', text: a }, { op: 'ins', text: b }];
  const out: DiffOp[] = [];
  let i = 0;
  while (i < lines.length) {
    if (lines[i].op === 'eq') {
      out.push({ op: 'eq', text: lines[i].text });
      i++;
      continue;
    }
    const del: string[] = [];
    const ins: string[] = [];
    while (i < lines.length && lines[i].op !== 'eq') {
      (lines[i].op === 'del' ? del : ins).push(lines[i].text);
      i++;
    }
    const wa = words(del.join(''));
    const wb = words(ins.join(''));
    const w = myers(wa, wb, 3000);
    if (w) out.push(...merge(w, ''));
    else {
      if (del.length) out.push({ op: 'del', text: del.join('') });
      if (ins.length) out.push({ op: 'ins', text: ins.join('') });
    }
  }
  return merge(out, '');
}

/** Rebuild both sides from a diff (for tests and sanity checks). */
export function sides(ops: DiffOp[]): [string, string] {
  return [ops.filter((o) => o.op !== 'ins').map((o) => o.text).join(''), ops.filter((o) => o.op !== 'del').map((o) => o.text).join('')];
}
