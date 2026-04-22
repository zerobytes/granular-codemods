import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('..', import.meta.url));
const testsDir = join(here, 'tests');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (entry === '__testfixtures__' || entry === 'node_modules') continue;
      out.push(...walk(p));
    } else if (entry.endsWith('.test.mjs')) {
      out.push(p);
    }
  }
  return out;
}

const files = walk(testsDir);
if (files.length === 0) {
  console.log('No tests found.');
  process.exit(0);
}

const result = spawnSync('node', ['--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
