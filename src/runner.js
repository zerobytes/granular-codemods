'use strict';

/**
 * In-process runner for the JS/TSX codemods (no separate child process).
 *
 *   const { runTransformOnSource } = require('@granularjs/codemods/runner');
 *   const out = await runTransformOnSource('useState-to-state', src, { path: 'foo.tsx' });
 *
 * The runner uses jscodeshift's programmatic API.
 */

const path = require('path');
const fs = require('fs');
const jscodeshift = require('jscodeshift');

const TRANSFORM_DIR = path.join(__dirname, 'transforms');

function loadTransform(name) {
  const file = path.join(TRANSFORM_DIR, name + '.js');
  if (!fs.existsSync(file)) throw new Error(`Unknown transform: ${name}`);
  delete require.cache[require.resolve(file)];
  return require(file);
}

function pickParser(transform, filePath) {
  if (typeof transform === 'function' && transform.parser) return transform.parser;
  if (filePath && /\.tsx?$/.test(filePath)) return 'tsx';
  return 'tsx';
}

function runTransformOnSource(name, source, opts = {}) {
  const transform = loadTransform(name);
  const parser = pickParser(transform, opts.path);
  const j = jscodeshift.withParser(parser);
  const api = {
    j,
    jscodeshift: j,
    stats: () => {},
    report: () => {},
  };
  const fileInfo = { path: opts.path || '<source>', source };
  const result = transform(fileInfo, api, opts.options || {});
  if (typeof result === 'string') return result;
  return source;
}

const TRANSFORMS = [
  'useState-to-state',
  'useRef-to-state',
  'useMemo-to-derive',
  'useEffect-to-after',
  'useCallback-remove',
  'useContext-to-context',
  'setState-updater',
  'array-map-to-list',
  'conditional-jsx-to-when',
  'react-router-to-granular',
  'react-namespace',
  'react-component-to-variadic',
  'react-imports',
  'state-deref-args',
  'vite-config',
];

function listTransforms() {
  return TRANSFORMS.slice();
}

module.exports = { runTransformOnSource, loadTransform, listTransforms };
