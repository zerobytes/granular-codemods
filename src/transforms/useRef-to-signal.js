'use strict';

/**
 * Codemod: React `useRef` → Granular `signal`.
 *
 *   const ref = useRef(null)
 *   ref.current = el
 *   ref.current
 *
 *   becomes
 *
 *   const ref = signal(null)
 *   ref.set(el)
 *   ref.get()
 *
 * Notes:
 *  - Refs used as `<div ref={ref}/>` keep working: the JSX runtime accepts
 *    a Signal and sets it after mount.
 */

const { granularImports, removeReactNamedImport } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const ge = granularImports(j, root);
  let touched = false;

  const refNames = new Set();

  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node;
    if (!node.id || node.id.type !== 'Identifier') return;
    if (!node.init || node.init.type !== 'CallExpression') return;
    if (!isUseRefCall(node.init)) return;

    const initialArg = node.init.arguments[0] || j.identifier('null');
    path.replace(j.variableDeclarator(j.identifier(node.id.name), j.callExpression(j.identifier('signal'), [initialArg])));
    refNames.add(node.id.name);
    ge.add('signal');
    touched = true;
  });

  if (!refNames.size) {
    if (touched) ge.flush();
    return touched ? root.toSource() : file.source;
  }

  root.find(j.MemberExpression, {
    object: { type: 'Identifier' },
    property: { type: 'Identifier', name: 'current' },
    computed: false,
  }).forEach((path) => {
    const objName = path.node.object.name;
    if (!refNames.has(objName)) return;

    const parent = path.parent.node;

    if (parent.type === 'AssignmentExpression' && parent.left === path.node && parent.operator === '=') {
      const exprPath = path.parent;
      exprPath.replace(j.callExpression(
        j.memberExpression(j.identifier(objName), j.identifier('set')),
        [parent.right],
      ));
      touched = true;
      return;
    }

    path.replace(j.callExpression(
      j.memberExpression(j.identifier(objName), j.identifier('get')),
      [],
    ));
    touched = true;
  });

  if (removeReactNamedImport(j, root, 'useRef')) touched = true;

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isUseRefCall(call) {
  if (call.callee.type === 'Identifier' && call.callee.name === 'useRef') return true;
  if (call.callee.type === 'MemberExpression'
    && !call.callee.computed
    && call.callee.property.type === 'Identifier'
    && call.callee.property.name === 'useRef') return true;
  return false;
}
