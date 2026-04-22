'use strict';

/**
 * Codemod: React `useCallback` → unwrap.
 *
 *   const onClick = useCallback(() => doIt(x), [x])
 *     → const onClick = () => doIt(x)
 *
 * Rationale: Granular has no rerender, so memoizing callbacks for child
 * component prop equality is unnecessary.
 */

const { removeReactNamedImport } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let touched = false;

  root.find(j.CallExpression).forEach((path) => {
    if (!isUseCallbackCallee(path.node.callee)) return;
    const args = path.node.arguments;
    if (!args.length) return;
    const fn = args[0];
    if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') return;
    path.replace(fn);
    touched = true;
  });

  if (removeReactNamedImport(j, root, 'useCallback')) touched = true;

  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isUseCallbackCallee(callee) {
  if (callee.type === 'Identifier' && callee.name === 'useCallback') return true;
  if (callee.type === 'MemberExpression'
    && !callee.computed
    && callee.property.type === 'Identifier'
    && callee.property.name === 'useCallback') return true;
  return false;
}
