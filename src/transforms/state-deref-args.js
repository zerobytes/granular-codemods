'use strict';

/**
 * Codemod: peek reactive identifiers (via `resolve(...)`) when they are
 * consumed in primitive contexts (function-call positional arguments to
 * non-Granular callees, strict equality comparisons, ternary/if conditions,
 * `!` and truthy/coalesce operators).
 *
 * Why `resolve(...)` and not `.get()`:
 *   Some reactive bindings we track (splitArgs `rawProps`, `list(...)`
 *   callback parameters, `useXxx` hook destructures) are *not* guaranteed
 *   to be reactive at runtime — a caller can pass plain literals too. So we
 *   use Granular's universal peek helper `resolve(value)` which returns the
 *   underlying value when given any reactive source and the value as-is for
 *   primitives/plain objects. This is always safe, no matter what the
 *   caller actually passed.
 *
 * Why:
 *   In Granular, `state(...)` and state-paths are *reactive proxies*, not
 *   their underlying values. They are objects, so:
 *     - `state === 'foo'`        → always false (object !== string)
 *     - `removeTodo(todo.id)`    → passes the proxy, store does
 *                                  `t.id !== id` and never matches
 *     - `mode || 'light'`        → always returns mode (object is truthy)
 *     - `editing ? A : B`        → always picks A
 *
 *   Granular consumers (`when`, `derive`, `after`, `before`, `list`,
 *   `subscribe`, `match`, `compute`, `change`, `effect`, `scope`, `serve`,
 *   …) handle proxies natively, so we leave those untouched. Component
 *   calls (PascalCase callee) keep proxies too — that's how reactive props
 *   propagate down the tree.
 *
 * What counts as a reactive identifier:
 *   - LHS of `state(...)`, `signal(...)`, `derive(...)`,
 *     `observableArray(...)`, `computed(...)`
 *   - destructured names under `splitArgs(args).rawProps` or
 *     `splitArgs(args, defaults).rawProps`
 *   - parameters of `list(arr, (item, idx) => ...)` callbacks
 *   - destructured names from `useContext(...)` or `Xxx.state().get()`
 *     (same-file context consumption)
 *   - destructured names (or whole binding) from any `useXxx(...)` custom
 *     hook call. The `use*` convention is universal in React/Granular and
 *     these wrappers almost always return reactive values. We exclude the
 *     well-known React built-in hooks (which our other codemods rewrite).
 *
 * Per-occurrence rules:
 *   - skip if the expression is the callee of a CallExpression
 *   - skip JSX expression containers (`{state}` is the idiomatic reactive
 *     binding) and JSX attributes (`<X foo={state} />`)
 *   - skip when the immediate parent is a Granular reactive consumer call
 *     OR a PascalCase component call
 *   - skip when already followed by `.get()` (no double-wrap)
 *   - otherwise wrap the topmost member chain rooted at the reactive
 *     identifier with `.get()`
 */

const REACTIVE_FN_CALLEES = new Set([
  'when',
  'match',
  'derive',
  'after',
  'before',
  'list',
  'subscribe',
  'observe',
  'state',
  'signal',
  'observableArray',
  'computed',
  'tpl',
  'cls',
  'context',
]);

const REACTIVE_METHOD_NAMES = new Set([
  'compute',
  'change',
  'effect',
  'subscribe',
  'scope',
  'serve',
  'mount',
  'before',
  'after',
]);

const REACTIVE_SOURCE_CONSTRUCTORS = new Set([
  'state',
  'signal',
  'derive',
  'observableArray',
  'computed',
]);

const STATE_API_PROPS = new Set(['get', 'set', 'patch', 'subscribe', 'before', 'mutate']);

const REACT_BUILTIN_HOOKS = new Set([
  'useState',
  'useEffect',
  'useLayoutEffect',
  'useInsertionEffect',
  'useMemo',
  'useCallback',
  'useRef',
  'useReducer',
  'useContext',
  'useImperativeHandle',
  'useDebugValue',
  'useId',
  'useTransition',
  'useDeferredValue',
  'useSyncExternalStore',
]);

