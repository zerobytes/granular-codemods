'use strict';

/**
 * Codemod: `arr.map((x) => <Row key={x.id}/>)` → `list(arr, (x) => <Row/>, { key: (x) => x.id })`
 *
 * Targets only `.map()` calls whose callback returns a JSX expression and
 * whose target is a bare identifier (so we can reliably detect "renders a
 * collection"). Cases that don't match (e.g. `arr.map(...).filter(...)`)
 * are left alone with a TODO.
 */

const { granularImports } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const ge = granularImports(j, root);
  let touched = false;

  root.find(j.CallExpression).forEach((path) => {
    const callee = path.node.callee;
    if (!callee || callee.type !== 'MemberExpression') return;
    if (callee.computed) return;
    if (callee.property.type !== 'Identifier' || callee.property.name !== 'map') return;
    if (callee.object.type !== 'Identifier') return;

    const args = path.node.arguments;
    if (args.length === 0) return;
    const fn = args[0];
    if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') return;

    const returned = getReturnedExpression(fn);
    if (!returned) return;
    if (returned.type !== 'JSXElement' && returned.type !== 'JSXFragment') return;

    const itemParam = fn.params[0];
    const itemName = itemParam && itemParam.type === 'Identifier' ? itemParam.name : null;

    let keyExpr = null;
    if (returned.type === 'JSXElement') {
      const opening = returned.openingElement;
      const keyAttrIndex = (opening.attributes || []).findIndex((a) => a.type === 'JSXAttribute' && a.name.name === 'key');
      if (keyAttrIndex !== -1) {
        const keyAttr = opening.attributes[keyAttrIndex];
        if (keyAttr.value && keyAttr.value.type === 'JSXExpressionContainer') {
          keyExpr = keyAttr.value.expression;
        } else if (keyAttr.value && keyAttr.value.type === 'StringLiteral') {
          keyExpr = j.literal(keyAttr.value.value);
        }
        opening.attributes.splice(keyAttrIndex, 1);
      }
    }

    const listArgs = [callee.object, fn];
    if (keyExpr && itemName) {
      const keyFn = j.arrowFunctionExpression(
        [j.identifier(itemName)],
        keyExpr,
      );
      listArgs.push(j.objectExpression([
        j.property('init', j.identifier('key'), keyFn),
      ]));
    }

    path.replace(j.callExpression(j.identifier('list'), listArgs));
    ge.add('list');
    touched = true;
  });

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function getReturnedExpression(fn) {
  if (fn.body.type !== 'BlockStatement') return fn.body;
  for (const stmt of fn.body.body) {
    if (stmt.type === 'ReturnStatement' && stmt.argument) return stmt.argument;
  }
  return null;
}
