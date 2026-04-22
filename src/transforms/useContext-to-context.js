'use strict';

/**
 * Codemod: React `useContext(Ctx)` → Granular `Ctx.state()`.
 *
 *   const value = useContext(Ctx)
 *
 *   becomes
 *
 *   const value = Ctx.state()
 *
 * Caveats:
 *  - This assumes `Ctx` was already converted from `React.createContext` to
 *    `context()` (handled by a separate transform). When that's the case,
 *    `Ctx.state()` is the consumer hook in Granular.
 *  - Does NOT touch `<Ctx.Provider value={x}>` blocks; that requires
 *    rewriting the JSX to `Ctx.scope(value).serve(<children/>)`. A TODO
 *    comment is added to provider sites.
 */

const { removeReactNamedImport } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let touched = false;

  root.find(j.CallExpression).forEach((path) => {
    if (!isUseContextCallee(path.node.callee)) return;
    const args = path.node.arguments;
    if (args.length !== 1 || args[0].type !== 'Identifier') return;
    path.replace(j.callExpression(j.memberExpression(args[0], j.identifier('state')), []));
    touched = true;
  });

  root
    .find(j.JSXOpeningElement)
    .forEach((path) => {
      const name = path.node.name;
      if (name.type !== 'JSXMemberExpression') return;
      if (name.property.name !== 'Provider') return;

      addLeadingComment(path.parent.node, ' TODO[granular-codemod]: <Ctx.Provider value={x}>...</Ctx.Provider> needs to become Ctx.scope(x).serve(<children/>) at the JSX level. Manual fix required.');
      touched = true;
    });

  if (removeReactNamedImport(j, root, 'useContext')) touched = true;
  if (removeReactNamedImport(j, root, 'createContext')) touched = true;

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

function addLeadingComment(node, text) {
  node.comments = node.comments || [];
  node.comments.push({ type: 'Line', value: text, leading: true, trailing: false });
}
