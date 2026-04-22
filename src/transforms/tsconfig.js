'use strict';

/**
 * Codemod: tsconfig.json
 *
 *   compilerOptions.jsx           = "react-jsx"
 *   compilerOptions.jsxImportSource = "@granularjs/jsx"
 *
 * Operates on JSON text. Idempotent.
 */

module.exports = function applyTsconfig(source) {
  let json;
  try {
    json = JSON.parse(stripJsonComments(source));
  } catch {
    return { source, changed: false, error: 'Could not parse tsconfig.json (JSONC support not enabled).' };
  }

  json.compilerOptions = json.compilerOptions || {};
  let changed = false;
  if (json.compilerOptions.jsx !== 'react-jsx') {
    json.compilerOptions.jsx = 'react-jsx';
    changed = true;
  }
  if (json.compilerOptions.jsxImportSource !== '@granularjs/jsx') {
    json.compilerOptions.jsxImportSource = '@granularjs/jsx';
    changed = true;
  }
  return { source: JSON.stringify(json, null, 2) + '\n', changed };
};

function stripJsonComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
