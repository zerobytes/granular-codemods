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

  // Track variables created from createRoot calls so we can also handle the
  // two-step pattern:
  //   const root = ReactDOM.createRoot(target); root.render(<App/>);
  // The variable declarator stores its mount target so that when we later see
  // root.render(<App/>) we can rewrite it to bootstrap(target, <App/>).
  const rootBindings = new Map(); // identifierName -> { targetExpr, declPath }

  function isCreateRootCallExpr(node) {
    if (!node || node.type !== 'CallExpression') return false;
    const c = node.callee;
    if (c.type === 'Identifier' && c.name === 'createRoot') return true;
    if (c.type === 'MemberExpression' && !c.computed
      && c.property.type === 'Identifier' && c.property.name === 'createRoot') return true;
    return false;
  }

  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node;
    if (!node.id || node.id.type !== 'Identifier') return;
    if (!isCreateRootCallExpr(node.init)) return;
    const target = node.init.arguments[0];
    if (!target) return;
    rootBindings.set(node.id.name, { targetExpr: target, declPath: path });
  });

  root.find(j.CallExpression, {
    callee: { type: 'MemberExpression', property: { type: 'Identifier', name: 'render' } },
  }).forEach((path) => {
    const obj = path.node.callee.object;
    let mountTarget = null;
    let renderable = path.node.arguments[0];
    let consumedRootBinding = null;

    if (obj && obj.type === 'CallExpression' && isCreateRootCallExpr(obj)) {
      // ReactDOM.createRoot(target).render(node) | createRoot(target).render(node)
      mountTarget = obj.arguments[0];
    } else if (obj && obj.type === 'Identifier' && obj.name === 'ReactDOM') {
      // ReactDOM.render(node, target)
      mountTarget = path.node.arguments[1];
    } else if (obj && obj.type === 'Identifier' && rootBindings.has(obj.name)) {
      // Two-step: const root = ReactDOM.createRoot(target); root.render(node);
      const binding = rootBindings.get(obj.name);
      mountTarget = binding.targetExpr;
      consumedRootBinding = obj.name;
    } else {
      return;
    }

    if (!renderable || !mountTarget) return;

    let bootstrapArg = renderable;
    if (renderable.type === 'JSXElement') {
      const opening = renderable.openingElement;
      const hasProps = (opening.attributes || []).length > 0;
      const hasChildren = (renderable.children || []).some(
        (c) => !(c.type === 'JSXText' && /^\s*$/.test(c.value)),
      );
      if (!hasProps && !hasChildren && opening.name && opening.name.type === 'JSXIdentifier') {
        bootstrapArg = j.identifier(opening.name.name);
      } else {
        bootstrapArg = j.arrowFunctionExpression([], renderable);
      }
    }

    path.replace(j.callExpression(j.identifier('bootstrap'), [bootstrapArg, mountTarget]));
    ge.add('bootstrap');
    touched = true;

    if (consumedRootBinding) {
      const binding = rootBindings.get(consumedRootBinding);
      const declParent = binding.declPath.parent && binding.declPath.parent.node;
      if (declParent && declParent.type === 'VariableDeclaration' && declParent.declarations.length === 1) {
        j(binding.declPath.parent).remove();
      } else {
        j(binding.declPath).remove();
      }
    }
  });

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';
