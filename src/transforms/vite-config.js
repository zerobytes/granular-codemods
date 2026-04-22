'use strict';

/**
 * Codemod: vite.config.{js,ts}
 *
 *  - Removes `import react from '@vitejs/plugin-react'`.
 *  - Removes `react()` from the `plugins` array.
 *  - Adds `esbuild: { jsx: 'automatic', jsxImportSource: '@granularjs/jsx' }`
 *    to the config object.
 */

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let touched = false;

  root.find(j.ImportDeclaration).forEach((path) => {
    const src = path.node.source.value;
    if (src === '@vitejs/plugin-react' || src === '@vitejs/plugin-react-swc') {
      j(path).remove();
      touched = true;
    }
  });

  root.find(j.CallExpression, { callee: { type: 'Identifier', name: 'defineConfig' } }).forEach((path) => {
    const cfgArg = path.node.arguments[0];
    let cfgObj = null;
    if (cfgArg && cfgArg.type === 'ObjectExpression') {
      cfgObj = cfgArg;
    } else if (cfgArg && cfgArg.type === 'ArrowFunctionExpression') {
      const body = cfgArg.body;
      if (body.type === 'ObjectExpression') cfgObj = body;
    }
    if (!cfgObj) return;
    if (mutateConfigObject(j, cfgObj)) touched = true;
  });

  root.find(j.ExportDefaultDeclaration).forEach((path) => {
    const arg = path.node.declaration;
    if (!arg) return;
    if (arg.type === 'ObjectExpression') {
      if (mutateConfigObject(j, arg)) touched = true;
    }
  });

  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isProp(p) {
  return p && (p.type === 'Property' || p.type === 'ObjectProperty');
}

function propKeyMatches(p, name) {
  if (!isProp(p) || !p.key) return false;
  return p.key.name === name || p.key.value === name;
}

function mkProperty(j, key, value) {
  if (typeof j.objectProperty === 'function') return j.objectProperty(key, value);
  return j.property('init', key, value);
}

function mutateConfigObject(j, obj) {
  let changed = false;

  const pluginsProp = obj.properties.find((p) => propKeyMatches(p, 'plugins'));
  if (pluginsProp && pluginsProp.value.type === 'ArrayExpression') {
    const before = pluginsProp.value.elements.length;
    pluginsProp.value.elements = pluginsProp.value.elements.filter((el) => {
      if (!el) return true;
      if (el.type === 'CallExpression' && el.callee.type === 'Identifier' && el.callee.name === 'react') return false;
      return true;
    });
    if (pluginsProp.value.elements.length !== before) changed = true;
  }

  let esbuildProp = obj.properties.find((p) => propKeyMatches(p, 'esbuild'));
  if (!esbuildProp) {
    esbuildProp = mkProperty(j, j.identifier('esbuild'), j.objectExpression([
      mkProperty(j, j.identifier('jsx'), j.literal('automatic')),
      mkProperty(j, j.identifier('jsxImportSource'), j.literal('@granularjs/jsx')),
    ]));
    obj.properties.push(esbuildProp);
    changed = true;
  } else if (esbuildProp.value.type === 'ObjectExpression') {
    const inner = esbuildProp.value;
    const ensure = (key, value) => {
      const existing = inner.properties.find((p) => propKeyMatches(p, key));
      if (!existing) {
        inner.properties.push(mkProperty(j, j.identifier(key), j.literal(value)));
        changed = true;
      } else if (existing.value.type === 'Literal' || existing.value.type === 'StringLiteral') {
        if (existing.value.value !== value) {
          existing.value = j.literal(value);
          changed = true;
        }
      }
    };
    ensure('jsx', 'automatic');
    ensure('jsxImportSource', '@granularjs/jsx');
  }

  return changed;
}