function isCustomUseHookCallee(callee) {
  if (!callee) return false;
  if (callee.type !== 'Identifier') return false;
  const name = callee.name;
  if (!/^use[A-Z]/.test(name)) return false;
  if (REACT_BUILTIN_HOOKS.has(name)) return false;
  return true;
}

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);

  const reactiveIds = collectReactiveIds(j, root);
  if (reactiveIds.size === 0) return file.source;

  let touched = false;

  const reactiveBindings = collectReactiveBindings(j, root, reactiveIds);

  root.find(j.Identifier).forEach((path) => {
    const name = path.node.name;
    if (!reactiveIds.has(name)) return;
    if (!isVariableReference(path)) return;
    if (isShadowedByLocalScope(path, name, reactiveBindings)) return;

    const topPath = walkUpMemberChain(path);

    if (isAlreadyGetAccess(topPath)) return;
    if (isInsideGetterCall(topPath)) return;
    if (isAlreadyResolved(topPath)) return;

    const parent = topPath.parent && topPath.parent.node;
    if (!shouldUnwrap(topPath.node, parent, topPath)) return;

    const replacement = j.callExpression(j.identifier('resolve'), [topPath.node]);
    topPath.replace(replacement);
    touched = true;
  });

  if (touched) ensureResolveImport(j, root);

  return touched ? root.toSource() : file.source;
};

function isAlreadyResolved(topPath) {
  const parent = topPath.parent && topPath.parent.node;
  if (!parent) return false;
  if (
    (parent.type === 'CallExpression' || parent.type === 'OptionalCallExpression')
    && parent.callee
    && parent.callee.type === 'Identifier'
    && parent.callee.name === 'resolve'
    && Array.isArray(parent.arguments)
    && parent.arguments[0] === topPath.node
  ) return true;
  return false;
}

function ensureResolveImport(j, root) {
  const granularImports = root.find(j.ImportDeclaration, {
    source: { value: '@granularjs/core' },
  });

  if (granularImports.size() > 0) {
    const decl = granularImports.at(0).get();
    const specs = decl.node.specifiers || [];
    const has = specs.some(s => s.type === 'ImportSpecifier' && s.imported && s.imported.name === 'resolve');
    if (!has) {
      decl.node.specifiers = [
        ...specs,
        j.importSpecifier(j.identifier('resolve')),
      ];
    }
    return;
  }

  const newImport = j.importDeclaration(
    [j.importSpecifier(j.identifier('resolve'))],
    j.literal('@granularjs/core'),
  );
  const body = root.get().node.program.body;
  let insertIdx = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i].type === 'ImportDeclaration') insertIdx = i + 1;
    else break;
  }
  body.splice(insertIdx, 0, newImport);
}

/**
 * Track the AST nodes that *originally* introduced each reactive name. We
 * compare those nodes by identity (via the path chain) so we can detect
 * when a use site is actually shadowed by a closer-in function/catch
 * parameter or block-scoped declaration that happens to share the name.
 */
function collectReactiveBindings(j, root, reactiveIds) {
  const bindings = new Map();
  for (const name of reactiveIds) bindings.set(name, new Set());

  function record(name, node) {
    if (!name || !reactiveIds.has(name) || !node) return;
    bindings.get(name).add(node);
  }

  root.find(j.VariableDeclarator).forEach((p) => {
    walkPattern(p.node.id, (id) => record(id.name, id));
  });

  root.find(j.CallExpression, { callee: { type: 'Identifier', name: 'list' } }).forEach((p) => {
    const cb = p.node.arguments && p.node.arguments[1];
    if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) return;
    for (const param of cb.params || []) {
      walkPattern(param, (id) => record(id.name, id));
    }
  });

  return bindings;
}

