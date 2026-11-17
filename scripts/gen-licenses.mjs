// Collect the licenses of every runtime package that ships in the site
// (dependencies of package.json, followed transitively) into
// src/legal/licenses.json for the Open Source Licenses page.
// Runs before every build, so the page always matches what's bundled.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt|markdown))?$/i;

function findPackageDir(name, from) {
  let dir = from;
  for (;;) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

// Server-side or type-only packages that Transformers.js lists as dependencies
// but that never reach the browser bundle. Their whole subtrees are skipped.
const NOT_SHIPPED = new Set(['onnxruntime-node', 'sharp', '@types/node']);

const seen = new Map();
function visit(name, from) {
  if (NOT_SHIPPED.has(name)) return;
  const dir = findPackageDir(name, from);
  if (!dir) return;
  const p = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const key = `${p.name}@${p.version}`;
  if (seen.has(key)) return;
  const files = readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
  const text = files.map((f) => readFileSync(join(dir, f), 'utf8').trim()).join('\n\n');
  const license = typeof p.license === 'string' ? p.license : p.license?.type ?? (Array.isArray(p.licenses) ? p.licenses.map((l) => l.type).join(' OR ') : 'UNKNOWN');
  const repo = typeof p.repository === 'string' ? p.repository : p.repository?.url;
  seen.set(key, {
    name: p.name,
    version: p.version,
    license,
    homepage: p.homepage ?? (repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://') : null),
    text,
  });
  for (const dep of Object.keys(p.dependencies ?? {})) visit(dep, dir);
}

for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, root);

const list = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(root, 'src/legal/licenses.json'), JSON.stringify(list, null, 1) + '\n');
const missing = list.filter((l) => !l.text).map((l) => l.name);
console.log(`[licenses] ${list.length} packages${missing.length ? `; no license file in: ${missing.join(', ')}` : ''}`);
