'use strict';

/**
 * Codemod: React `useState` → Granular `state`.
 *
 *   const [count, setCount] = useState(0)
 *   setCount(1)
 *   setCount(c => c + 1)
 *
 *   becomes
 *
 *   const count = state(0)
 *   count.set(1)
 *   count.set(((c) => c + 1)(count.get()))
 *
 * Notes:
 *  - `setX(prev => ...)` is expanded inline as `x.set(((prev) => ...)(x.get()))`
 *    so behaviour is preserved without depending on a `.update()` API.
 *  - Plain reads of `count` inside JSX are left as-is (passing the state proxy
 *    as a child is the idiomatic Granular pattern; it coerces to its current
 *    value via toString/valueOf and tracks reads).
 *  - When the React setter (e.g. `setCount`) survives as an object property
 *    shorthand or as a passed-down prop after the call sites are rewritten,
 *    the shorthand is expanded to `setCount: count.set` so consumers keep a
 *    callable that sets the state. Loose identifier references that we can't
 *    safely rewrite get a `// TODO[granular-codemod]` annotation.
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

    let initialArg = node.init.arguments[0] || j.identifier('undefined');
    if ((initialArg.type === 'ArrowFunctionExpression' || initialArg.type === 'FunctionExpression') && (!initialArg.params || initialArg.params.length === 0)) {
      initialArg = j.callExpression(initialArg, []);
    }
    path.replace(j.variableDeclarator(j.identifier(valueId.name), j.callExpression(j.identifier('state'), [initialArg])));
    ge.add('state');
    touched = true;

    stateBindings.set(setterId.name, valueId.name);
  });

  if (!stateBindings.size) {
    if (touched) ge.flush();
    return touched ? root.toSource() : file.source;
  }

  const STATE_API_PROPS = new Set(['get', 'set', 'patch', 'subscribe', 'before', 'mutate']);
  const stateValueNames = new Set(stateBindings.values());

  for (const valueName of stateValueNames) {
    root.find(j.CallExpression).forEach((path) => {
      const callee = path.node.callee;
      if (!callee || callee.type !== 'MemberExpression') return;
      if (callee.computed) return;
      if (!callee.object || callee.object.type !== 'Identifier' || callee.object.name !== valueName) return;
      if (!callee.property || callee.property.type !== 'Identifier') return;
      if (STATE_API_PROPS.has(callee.property.name)) return;
      callee.object = j.callExpression(
        j.memberExpression(j.identifier(valueName), j.identifier('get')),
        [],
      );
      touched = true;
    });
  }

  for (const [setterName, valueName] of stateBindings.entries()) {
    root.find(j.CallExpression, { callee: { type: 'Identifier', name: setterName } }).forEach((path) => {
      const args = path.node.arguments;
      if (!args.length) return;
      const arg = args[0];

      if ((arg.type === 'ArrowFunctionExpression' || arg.type === 'FunctionExpression') && arg.params.length === 1) {
        const updaterFn = arg;
        const callUpdater = j.callExpression(updaterFn, [
          j.callExpression(j.memberExpression(j.identifier(valueName), j.identifier('get')), []),
        ]);
        path.replace(j.callExpression(j.memberExpression(j.identifier(valueName), j.identifier('set')), [callUpdater]));
      } else {
        path.replace(j.callExpression(j.memberExpression(j.identifier(valueName), j.identifier('set')), [arg]));
      }
      touched = true;
    });
  }

  for (const [setterName, valueName] of stateBindings.entries()) {
    root
      .find(j.Identifier, { name: setterName })
      .forEach((path) => {
        const parent = path.parent && path.parent.node;
        if (!parent) return;

        if ((parent.type === 'CallExpression' || parent.type === 'NewExpression') && parent.callee === path.node) return;
        if ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression') && parent.property === path.node && !parent.computed) return;
        if (parent.type === 'VariableDeclarator' && parent.id === path.node) return;
        if (parent.type === 'ImportSpecifier' && (parent.imported === path.node || parent.local === path.node)) return;
        if (parent.type === 'ImportDefaultSpecifier' && parent.local === path.node) return;
        if (parent.type === 'ImportNamespaceSpecifier' && parent.local === path.node) return;
        if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') && parent.id === path.node) return;
        if (parent.type === 'LabeledStatement' && parent.label === path.node) return;
        if (parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return;
        if (parent.type === 'ExportSpecifier' && (parent.exported === path.node || parent.local === path.node)) return;
        if (parent.type === 'JSXAttribute' && parent.name === path.node) return;
        if (parent.type === 'JSXOpeningElement' && parent.name === path.node) return;
        if (parent.type === 'JSXClosingElement' && parent.name === path.node) return;
        if (parent.type === 'TSTypeReference' || parent.type === 'TSQualifiedName') return;

        const wrappedSetter = () => j.arrowFunctionExpression(
          [j.identifier('v')],
          j.callExpression(j.memberExpression(j.identifier(valueName), j.identifier('set')), [j.identifier('v')]),
        );

        if (parent.type === 'Property' || parent.type === 'ObjectProperty') {
          if (parent.key === path.node && !parent.computed && !parent.shorthand) return;
          if (parent.shorthand && parent.key === path.node) {
            const isObjectPattern = path.parent.parent && path.parent.parent.node && path.parent.parent.node.type === 'ObjectPattern';
            if (isObjectPattern) return;
            const expanded = parent.type === 'Property'
              ? j.property('init', j.identifier(setterName), wrappedSetter())
              : j.objectProperty(j.identifier(setterName), wrappedSetter());
            expanded.shorthand = false;
            path.parent.replace(expanded);
            touched = true;
            return;
          }
        }

        if (parent.type === 'AssignmentExpression' && parent.left === path.node) return;
        if (parent.type === 'UpdateExpression' && parent.argument === path.node) return;

        path.replace(wrappedSetter());
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