function walkPattern(node, visit) {
  if (!node) return;
  switch (node.type) {
    case 'Identifier':
      visit(node);
      return;
    case 'ObjectPattern':
      for (const p of node.properties || []) {
        if (p.type === 'RestElement') walkPattern(p.argument, visit);
        else walkPattern(p.value, visit);
      }
      return;
    case 'ArrayPattern':
      for (const el of node.elements || []) walkPattern(el, visit);
      return;
    case 'AssignmentPattern':
      walkPattern(node.left, visit);
      return;
    case 'RestElement':
      walkPattern(node.argument, visit);
      return;
  }
}

function isShadowedByLocalScope(idPath, name, reactiveBindings) {
  // Walk up looking for a closer binding that shares `name`. If we find one
  // before reaching one of the recorded reactive declarations, the use is
  // shadowed and we must not rewrite it.
  const allowedBindingNodes = reactiveBindings.get(name);
  if (!allowedBindingNodes || allowedBindingNodes.size === 0) return false;

  let cur = idPath.parent;
  while (cur) {
    const node = cur.node;
    if (!node) { cur = cur.parent; continue; }

    if (
      node.type === 'FunctionDeclaration'
      || node.type === 'FunctionExpression'
      || node.type === 'ArrowFunctionExpression'
    ) {
      if (Array.isArray(node.params)) {
        for (const param of node.params) {
          let isOurOriginal = false;
          let shadowing = false;
          walkPattern(param, (id) => {
            if (id.name !== name) return;
            if (allowedBindingNodes.has(id)) isOurOriginal = true;
            else shadowing = true;
          });
          if (isOurOriginal) return false;
          if (shadowing) return true;
        }
      }
    }

    if (node.type === 'CatchClause' && node.param) {
      let isOurOriginal = false;
      let shadowing = false;
      walkPattern(node.param, (id) => {
        if (id.name !== name) return;
        if (allowedBindingNodes.has(id)) isOurOriginal = true;
        else shadowing = true;
      });
      if (isOurOriginal) return false;
      if (shadowing) return true;
    }

    if (node.type === 'BlockStatement' || node.type === 'Program') {
      for (const stmt of node.body || []) {
        if (stmt.type !== 'VariableDeclaration') continue;
        for (const decl of stmt.declarations || []) {
          let isOurOriginal = false;
          let shadowing = false;
          walkPattern(decl.id, (id) => {
            if (id.name !== name) return;
            if (allowedBindingNodes.has(id)) isOurOriginal = true;
            else shadowing = true;
          });
          if (isOurOriginal) return false;
          if (shadowing) return true;
        }
      }
    }

    cur = cur.parent;
  }

  return false;
}

module.exports.parser = 'tsx';

function collectReactiveIds(j, root) {
  const ids = new Set();

  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node;
    if (!node.init) return;

    if (
      node.init.type === 'CallExpression'
      && node.init.callee
      && node.init.callee.type === 'Identifier'
      && REACTIVE_SOURCE_CONSTRUCTORS.has(node.init.callee.name)
      && node.id.type === 'Identifier'
    ) {
      ids.add(node.id.name);
      return;
    }

    if (
      node.init.type === 'CallExpression'
      && node.init.callee
      && node.init.callee.type === 'MemberExpression'
      && !node.init.callee.computed
      && node.init.callee.property
      && node.init.callee.property.type === 'Identifier'
      && node.init.callee.property.name === 'compute'
      && node.id.type === 'Identifier'
    ) {
      ids.add(node.id.name);
      return;
    }

    if (
      node.init.type === 'CallExpression'
      && node.init.callee
      && node.init.callee.type === 'Identifier'
      && node.init.callee.name === 'splitArgs'
      && node.id.type === 'ObjectPattern'
    ) {
      collectSplitArgsRawProps(node.id, ids);
      return;
    }

    if (
      node.init.type === 'CallExpression'
      && node.init.callee
      && node.init.callee.type === 'Identifier'
      && node.init.callee.name === 'useContext'
      && node.id.type === 'ObjectPattern'
    ) {
      collectObjectPatternIds(node.id, ids);
      return;
    }

    if (
      node.init.type === 'CallExpression'
      && isContextStateGetCall(node.init)
      && node.id.type === 'ObjectPattern'
    ) {
      collectObjectPatternIds(node.id, ids);
      return;
    }

    if (
      node.init.type === 'CallExpression'
      && isCustomUseHookCallee(node.init.callee)
    ) {
      if (node.id.type === 'ObjectPattern') {
        collectObjectPatternIds(node.id, ids);
      } else if (node.id.type === 'Identifier') {
        ids.add(node.id.name);
      }
      return;
    }
  });

  root.find(j.CallExpression, { callee: { type: 'Identifier', name: 'list' } }).forEach((path) => {
    const args = path.node.arguments;
    if (!args || args.length < 2) return;
    const cb = args[1];
    if (!cb || (cb.type !== 'ArrowFunctionExpression' && cb.type !== 'FunctionExpression')) return;
    for (const param of cb.params || []) {
      if (param.type === 'Identifier') ids.add(param.name);
      else if (param.type === 'AssignmentPattern' && param.left.type === 'Identifier') ids.add(param.left.name);
    }
  });

  return ids;
}

