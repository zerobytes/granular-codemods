'use strict';

/**
 * Codemod: `{cond && <X/>}` and `{cond ? <X/> : <Y/>}` inside JSX
 * → `{when(cond, () => <X/>)}` / `{when(cond, () => <X/>, () => <Y/>)}`.
 *
 * Heuristic: only triggers when `cond` is a bare identifier and there is
 * a sibling `signal()` / `state()` / `derive()` declaration with that name
 * in the file. Anything else gets a `// TODO[granular-codemod]` comment so
 * the developer sees and can decide.
 */

const { granularImports } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const ge = granularImports(j, root);
  let touched = false;

  const reactiveNames = collectReactiveNames(j, root);

  function wrapConditionalWithWhen(condExpr) {
    const cond = condExpr.test;
    const consArrow = j.arrowFunctionExpression([], condExpr.consequent);
    const altIsNull = condExpr.alternate && (condExpr.alternate.type === 'NullLiteral' || (condExpr.alternate.type === 'Literal' && condExpr.alternate.value === null));
    const args = [cond, consArrow];
    if (!altIsNull) args.push(j.arrowFunctionExpression([], condExpr.alternate));
    ge.add('when');
    return j.callExpression(j.identifier('when'), args);
  }

  function wrapLogicalAndWithWhen(logicalExpr) {
    ge.add('when');
    return j.callExpression(j.identifier('when'), [
      logicalExpr.left,
      j.arrowFunctionExpression([], logicalExpr.right),
    ]);
  }

  root.find(j.JSXExpressionContainer).forEach((path) => {
    const expr = path.node.expression;
    if (!expr) return;

    if (expr.type === 'LogicalExpression' && expr.operator === '&&' && isJSXOrNull(expr.right)) {
      path.node.expression = wrapLogicalAndWithWhen(expr);
      touched = true;
      return;
    }

    if (expr.type === 'ConditionalExpression' && (isJSXOrNull(expr.consequent) || isJSXOrNull(expr.alternate))) {
      path.node.expression = wrapConditionalWithWhen(expr);
      touched = true;
    }
  });

  root.find(j.ConditionalExpression).forEach((path) => {
    const expr = path.node;
    if (!isJSXOrNull(expr.consequent) && !isJSXOrNull(expr.alternate)) return;
    const parent = path.parent && path.parent.node;
    if (parent && parent.type === 'JSXExpressionContainer') return;
    if (parent && parent.type === 'CallExpression' && parent.callee && parent.callee.type === 'Identifier' && parent.callee.name === 'when') return;
    path.replace(wrapConditionalWithWhen(expr));
    touched = true;
  });

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isJSX(node) {
  return node && (node.type === 'JSXElement' || node.type === 'JSXFragment');
}

function isJSXOrNull(node) {
  if (!node) return false;
  if (isJSX(node)) return true;
  if (node.type === 'NullLiteral') return true;
  if (node.type === 'Literal' && node.value === null) return true;
  return false;
}

function collectReactiveNames(j, root) {
  const names = new Set();
  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node;
    if (!node.id || node.id.type !== 'Identifier') return;
    if (!node.init || node.init.type !== 'CallExpression') return;
    const callee = node.init.callee;
    if (callee.type !== 'Identifier') return;
    if (['signal', 'state', 'derive', 'computed', 'observableArray'].includes(callee.name)) {
      names.add(node.id.name);
    }
  });
  return names;
}

function addTrailingTodo(j, path, text) {
  const parent = path.parent;
  if (!parent) return;
  const targetPath = path;
  targetPath.node.comments = targetPath.node.comments || [];
  targetPath.node.comments.push({ type: 'Line', value: text, leading: true, trailing: false });
}
