'use strict';

/**
 * Codemod: cleanup of `react` and `react-dom` imports after the other
 * codemods have done their work.
 *
 *  - Removes `import React from 'react'` and `import * as React from 'react'`.
 *  - Removes the whole `import { ... } from 'react'` if all named specifiers
 *    have already been removed by other codemods.
 *  - Removes `import { createRoot } from 'react-dom/client'` and other
 *    `react-dom` imports.
 *  - Replaces `createRoot(el).render(<App/>)` calls with `bootstrap(el, <App/>)`
 *    from `@granularjs/core`.
 *  - Replaces `ReactDOM.render(<App/>, el)` calls similarly.
 */

const { granularImports } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const ge = granularImports(j, root);
  let touched = false;

  root.find(j.ImportDeclaration).forEach((path) => {
    const src = path.node.source.value;
    if (src !== 'react' && !src.startsWith('react-dom')) return;
    const remaining = (path.node.specifiers || []).filter((s) => {
      if (s.type === 'ImportDefaultSpecifier') return false;
      if (s.type === 'ImportNamespaceSpecifier') return false;
      return true;
    });
    if (src === 'react') {
      if (remaining.length === 0) {
        j(path).remove();
        touched = true;
      } else {
        path.node.specifiers = remaining;
        touched = true;
      }
    } else {
      j(path).remove();
      touched = true;
    }
  });

  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression', property: { type: 'Identifier', name: 'render' } },
  }).forEach((path) => {
    const obj = path.node.callee.object;
    let target = null;
    let renderable = path.node.arguments[0];
    let mountTarget = path.node.arguments[1];

    if (obj && obj.type === 'CallExpression' && obj.callee.type === 'Identifier' && obj.callee.name === 'createRoot') {
      target = obj.arguments[0];
      mountTarget = target;
    } else if (obj && obj.type === 'Identifier' && obj.name === 'ReactDOM') {
      // ReactDOM.render(node, target) — args order: renderable, target
    } else if (obj && obj.type === 'MemberExpression' && obj.property.name === 'createRoot') {
      const cr = path.node.callee.object;
      if (cr.type === 'CallExpression') {
        target = cr.arguments[0];
        mountTarget = target;
      }
    } else {
      return;
    }

    if (!renderable) return;
    if (!mountTarget) return;

    path.replace(j.callExpression(j.identifier('bootstrap'), [mountTarget, renderable]));
    ge.add('bootstrap');
    touched = true;
  });

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';
