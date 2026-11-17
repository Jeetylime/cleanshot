// Fail the build if any file in dist/ is too big for static hosts.
// Cloudflare Pages rejects files over 25 MiB; warn well before that.
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const LIMIT = 25 * 1024 * 1024;
const WARN = 23 * 1024 * 1024;
const root = new URL('../dist', import.meta.url).pathname;
let failed = false;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (s.size > LIMIT) {
      console.error(`✗ ${relative(root, p)} is ${(s.size / 2 ** 20).toFixed(1)} MiB (limit 25 MiB)`);
      failed = true;
    } else if (s.size > WARN) console.warn(`! ${relative(root, p)} is ${(s.size / 2 ** 20).toFixed(1)} MiB, close to the 25 MiB limit`);
  }
}

walk(root);
if (failed) process.exit(1);
console.log('[check-sizes] all files are under 25 MiB');
