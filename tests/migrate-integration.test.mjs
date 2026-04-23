import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { transformSync } from '@babel/core';
import presetReact from '@babel/preset-react';
import { JSDOM } from 'jsdom';

const require = createRequire(import.meta.url);
const { runTransformOnSource } = require('../src/runner.js');
const tsconfigT = require('../src/transforms/tsconfig.js');
const packageJsonT = require('../src/transforms/package-json.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtureDir = path.join(here, '__integration__', 'react-app');

const ORDERED = [
  'useState-to-state',
  'useRef-to-state',
  'useMemo-to-derive',
  'useEffect-to-after',
  'useCallback-remove',
  'useContext-to-context',
  'setState-updater',
  'array-map-to-list',
  'conditional-jsx-to-when',
  'react-imports',
];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src)) {
    const sp = path.join(src, entry);
    const dp = path.join(dst, entry);
    const stat = fs.statSync(sp);
    if (stat.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

function listSourceFiles(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    const stat = fs.statSync(cur);
    if (stat.isDirectory()) {
      for (const e of fs.readdirSync(cur)) stack.push(path.join(cur, e));
    } else if (/\.(jsx?|tsx?)$/.test(cur)) {
      out.push(cur);
    }
  }
  return out;
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
  const previous = new Map();
  const assign = (key, value) => {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  };
  assign('window', dom.window);
  assign('document', dom.window.document);
  assign('Node', dom.window.Node);
  assign('Element', dom.window.Element);
  assign('HTMLElement', dom.window.HTMLElement);
  assign('Text', dom.window.Text);
  assign('Comment', dom.window.Comment);
  assign('DocumentFragment', dom.window.DocumentFragment);
  assign('Event', dom.window.Event);
  assign('MouseEvent', dom.window.MouseEvent);
  assign('CustomEvent', dom.window.CustomEvent);
  return () => {
    dom.window.close();
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete globalThis[key];
      else Object.defineProperty(globalThis, key, value);
    }
  };
}

function mountToBody(node) {
  const root = document.createElement('div');
  document.body.appendChild(root);
  if (node && typeof node.mountInto === 'function') node.mountInto(root, null);
  else if (Array.isArray(node)) {
    for (const item of node) {
      if (item && typeof item.mountInto === 'function') item.mountInto(root, null);
      else if (item instanceof Node) root.appendChild(item);
    }
  } else if (node instanceof Node) root.appendChild(node);
  return root;
}

const jsxRuntimeUrl = pathToFileURL(
  path.resolve(here, '..', 'node_modules', '@granularjs', 'jsx', 'src', 'jsx-runtime.js'),
).href;

function compileFile(srcCode) {
  const out = transformSync(srcCode, {
    babelrc: false,
    configFile: false,
    presets: [[presetReact, { runtime: 'automatic', importSource: '@granularjs/jsx' }]],
    sourceType: 'module',
  });
  return out.code;
}

function corePath() {
  const pkgRoot = path.resolve(here, '..', 'node_modules', '@granularjs', 'core');
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  const main = pkg.module || pkg.main || './dist/granular.min.js';
  return pathToFileURL(path.resolve(pkgRoot, main)).href;
}

function resolveLocalPath(fromFile, rel) {
  let resolved = path.resolve(path.dirname(fromFile), rel);
  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    for (const e of ['.jsx', '.js', '.tsx', '.ts']) {
      if (fs.existsSync(resolved + e)) { resolved += e; return resolved; }
    }
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      for (const idx of ['index.jsx', 'index.js', 'index.tsx', 'index.ts']) {
        const cand = path.join(resolved, idx);
        if (fs.existsSync(cand)) return cand;
      }
    }
  }
  return resolved;
}

