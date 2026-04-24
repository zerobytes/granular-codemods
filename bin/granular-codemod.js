#!/usr/bin/env node
'use strict';

/**
 * Standalone CLI for running a single codemod over a path.
 *
 *   granular-codemod <transform> <path...> [--dry-run]
 *
 * For full project migration use `granular migrate`.
 */

const fs = require('fs');
const path = require('path');
const { runTransformOnSource, listTransforms } = require('../src/runner');

function printUsage() {
  console.log('Usage: granular-codemod <transform> <path...> [--dry-run]');
  console.log('');
  console.log('Available transforms:');
  for (const t of listTransforms()) console.log('  ' + t);
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  printUsage();
  process.exit(0);
}

const transform = args.shift();
if (!listTransforms().includes(transform)) {
  console.error('Unknown transform: ' + transform);
  printUsage();
  process.exit(1);
}

const dryRun = args.includes('--dry-run');
const targets = args.filter((a) => !a.startsWith('--'));

if (!targets.length) {
  console.error('Provide at least one file or directory.');
  printUsage();
  process.exit(1);
}

const exts = new Set(['.js', '.jsx', '.ts', '.tsx']);
const ignore = new Set(['node_modules', '.git', 'dist', 'build', 'out']);

const files = [];
function walk(p) {
  const stat = fs.statSync(p);
  if (stat.isDirectory()) {
    if (ignore.has(path.basename(p))) return;
    for (const entry of fs.readdirSync(p)) walk(path.join(p, entry));
    return;
  }
  if (exts.has(path.extname(p))) files.push(p);
}
for (const t of targets) walk(t);

let changed = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  let next;
  try {
    next = runTransformOnSource(transform, src, { path: file });
  } catch (err) {
    console.error('  ERR ' + file + ': ' + err.message);
    continue;
  }
  if (next !== src) {
    if (!dryRun) fs.writeFileSync(file, next);
    changed++;
    console.log((dryRun ? '  PREVIEW ' : '  CHANGED ') + file);
  }
}

console.log('');
console.log(`${transform}: ${changed}/${files.length} files ${dryRun ? 'would change' : 'changed'}`);
process.exit(0);
