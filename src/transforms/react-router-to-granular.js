'use strict';

/**
 * Codemod: react-router-dom → @granularjs/core router.
 *
 * Handles these patterns (anything more advanced gets a TODO comment):
 *
 *   <HashRouter>            →  mode: 'hash'
 *   <BrowserRouter>         →  mode: 'history'
 *
 *   <Routes>                                                routes: [
 *     <Route path="/" element={<Layout/>}>                    {
 *       <Route index element={<Home/>}/>                       path: '/',
 *       <Route path="about" element={<About/>}/>               layout: Layout,
 *     </Route>                                                 children: [
 *   </Routes>                                                    { path: '',      page: Home },
 *                                                                { path: 'about', page: About },
 *                                                              ],
 *                                                            },
 *                                                          ]
 *
 * The component that contained the router JSX gets rewritten so its body just
 * calls `router.mount(parent)`. Its signature changes from `() => JSX` to
 * `(parent) => router.mount(parent)`. A `TODO[granular-codemod]` banner is
 * added explaining how to wrap providers.
 *
 * For files that use `useNavigate`/`<Outlet/>` (typically layout files):
 *
 *   const navigate = useNavigate();   →   const navigate = (to) => router.navigate(to);
 *   <Outlet />                        →   {outlet}     (and `outlet` becomes a parameter)
 *
 * `useParams`/`useLocation` get a TODO comment because their replacement is
 * route-config-specific.
 *
 * The `react-router-dom` (or `react-router`) import is removed entirely; the
 * `package-json` codemod removes the dependency from package.json.
 *
 * Limitations:
 *  - Only one router per file.
 *  - The `router` instance is exported from the file containing <HashRouter>.
 *    Other files that need it import from `<TODO_RESOLVE>` and the user must
 *    fix the path. We can't infer cross-file paths.
 */

const ROUTER_PKGS = new Set(['react-router-dom', 'react-router']);