async function buildModuleGraph(rootDir) {
  const blobUrlByFile = new Map();
  const visiting = new Set();

  async function loadFile(absPath) {
    if (blobUrlByFile.has(absPath)) return blobUrlByFile.get(absPath);
    if (visiting.has(absPath)) {
      throw new Error('Cyclic import not supported in this test harness: ' + absPath);
    }
    visiting.add(absPath);

    const raw = fs.readFileSync(absPath, 'utf8');
    let code = compileFile(raw);

    const importPaths = [];
    const localImportRe = /from ['"](\.[^'"\n]+)['"]/g;
    code.replace(localImportRe, (m, rel) => { importPaths.push(rel); return m; });

    const childMap = new Map();
    for (const rel of importPaths) {
      const childAbs = resolveLocalPath(absPath, rel);
      const childUrl = await loadFile(childAbs);
      childMap.set(rel, childUrl);
    }

    code = code.replace(/from ['"]@granularjs\/jsx\/jsx-runtime['"]/g, `from '${jsxRuntimeUrl}'`);
    code = code.replace(new RegExp(`from ['"]@granularjs/core['"]`, 'g'), `from '${corePath()}'`);
    code = code.replace(localImportRe, (m, rel) => {
      const url = childMap.get(rel);
      return url ? `from '${url}'` : m;
    });

    const blob = `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;
    blobUrlByFile.set(absPath, blob);
    visiting.delete(absPath);
    return blob;
  }

  const entry = path.join(rootDir, 'src', 'App.jsx');
  const entryUrl = await loadFile(entry);
  return { entryUrl, files: blobUrlByFile };
}

test('migrate integration: end-to-end React → Granular', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'granular-migrate-'));
  copyDir(fixtureDir, tmp);

  const pkgPath = path.join(tmp, 'package.json');
  const pkgRes = packageJsonT(fs.readFileSync(pkgPath, 'utf8'));
  fs.writeFileSync(pkgPath, pkgRes.source);

  const tsconfigPath = path.join(tmp, 'tsconfig.json');
  const tsconfigRes = tsconfigT(fs.readFileSync(tsconfigPath, 'utf8'));
  fs.writeFileSync(tsconfigPath, tsconfigRes.source);

  const viteConfigPath = path.join(tmp, 'vite.config.js');
  const viteSrc = fs.readFileSync(viteConfigPath, 'utf8');
  const viteOut = runTransformOnSource('vite-config', viteSrc, { path: viteConfigPath });
  fs.writeFileSync(viteConfigPath, viteOut);

  const sources = listSourceFiles(path.join(tmp, 'src'));
  for (const transform of ORDERED) {
    for (const file of sources) {
      const src = fs.readFileSync(file, 'utf8');
      const next = runTransformOnSource(transform, src, { path: file });
      if (next !== src) fs.writeFileSync(file, next);
    }
  }

  const counterMigrated = fs.readFileSync(path.join(tmp, 'src', 'Counter.jsx'), 'utf8');
  assert.match(counterMigrated, /from "@granularjs\/core"/);
  assert.match(counterMigrated, /state\(0\)/);
  assert.doesNotMatch(counterMigrated, /useState/);

  const listMigrated = fs.readFileSync(path.join(tmp, 'src', 'List.jsx'), 'utf8');
  assert.match(listMigrated, /list\(items/);
  assert.match(listMigrated, /key:/);

  const tsconfigMigrated = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
  assert.equal(tsconfigMigrated.compilerOptions.jsx, 'react-jsx');
  assert.equal(tsconfigMigrated.compilerOptions.jsxImportSource, '@granularjs/jsx');

  const pkgMigrated = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.equal(pkgMigrated.dependencies['@granularjs/core'], 'latest');
  assert.equal(pkgMigrated.devDependencies['@granularjs/jsx'], 'latest');
  assert.equal(pkgMigrated.dependencies.react, undefined);

  const viteMigrated = fs.readFileSync(viteConfigPath, 'utf8');
  assert.match(viteMigrated, /jsxImportSource/);
  assert.doesNotMatch(viteMigrated, /react\(\)/);

  const restore = installDom();
  try {
    const { entryUrl } = await buildModuleGraph(tmp);
    const appMod = await import(entryUrl);
    const root = mountToBody(appMod.default());

    const appEl = root.querySelector('#app');
    assert.ok(appEl, 'app root mounted');

    const counterBtn = appEl.querySelector('#counter');
    assert.ok(counterBtn, 'counter button rendered');
    assert.equal(counterBtn.textContent.trim(), '0');

    counterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(counterBtn.textContent.trim(), '1');

    counterBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(counterBtn.textContent.trim(), '2');

    const list = appEl.querySelector('#list');
    assert.ok(list, 'list rendered');
    const items = list.querySelectorAll('li');
    assert.equal(items.length, 3);
    assert.equal(items[0].textContent.trim(), 'alpha');
    assert.equal(items[1].textContent.trim(), 'beta');
    assert.equal(items[2].textContent.trim(), 'gamma');
  } finally {
    restore();
  }
});
