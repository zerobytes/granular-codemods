'use strict';

/**
 * Codemod: React `useEffect` → Granular `after(...).change(fn)` or one-shot run.
 *
 *   useEffect(() => { ... }, [a, b])
 *     → after(a, b).change(() => { ... })
 *
 *   useEffect(() => { ... }, [])
 *     → // Run once: just call the function (or queue a microtask)
 *       (() => { ... })()
 *
 *   useEffect(() => { ... })
 *     → // No deps means "after every render" in React.
 *       // In Granular there is no rerender; this becomes a one-time call
 *       // with a TODO comment for the developer to revisit.
 *
 * Cleanup functions returned from the callback are preserved as-is (the
 * developer must tie cleanup to component unmount manually for now — this
 * is a known migration gap that the report flags).
 */

const { granularImports, removeReactNamedImport } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const ge = granularImports(j, root);
  let touched = false;

  root.find(j.CallExpression).forEach((path) => {
    if (!isUseEffectCallee(path.node.callee)) return;
    const args = path.node.arguments;
    if (!args.length) return;
    const fn = args[0];
    if (fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionExpression') return;

    const deps = args[1];

    if (deps && deps.type === 'ArrayExpression') {
      if (deps.elements.length === 0) {
        const callOnce = j.expressionStatement(j.callExpression(fn, []));
        addLeadingComment(callOnce, ' TODO[granular-codemod]: useEffect with empty deps. In Granular this runs once at construction; if you need a mount-time hook, attach to the parent renderable lifecycle.');
        replaceStatement(j, path, callOnce);
        touched = true;
        return;
      }

      const validDeps = deps.elements.filter(Boolean);
      if (!validDeps.length) return;
      ge.add('after');

      const newCall = j.callExpression(
        j.memberExpression(
          j.callExpression(j.identifier('after'), validDeps),
          j.identifier('change'),
        ),
        [fn],
      );
      replaceStatement(j, path, j.expressionStatement(newCall));
      touched = true;
      return;
    }

    const callOnce = j.expressionStatement(j.callExpression(fn, []));
    addLeadingComment(callOnce, ' TODO[granular-codemod]: useEffect without deps. Granular has no rerender concept. Re-evaluate whether this should run once, on a specific reactive change, or be removed.');
    replaceStatement(j, path, callOnce);
    touched = true;
  });

  if (removeReactNamedImport(j, root, 'useEffect')) touched = true;
  if (removeReactNamedImport(j, root, 'useLayoutEffect')) touched = true;

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isUseEffectCallee(callee) {
  if (callee.type === 'Identifier' && (callee.name === 'useEffect' || callee.name === 'useLayoutEffect')) return true;
  if (callee.type === 'MemberExpression'
    && !callee.computed
    && callee.property.type === 'Identifier'
    && (callee.property.name === 'useEffect' || callee.property.name === 'useLayoutEffect')) return true;
  return false;
}

function replaceStatement(j, callPath, replacement) {
  const stmt = closestStatement(callPath);
  if (!stmt) {
    callPath.replace(replacement.expression || replacement);
    return;
  }
  stmt.replace(replacement);
}

function closestStatement(path) {
  let p = path;
  while (p) {
    if (p.node && /Statement$/.test(p.node.type)) return p;
    p = p.parent;
  }
  return null;
}

function addLeadingComment(node, text) {
  node.comments = node.comments || [];
  node.comments.push({ type: 'Line', value: text, leading: true, trailing: false });
}
