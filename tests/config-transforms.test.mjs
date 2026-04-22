import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { defineFixtureTests } from './helpers/fixture-test.mjs';

const require = createRequire(import.meta.url);
const applyTsconfig = require('../src/transforms/tsconfig.js');
const applyPackageJson = require('../src/transforms/package-json.js');

defineFixtureTests('vite-config');

test('tsconfig: sets jsx and jsxImportSource', () => {
  const input = JSON.stringify({ compilerOptions: { jsx: 'preserve' } }, null, 2);
  const { source, changed } = applyTsconfig(input);
  assert.equal(changed, true);
  const parsed = JSON.parse(source);
  assert.equal(parsed.compilerOptions.jsx, 'react-jsx');
  assert.equal(parsed.compilerOptions.jsxImportSource, '@granularjs/jsx');
});

test('tsconfig: idempotent on already-converted', () => {
  const already = JSON.stringify(
    { compilerOptions: { jsx: 'react-jsx', jsxImportSource: '@granularjs/jsx' } },
    null,
    2,
  );
  const { changed } = applyTsconfig(already);
  assert.equal(changed, false);
});

test('tsconfig: handles missing compilerOptions', () => {
  const { source, changed } = applyTsconfig('{}');
  assert.equal(changed, true);
  const parsed = JSON.parse(source);
  assert.equal(parsed.compilerOptions.jsx, 'react-jsx');
  assert.equal(parsed.compilerOptions.jsxImportSource, '@granularjs/jsx');
});

test('package.json: removes react and adds granular', () => {
  const input = JSON.stringify({
    name: 'app',
    dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0', lodash: '^4.0.0' },
    devDependencies: { '@vitejs/plugin-react': '^4.0.0', vite: '^5.0.0' },
  }, null, 2);
  const { source, changed } = applyPackageJson(input, { coreVersion: '1.0.0', jsxVersion: '1.0.0' });
  assert.equal(changed, true);
  const parsed = JSON.parse(source);
  assert.equal(parsed.dependencies.react, undefined);
  assert.equal(parsed.dependencies['react-dom'], undefined);
  assert.equal(parsed.dependencies.lodash, '^4.0.0');
  assert.equal(parsed.dependencies['@granularjs/core'], '1.0.0');
  assert.equal(parsed.devDependencies['@vitejs/plugin-react'], undefined);
  assert.equal(parsed.devDependencies.vite, '^5.0.0');
  assert.equal(parsed.devDependencies['@granularjs/jsx'], '1.0.0');
});

test('package.json: idempotent if already migrated', () => {
  const already = JSON.stringify({
    name: 'app',
    dependencies: { '@granularjs/core': 'latest' },
    devDependencies: { '@granularjs/jsx': 'latest' },
  }, null, 2);
  const { changed } = applyPackageJson(already);
  assert.equal(changed, false);
});
