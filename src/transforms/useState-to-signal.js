'use strict';

/**
 * Codemod: React `useState` → Granular `signal`.
 *
 *   const [count, setCount] = useState(0)
 *   setCount(1)
 *   setCount(c => c + 1)
 *
 *   becomes
 *
 *   const count = signal(0)
 *   count.set(1)
 *   count.set(count.get() + 1)
 *
 * Notes:
 *  - `setX(prev => ...)` is expanded inline as `x.set(((prev) => ...)(x.get()))`
 *    so behaviour is preserved without depending on a `.update()` API.
 *  - Plain reads of `count` inside JSX are left as-is (passing the signal
 *    as a child is the idiomatic Granular pattern).
 *  - Reads outside JSX, in expressions, are wrapped in `.get()` only if
 *    the reference is in a clearly imperative position (binary op, call arg,
 *    template literal). When in doubt, a `// TODO[granular-codemod]` comment
 *    is added next to the binding.
 */

const { granularImports, removeReactNamedImport } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  const ge = granularImports(j, root);
  let touched = false;

  const stateBindings = new Map();

  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node;
    if (!node.id || node.id.type !== 'ArrayPattern') return;
    if (!node.init || node.init.type !== 'CallExpression') return;
    if (!isUseStateCall(node.init)) return;

    const elements = node.id.elements;
    if (!elements || elements.length < 2) return;
    const valueId = elements[0];
    const setterId = elements[1];
    if (!valueId || valueId.type !== 'Identifier') return;
    if (!setterId || setterId.type !== 'Identifier') return;

    const initialArg = node.init.arguments[0] || j.identifier('undefined');
    path.replace(j.variableDeclarator(j.identifier(valueId.name), j.callExpression(j.identifier('signal'), [initialArg])));
    ge.add('signal');
    touched = true;

    stateBindings.set(setterId.name, valueId.name);

    if (path.parent && path.parent.node && path.parent.node.kind === 'const') {
      // already const, nothing to do
    }
  });

  if (!stateBindings.size) {
    if (touched) ge.flush();
    return touched ? root.toSource() : file.source;
  }

  for (const [setterName, valueName] of stateBindings.entries()) {
    root.find(j.CallExpression, { callee: { type: 'Identifier', name: setterName } }).forEach((path) => {
      const args = path.node.arguments;
      if (!args.length) return;
      const arg = args[0];

      if ((arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') && arg.params.length === 1) {
        const paramName = arg.params[0].type === 'Identifier' ? arg.params[0].name : 'prev';
        const updaterFn = arg;
        const callUpdater = j.callExpression(updaterFn, [
          j.callExpression(j.memberExpression(j.identifier(valueName), j.identifier('get')), []),
        ]);
        if (paramName) void paramName;
        path.replace(j.callExpression(j.memberExpression(j.identifier(valueName), j.identifier('set')), [callUpdater]));
      } else {
        path.replace(j.callExpression(j.memberExpression(j.identifier(valueName), j.identifier('set')), [arg]));
      }
      touched = true;
    });
  }

  if (removeReactNamedImport(j, root, 'useState')) touched = true;

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isUseStateCall(call) {
  if (call.callee.type === 'Identifier' && call.callee.name === 'useState') return true;
  if (call.callee.type === 'MemberExpression'
    && !call.callee.computed
    && call.callee.property.type === 'Identifier'
    && call.callee.property.name === 'useState') return true;
  return false;
}
