import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { runTransformOnSource } = require('../../src/runner.js');
const jscodeshift = require('jscodeshift');

const here = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(here, '..', '__testfixtures__');

const SKIP_KEYS = new Set([
  'loc',
  'start',
  'end',
  'range',
  'tokens',
  'comments',
  'leadingComments',
  'trailingComments',
  'innerComments',
  'extra',
  'raw',
  'rawValue',
  '__clone',
]);

function structuralEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!structuralEqual(a[i], b[i])) return false;
    return true;
  }
  if (typeof a !== 'object') return false;
  const ka = Object.keys(a).filter((k) => !SKIP_KEYS.has(k) && a[k] !== undefined);
  const kb = Object.keys(b).filter((k) => !SKIP_KEYS.has(k) && b[k] !== undefined);
  if (ka.length !== kb.length) return false;
  ka.sort();
  kb.sort();
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return false;
  for (const k of ka) if (!structuralEqual(a[k], b[k])) return false;
  return true;
}

function parseAst(source) {
  const j = jscodeshift.withParser('tsx');
  return j(source).get().node;
}

function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
}

export function defineFixtureTests(transformName) {
  const dir = join(fixturesRoot, transformName);
  let entries;
  try { entries = readdirSync(dir); } catch { entries = []; }

  const inputs = entries.filter((f) => /\.input\.(jsx|tsx|js|ts)$/.test(f));
  if (!inputs.length) {
    test(`${transformName}: (no fixtures)`, () => assert.ok(true));
    return;
  }

  for (const inputFile of inputs) {
    const ext = inputFile.match(/\.input\.(jsx|tsx|js|ts)$/)[1];
    const baseName = inputFile.replace(/\.input\.(jsx|tsx|js|ts)$/, '');
    const outputFile = `${baseName}.output.${ext}`;
    const inputPath = join(dir, inputFile);
    const outputPath = join(dir, outputFile);

    test(`${transformName}: ${baseName}`, () => {
      const inputSrc = readFileSync(inputPath, 'utf8');
      const expected = readFileSync(outputPath, 'utf8');
      const actual = runTransformOnSource(transformName, inputSrc, { path: inputPath });

      if (normalize(actual) === normalize(expected)) return;

      let actualAst, expectedAst;
      try {
        actualAst = parseAst(actual);
        expectedAst = parseAst(expected);
      } catch (err) {
        assert.fail(`Could not parse output for ${baseName}: ${err.message}\n=== ACTUAL ===\n${actual}`);
      }

      if (!structuralEqual(actualAst, expectedAst)) {
        const diff = `\n=== EXPECTED ===\n${expected}\n=== ACTUAL ===\n${actual}\n`;
        assert.fail(`Fixture mismatch (AST) for ${baseName}\n${diff}`);
      }
    });
  }
}