function isContextStateGetCall(callExpr) {
  const callee = callExpr.callee;
  if (!callee || callee.type !== 'MemberExpression' || callee.computed) return false;
  if (!callee.property || callee.property.type !== 'Identifier' || callee.property.name !== 'get') return false;
  const inner = callee.object;
  if (!inner || inner.type !== 'CallExpression') return false;
  const innerCallee = inner.callee;
  if (!innerCallee || innerCallee.type !== 'MemberExpression' || innerCallee.computed) return false;
  if (!innerCallee.property || innerCallee.property.type !== 'Identifier' || innerCallee.property.name !== 'state') return false;
  return true;
}

function collectSplitArgsRawProps(objectPattern, ids) {
  for (const prop of objectPattern.properties || []) {
    const key = prop.key;
    const value = prop.value;
    if (!key || (key.type !== 'Identifier' || key.name !== 'rawProps')) continue;
    if (!value || value.type !== 'ObjectPattern') continue;
    collectObjectPatternIds(value, ids);
  }
}

function collectObjectPatternIds(objectPattern, ids) {
  for (const prop of objectPattern.properties || []) {
    if (prop.type === 'RestElement' && prop.argument && prop.argument.type === 'Identifier') {
      ids.add(prop.argument.name);
      continue;
    }
    const value = prop.value;
    if (!value) continue;
    if (value.type === 'Identifier') ids.add(value.name);
    else if (value.type === 'AssignmentPattern' && value.left.type === 'Identifier') ids.add(value.left.name);
    else if (value.type === 'ObjectPattern') collectObjectPatternIds(value, ids);
  }
}

function isVariableReference(idPath) {
  const parent = idPath.parent && idPath.parent.node;
  if (!parent) return true;
  if ((parent.type === 'MemberExpression' || parent.type === 'OptionalMemberExpression')
    && parent.property === idPath.node && !parent.computed) return false;
  if ((parent.type === 'Property' || parent.type === 'ObjectProperty')
    && parent.key === idPath.node && !parent.computed && !parent.shorthand) return false;
  if (parent.type === 'JSXAttribute' && parent.name === idPath.node) return false;
  if ((parent.type === 'JSXOpeningElement' || parent.type === 'JSXClosingElement') && parent.name === idPath.node) return false;
  if (parent.type === 'VariableDeclarator' && parent.id === idPath.node) return false;
  if (parent.type === 'ImportSpecifier' || parent.type === 'ImportDefaultSpecifier' || parent.type === 'ImportNamespaceSpecifier') return false;
  if (parent.type === 'ExportSpecifier') return false;
  if ((parent.type === 'FunctionDeclaration' || parent.type === 'FunctionExpression' || parent.type === 'ArrowFunctionExpression') && parent.id === idPath.node) return false;
  if (parent.type === 'LabeledStatement' && parent.label === idPath.node) return false;
  if (parent.type === 'BreakStatement' || parent.type === 'ContinueStatement') return false;
  if (parent.type === 'CatchClause' && parent.param === idPath.node) return false;
  return true;
}

