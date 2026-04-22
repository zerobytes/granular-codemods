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

  root.find(j.JSXExpressionContainer).forEach((path) => {
    const expr = path.node.expression;

    if (!expr) return;

    if (expr.type === 'LogicalExpression' && expr.operator === '&&') {
      if (!isJSX(expr.right)) return;
      const cond = expr.left;
      if (cond.type !== 'Identifier') {
        addTrailingTodo(j, path, ' TODO[granular-codemod]: complex truthy short-circuit. Wrap in when(cond, () => <X/>) manually.');
        return;
      }
      if (!reactiveNames.has(cond.name)) {
        addTrailingTodo(j, path, ` TODO[granular-codemod]: '${cond.name}' is not a known reactive source in this file. If it is reactive, replace this expression with when(${cond.name}, () => <X/>).`);
        return;
      }
      path.node.expression = j.callExpression(j.identifier('when'), [
        cond,
        j.arrowFunctionExpression([], expr.right),
      ]);
      ge.add('when');
      touched = true;
      return;
    }

    if (expr.type === 'ConditionalExpression') {
      if (!isJSX(expr.consequent) || !isJSX(expr.alternate)) return;
      const cond = expr.test;
      if (cond.type !== 'Identifier' || !reactiveNames.has(cond.name)) {
        addTrailingTodo(j, path, ' TODO[granular-codemod]: ternary with JSX branches. Wrap in when(cond, () => <A/>, () => <B/>).');
        return;
      }
      path.node.expression = j.callExpression(j.identifier('when'), [
        cond,
        j.arrowFunctionExpression([], expr.consequent),
        j.arrowFunctionExpression([], expr.alternate),
      ]);
      ge.add('when');
      touched = true;
    }
  });

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isJSX(node) {
  return node && (node.type === 'JSXElement' || node.type === 'JSXFragment');
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
