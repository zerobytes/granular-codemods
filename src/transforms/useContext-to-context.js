'use strict';

/**
 * Codemod: React Context API → Granular Context API.
 *
 *   import { createContext, useContext } from 'react';
 *   const Ctx = createContext(defaultValue);
 *
 *   <Ctx.Provider value={x}>{children}</Ctx.Provider>
 *
 *   const v = useContext(Ctx);
 *
 *   becomes
 *
 *   import { context } from '@granularjs/core';
 *   const Ctx = context(defaultValue);
 *
 *   Ctx.scope(x).serve(<>{children}</>)
 *
 *   const v = Ctx.state();
 *
 * Notes:
 *  - The provider value shape may need manual reshaping. In React it's typical
 *    to pass {state, setState}. In Granular, the same value is exposed via
 *    Ctx.state() with reactive sub-paths, so passing signals as values works,
 *    but consumers usually want raw reactive values (signals or computed
 *    properties). A TODO comment is added so the developer can review.
 */

const { granularImports, removeReactNamedImport } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const ge = granularImports(j, root);
  let touched = false;

  root.find(j.CallExpression).forEach((path) => {
    if (!isCreateContextCallee(path.node.callee)) return;
    path.node.callee = j.identifier('context');
    ge.add('context');
    touched = true;
  });

  root.find(j.CallExpression).forEach((path) => {
    if (!isUseContextCallee(path.node.callee)) return;
    const args = path.node.arguments;
    if (args.length !== 1 || args[0].type !== 'Identifier') return;
    path.replace(
      j.callExpression(
        j.memberExpression(
          j.callExpression(j.memberExpression(args[0], j.identifier('state')), []),
          j.identifier('get'),
        ),
        [],
      ),
    );
    touched = true;
  });

  root.find(j.JSXElement).forEach((path) => {
    const opening = path.node.openingElement;
    if (!opening) return;
    const name = opening.name;
    if (!name || name.type !== 'JSXMemberExpression') return;
    if (!name.property || name.property.name !== 'Provider') return;

    const ctxObject = jsxNameToExpression(j, name.object);
    if (!ctxObject) return;

    const valueAttr = (opening.attributes || []).find((a) => a.type === 'JSXAttribute' && a.name && a.name.name === 'value');
    let valueExpr = j.identifier('undefined');
    if (valueAttr && valueAttr.value) {
      if (valueAttr.value.type === 'JSXExpressionContainer') valueExpr = valueAttr.value.expression;
      else if (valueAttr.value.type === 'StringLiteral' || valueAttr.value.type === 'Literal') valueExpr = valueAttr.value;
    }

    const children = (path.node.children || []).filter((c) => !(c.type === 'JSXText' && /^\s*$/.test(c.value)));

    let serveArg;
    if (children.length === 0) {
      serveArg = j.nullLiteral();
    } else if (children.length === 1) {
      const only = children[0];
      if (only.type === 'JSXExpressionContainer') {
        serveArg = only.expression;
      } else {
        serveArg = only;
      }
    } else {
      serveArg = j.jsxFragment(
        j.jsxOpeningFragment(),
        j.jsxClosingFragment(),
        children,
      );
    }

    const replacement = j.callExpression(
      j.memberExpression(
        j.callExpression(j.memberExpression(ctxObject, j.identifier('scope')), [valueExpr]),
        j.identifier('serve'),
      ),
      [serveArg],
    );

    const parent = path.parent && path.parent.node;
    if (parent && parent.type === 'JSXExpressionContainer') {
      path.parent.replace(j.jsxExpressionContainer(replacement));
    } else if (parent && (parent.type === 'JSXElement' || parent.type === 'JSXFragment')) {
      path.replace(j.jsxExpressionContainer(replacement));
    } else {
      path.replace(replacement);
    }
    touched = true;
  });

  if (removeReactNamedImport(j, root, 'useContext')) touched = true;
  if (removeReactNamedImport(j, root, 'createContext')) touched = true;

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isUseContextCallee(callee) {
  if (callee.type === 'Identifier' && callee.name === 'useContext') return true;
  if (callee.type === 'MemberExpression'
    && !callee.computed
    && callee.property.type === 'Identifier'
    && callee.property.name === 'useContext') return true;
  return false;
}

function isCreateContextCallee(callee) {
  if (callee.type === 'Identifier' && callee.name === 'createContext') return true;
  if (callee.type === 'MemberExpression'
    && !callee.computed
    && callee.property.type === 'Identifier'
    && callee.property.name === 'createContext') return true;
  return false;
}

function jsxNameToExpression(j, node) {
  if (!node) return null;
  if (node.type === 'JSXIdentifier') return j.identifier(node.name);
  if (node.type === 'JSXMemberExpression') {
    const obj = jsxNameToExpression(j, node.object);
    if (!obj) return null;
    return j.memberExpression(obj, j.identifier(node.property.name));
  }
  return null;
}
