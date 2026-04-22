'use strict';

/**
 * Codemod: residual `setX(prev => ...)` updater patterns
 * → `x.set(((prev) => ...)(x.get()))`.
 *
 * This is a safety net: the main `useState-to-signal` transform already
 * handles updater forms. Run this AFTER `useState-to-signal` only if you
 * have hand-written code that still uses the React `setX(prev => ...)`
 * style with bindings whose name is a Granular signal.
 *
 * Heuristic: any call where the callee is `Identifier` named `setX` and the
 * arg is an arrow with a single param. This codemod only runs if a sibling
 * `const x = signal(...)` declaration exists in the same scope.
 */

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let touched = false;

  const signalNames = new Set();
  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node;
    if (!node.id || node.id.type !== 'Identifier') return;
    if (!node.init || node.init.type !== 'CallExpression') return;
    if (node.init.callee.type === 'Identifier' && node.init.callee.name === 'signal') {
      signalNames.add(node.id.name);
    }
  });

  if (!signalNames.size) return file.source;

  root.find(j.CallExpression, { callee: { type: 'Identifier' } }).forEach((path) => {
    const callee = path.node.callee;
    const setterName = callee.name;
    if (!/^set[A-Z]/.test(setterName)) return;
    const candidate = setterName.charAt(3).toLowerCase() + setterName.slice(4);
    if (!signalNames.has(candidate)) return;

    const args = path.node.arguments;
    if (args.length !== 1) return;
    const arg = args[0];
    if (arg.type !== 'ArrowFunctionExpression' && arg.type !== 'FunctionExpression') return;
    if (arg.params.length !== 1) return;

    path.replace(j.callExpression(
      j.memberExpression(j.identifier(candidate), j.identifier('set')),
      [j.callExpression(arg, [
        j.callExpression(j.memberExpression(j.identifier(candidate), j.identifier('get')), []),
      ])],
    ));
    touched = true;
  });

  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';
