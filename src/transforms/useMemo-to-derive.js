'use strict';

/**
 * Codemod: React `useMemo` → Granular `derive`.
 *
 *   const total = useMemo(() => a + b, [a, b])
 *
 *   becomes
 *
 *   const total = derive(() => a + b)
 *
 * Notes:
 *  - The dependency array is dropped: Granular's `derive` auto-tracks which
 *    reactive sources were read in the callback.
 *  - If the callback body explicitly does `a.get()` / `b.get()`, it stays
 *    as-is. If it reads bare identifiers that map to signals, no `.get()`
 *    is injected (the codemod cannot prove they are reactive without
 *    cross-file analysis); the granular linter will flag missing `.get()`
 *    afterwards if needed.
 */

const { granularImports, removeReactNamedImport } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const ge = granularImports(j, root);
  let touched = false;

  root.find(j.CallExpression).forEach((path) => {
    const callee = path.node.callee;
    if (!isUseMemoCallee(callee)) return;
    const args = path.node.arguments;
    if (!args.length) return;
    const fn = args[0];
    if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') return;

    path.replace(j.callExpression(j.identifier('derive'), [fn]));
    ge.add('derive');
    touched = true;
  });

  if (removeReactNamedImport(j, root, 'useMemo')) touched = true;

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isUseMemoCallee(callee) {
  if (callee.type === 'Identifier' && callee.name === 'useMemo') return true;
  if (callee.type === 'MemberExpression'
    && !callee.computed
    && callee.property.type === 'Identifier'
    && callee.property.name === 'useMemo') return true;
  return false;
}