const { granularImports } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let touched = false;

  const importedSpecs = new Map();
  const routerImportPaths = [];
  root.find(j.ImportDeclaration).forEach((p) => {
    if (!ROUTER_PKGS.has(p.node.source.value)) return;
    routerImportPaths.push(p);
    for (const s of p.node.specifiers || []) {
      if (s.type === 'ImportSpecifier') {
        importedSpecs.set(s.imported.name, s.local.name);
      } else if (s.type === 'ImportDefaultSpecifier' || s.type === 'ImportNamespaceSpecifier') {
        importedSpecs.set('*', s.local.name);
      }
    }
  });
  if (!importedSpecs.size) return file.source;

  const ge = granularImports(j, root);

  const localOf = (importedName) => importedSpecs.get(importedName);

  function isLocalJSXName(node, importedName) {
    if (!node) return false;
    const local = localOf(importedName);
    if (!local) return false;
    if (node.type === 'JSXIdentifier') return node.name === local;
    return false;
  }

  function jsxChildElements(parent) {
    return (parent.children || []).filter((c) => c && c.type === 'JSXElement');
  }

  function getAttr(el, name) {
    const attrs = el.openingElement?.attributes || [];
    for (const a of attrs) {
      if (a.type === 'JSXAttribute' && a.name && a.name.name === name) return a;
    }
    return null;
  }

  function attrStringValue(attr) {
    if (!attr) return null;
    const v = attr.value;
    if (!v) return '';
    if (v.type === 'StringLiteral' || v.type === 'Literal') return v.value;
    if (v.type === 'JSXExpressionContainer' && v.expression.type === 'Literal') return v.expression.value;
    return null;
  }

  function attrJsxElementValue(attr) {
    if (!attr) return null;
    const v = attr.value;
    if (v && v.type === 'JSXExpressionContainer' && v.expression && v.expression.type === 'JSXElement') {
      return v.expression;
    }
    return null;
  }

  function elementToComponentIdentifier(el) {
    const name = el.openingElement.name;
    if (name.type === 'JSXIdentifier') return j.identifier(name.name);
    return null;
  }

  function buildRouteObject(routeEl) {
    const indexAttr = getAttr(routeEl, 'index');
    const pathAttr = getAttr(routeEl, 'path');
    const elementAttr = getAttr(routeEl, 'element');

    const isIndex = !!indexAttr;
    const pathRaw = attrStringValue(pathAttr);
    const elementJsx = attrJsxElementValue(elementAttr);

    const props = [];
    const pathStr = isIndex ? '' : (typeof pathRaw === 'string' ? pathRaw : '');
    props.push(j.property('init', j.identifier('path'), j.literal(pathStr)));

    const childRoutes = jsxChildElements(routeEl).filter((c) => isLocalJSXName(c.openingElement.name, 'Route'));
    const componentId = elementJsx ? elementToComponentIdentifier(elementJsx) : null;

    if (childRoutes.length > 0) {
      if (componentId) {
        props.push(j.property('init', j.identifier('layout'), componentId));
      }
      const childArr = j.arrayExpression(childRoutes.map(buildRouteObject));
      props.push(j.property('init', j.identifier('children'), childArr));
    } else if (componentId) {
      props.push(j.property('init', j.identifier('page'), componentId));
    } else if (elementJsx) {
      props.push(j.property('init', j.identifier('page'), j.literal('TODO_INLINE_ELEMENT')));
    }

    return j.objectExpression(props);
  }

  function attributesToObjectExpression(attrs) {
    const props = [];
    for (const a of attrs || []) {
      if (a.type === 'JSXAttribute' && a.name && a.name.type === 'JSXIdentifier') {
        const key = j.identifier(a.name.name);
        let val;
        if (!a.value) val = j.literal(true);
        else if (a.value.type === 'StringLiteral' || a.value.type === 'Literal') val = j.literal(a.value.value);
        else if (a.value.type === 'JSXExpressionContainer') val = a.value.expression;
        else val = j.literal(true);
        const prop = j.property('init', key, val);
        prop.shorthand = false;
        props.push(prop);
      } else if (a.type === 'JSXSpreadAttribute') {
        props.push(j.spreadElement(a.argument));
      }
    }
    return j.objectExpression(props);
  }

  let routerMode = null;
  let routesArrayExpr = null;
  let containerFunctionPath = null;
  let routerJsxPath = null;
  let providerChain = [];

  root.find(j.JSXElement).forEach((path) => {
    if (routerJsxPath) return;
    const opening = path.node.openingElement;
    if (!opening) return;
    let mode = null;
    if (isLocalJSXName(opening.name, 'HashRouter')) mode = 'hash';
    else if (isLocalJSXName(opening.name, 'BrowserRouter')) mode = 'history';
    else if (isLocalJSXName(opening.name, 'MemoryRouter')) mode = 'memory';
    else return;

    const routesEl = jsxChildElements(path.node).find((c) => isLocalJSXName(c.openingElement.name, 'Routes'));
    if (!routesEl) return;

    const routeEls = jsxChildElements(routesEl).filter((c) => isLocalJSXName(c.openingElement.name, 'Route'));
    if (!routeEls.length) return;

    routerMode = mode;
    routesArrayExpr = j.arrayExpression(routeEls.map(buildRouteObject));
    routerJsxPath = path;

    let cur = path.parent;
    while (cur && cur.parent) {
      const node = cur.node;
      if (node && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression')) {
        containerFunctionPath = cur;
        break;
      }
      if (node && node.type === 'JSXElement') {
        const op = node.openingElement;
        if (op && op.name && op.name.type === 'JSXIdentifier' && /^[A-Z]/.test(op.name.name)) {
          providerChain.push({
            name: op.name.name,
            attributes: op.attributes || [],
          });
        }
      }
      cur = cur.parent;
    }
  });

  if (routerJsxPath && routesArrayExpr) {
    ge.add('createRouter');

    const routerDecl = j.variableDeclaration('const', [
      j.variableDeclarator(
        j.identifier('router'),
        j.callExpression(j.identifier('createRouter'), [
          j.objectExpression([
            j.property('init', j.identifier('mode'), j.literal(routerMode)),
            j.property('init', j.identifier('routes'), routesArrayExpr),
          ]),
        ]),
      ),
    ]);

    const exportRouter = j.exportNamedDeclaration(routerDecl, []);
    addLeadingComment(exportRouter, ' TODO[granular-codemod]: routes and `mode` were inferred from <Router>/<Routes>/<Route>. Verify them.');

    const body = root.get().node.program.body;
    let insertAt = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i].type === 'ImportDeclaration') insertAt = i + 1;
      else break;
    }
    body.splice(insertAt, 0, exportRouter);

    if (containerFunctionPath) {
      const fn = containerFunctionPath.node;
      const newParams = [j.identifier('parent')];

      let inner = j.newExpression(j.identifier('RouterOutlet'), [j.identifier('router')]);
      ge.add('RouterOutlet');

      for (let i = 0; i < providerChain.length; i++) {
        const p = providerChain[i];
        const propsObj = attributesToObjectExpression(p.attributes);
        inner = j.callExpression(j.identifier(p.name), [propsObj, inner]);
      }

      const stmts = [];
      if (providerChain.length > 0) {
        const treeDecl = j.variableDeclaration('const', [
          j.variableDeclarator(j.identifier('tree'), inner),
        ]);
        addLeadingComment(treeDecl, ' Provider chain wraps the router. Each provider is a renderable that pushes its scope onto the context stack while its children mount.');
        stmts.push(treeDecl);
        stmts.push(
          j.expressionStatement(
            j.callExpression(j.memberExpression(j.identifier('tree'), j.identifier('mountInto')), [
              j.identifier('parent'),
              j.literal(null),
            ]),
          ),
        );
      } else {
        stmts.push(
          j.expressionStatement(
            j.callExpression(j.memberExpression(j.identifier('router'), j.identifier('mount')), [j.identifier('parent')]),
          ),
        );
      }

      const newBody = j.blockStatement(stmts);
      if (fn.type === 'ArrowFunctionExpression') {
        const replacement = j.arrowFunctionExpression(newParams, newBody, fn.async);
        containerFunctionPath.replace(replacement);
      } else if (fn.type === 'FunctionDeclaration') {
        fn.params = newParams;
        fn.body = newBody;
      } else if (fn.type === 'FunctionExpression') {
        fn.params = newParams;
        fn.body = newBody;
      }
    } else {
      routerJsxPath.replace(j.jsxText(''));
    }

    touched = true;
  }

  let needsRouterImport = false;

  root.find(j.CallExpression, { callee: { type: 'Identifier', name: localOf('useNavigate') || '___none___' } }).forEach((path) => {
    needsRouterImport = true;
    const arrow = j.arrowFunctionExpression(
      [j.identifier('to'), j.identifier('opts')],
      j.callExpression(j.memberExpression(j.identifier('router'), j.identifier('navigate')), [j.identifier('to'), j.identifier('opts')]),
    );
    path.replace(arrow);
    touched = true;
  });

  const fnsThatNeedOutletParam = new Set();
  const outletLocal = localOf('Outlet');
  if (outletLocal) {
    root.find(j.JSXElement).forEach((path) => {
      const name = path.node.openingElement?.name;
      if (!name || name.type !== 'JSXIdentifier' || name.name !== outletLocal) return;
      path.replace(j.jsxExpressionContainer(j.identifier('outlet')));
      touched = true;

      let cur = path;
      while (cur && cur.parent) {
        const node = cur.node;
        if (node && (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression')) {
          fnsThatNeedOutletParam.add(cur);
          break;
        }
        cur = cur.parent;
      }
    });
  }

  for (const fnPath of fnsThatNeedOutletParam) {
    const fn = fnPath.node;
    if (!fn.params) fn.params = [];
    if (!fn.params.some((p) => p.type === 'Identifier' && p.name === 'outlet')) {
      const first = fn.params[0];
      if (!first) {
        fn.params = [j.identifier('outlet')];
      } else if (first.type === 'ObjectPattern') {
        const outletProp = j.property('init', j.identifier('outlet'), j.identifier('outlet'));
        outletProp.shorthand = true;
        const original = first.properties || [];
        const restIdx = original.findIndex((p) => p.type === 'RestElement');
        const insertAt = restIdx === -1 ? original.length : restIdx;
        first.properties = [...original.slice(0, insertAt), outletProp, ...original.slice(insertAt)];
      } else {
        fn.params = [j.identifier('outlet'), ...fn.params];
      }
    }
  }

  for (const hook of ['useParams', 'useLocation', 'useSearchParams', 'useMatch', 'useResolvedPath']) {
    const local = localOf(hook);
    if (!local) continue;
    root.find(j.CallExpression, { callee: { type: 'Identifier', name: local } }).forEach((path) => {
      addLeadingComment(path.node, ` TODO[granular-codemod]: ${hook} has no direct Granular equivalent. Use router.routeState() or router.current().`);
    });
  }

  if (needsRouterImport && !routerJsxPath) {
    const decl = j.importDeclaration([j.importSpecifier(j.identifier('router'))], j.literal('./router-TODO-fix-path.jsx'));
    addLeadingComment(decl, ' TODO[granular-codemod]: fix this path to point at the file that exports `router` (the one with createRouter).');
    const body = root.get().node.program.body;
    let insertAt = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i].type === 'ImportDeclaration') insertAt = i + 1;
      else break;
    }
    body.splice(insertAt, 0, decl);
    touched = true;
  }

  for (const p of routerImportPaths) j(p).remove();
  if (routerImportPaths.length) touched = true;

  if (touched) ge.flush();
  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function addLeadingComment(node, text) {
  node.comments = node.comments || [];
  node.comments.push({ type: 'Line', value: text, leading: true, trailing: false });
}