function walkUpMemberChain(path) {
  let cur = path;
  while (
    cur.parent
    && (cur.parent.node.type === 'MemberExpression' || cur.parent.node.type === 'OptionalMemberExpression')
    && cur.parent.node.object === cur.node
  ) {
    cur = cur.parent;
  }
  return cur;
}

function isAlreadyGetAccess(topPath) {
  // topPath.node is a MemberExpression whose property is `get` and we are
  // looking at it because the next thing is calling `.get()`.
  const node = topPath.node;
  if (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') return false;
  if (!node.property || node.property.type !== 'Identifier') return false;
  if (!STATE_API_PROPS.has(node.property.name)) return false;
  // It's `state.get` (or .set/.subscribe/etc.) — leave it.
  return true;
}

function isInsideGetterCall(topPath) {
  const parent = topPath.parent && topPath.parent.node;
  if (!parent) return false;
  if ((parent.type === 'CallExpression' || parent.type === 'OptionalCallExpression')
    && parent.callee === topPath.node) return true;
  return false;
}

function shouldUnwrap(currentNode, parent, topPath) {
  if (!parent) return false;

  if (parent.type === 'JSXExpressionContainer') return false;
  if (parent.type === 'JSXAttribute') return false;
  if (parent.type === 'JSXSpreadAttribute') return false;
  if (parent.type === 'JSXSpreadChild') return false;

  if (parent.type === 'CallExpression' || parent.type === 'OptionalCallExpression' || parent.type === 'NewExpression') {
    if (parent.callee === currentNode) return false;
    if (!Array.isArray(parent.arguments) || !parent.arguments.includes(currentNode)) return false;
    if (isReactiveConsumerCall(parent)) return false;
    if (isComponentCall(parent)) return false;
    return true;
  }

  if (parent.type === 'BinaryExpression') {
    if (['===', '!==', '==', '!='].includes(parent.operator)) return true;
    return false;
  }

  if (parent.type === 'ConditionalExpression') {
    if (parent.test === currentNode) return true;
    return false;
  }

  if (parent.type === 'UnaryExpression' && parent.operator === '!') return true;

  if (parent.type === 'LogicalExpression') {
    return true;
  }

  if (parent.type === 'IfStatement' && parent.test === currentNode) return true;
  if (parent.type === 'WhileStatement' && parent.test === currentNode) return true;
  if (parent.type === 'DoWhileStatement' && parent.test === currentNode) return true;
  if (parent.type === 'ForStatement' && parent.test === currentNode) return true;

  if (parent.type === 'ReturnStatement' || parent.type === 'ThrowStatement') return false;
  if (parent.type === 'AssignmentExpression') return false;

  if (parent.type === 'SpreadElement') {
    const grand = topPath.parent.parent && topPath.parent.parent.node;
    if (!grand) return false;
    if (grand.type === 'ArrayExpression') return true;
    if (grand.type === 'CallExpression' || grand.type === 'NewExpression') {
      if (isReactiveConsumerCall(grand)) return false;
      if (isComponentCall(grand)) return false;
      return true;
    }
    return false;
  }

  return false;
}

function isReactiveConsumerCall(callExpr) {
  const callee = callExpr.callee;
  if (!callee) return false;
  if (callee.type === 'Identifier' && REACTIVE_FN_CALLEES.has(callee.name)) return true;
  if (
    callee.type === 'MemberExpression'
    && !callee.computed
    && callee.property
    && callee.property.type === 'Identifier'
    && REACTIVE_METHOD_NAMES.has(callee.property.name)
  ) return true;
  return false;
}

function isComponentCall(callExpr) {
  const callee = callExpr.callee;
  if (!callee) return false;
  if (callee.type === 'Identifier') return /^[A-Z]/.test(callee.name);
  if (callee.type === 'MemberExpression' && !callee.computed && callee.property && callee.property.type === 'Identifier') {
    return /^[A-Z]/.test(callee.property.name);
  }
  return false;
}
