'use strict';

/**
 * Codemod: rewrite React-style function components so they accept Granular's
 * variadic JSX call convention.
 *
 * Granular's JSX runtime calls every component as `Comp(propsObj?, ...children)`.
 * React functional components like `({ value, onChange, children, ...rest }) => …`
 * therefore receive `propsObj` as the first argument and the children as
 * positional arguments — `children` ends up undefined and `...rest` collects
 * other config props but not the renderable children.
 *
 * This codemod rewrites a component like:
 *
 *   export const AppBar = ({ position, children, ...rest }) => (
 *     <div className="ui-appbar" data-position={position} {...rest}>{children}</div>
 *   );
 *
 * into:
 *
 *   import { splitArgs } from '@granularjs/jsx';
 *
 *   export const AppBar = (...args) => {
 *     const { rawProps: { position, ...rest }, children } = splitArgs(args, {});
 *     return (
 *       <div className="ui-appbar" data-position={position} {...rest}>{children}</div>
 *     );
 *   };
 *
 * Default values are hoisted into the `splitArgs` defaults argument so they
 * still apply when the prop is omitted entirely.
 *
 * Heuristics — a function is treated as a JSX component when ALL of these hold:
 *   - It is a top-level (or directly exported) function/arrow.
 *   - Its name (declaration name, or the variable it is assigned to) starts
 *     with an uppercase letter.
 *   - It has exactly one parameter and that parameter is an ObjectPattern.
 *
 * Components that already use `splitArgs(...)` are left alone.
 */

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let touched = false;

  let alreadyImports = false;
  root.find(j.ImportDeclaration, { source: { value: '@granularjs/jsx' } }).forEach((p) => {
    for (const s of p.node.specifiers || []) {
      if (s.type === 'ImportSpecifier' && s.imported.name === 'splitArgs') alreadyImports = true;
    }
  });

  function isPascal(name) {
    return typeof name === 'string' && /^[A-Z]/.test(name);
  }

  function isVariadicAlready(fn) {
    if (!fn.params || fn.params.length !== 1) return false;
    return fn.params[0].type === 'RestElement';
  }

  function shouldConvert(fn, declaredName) {
    if (!declaredName || !isPascal(declaredName)) return false;
    if (!fn.params || fn.params.length !== 1) return false;
    if (fn.params[0].type !== 'ObjectPattern') return false;
    if (isVariadicAlready(fn)) return false;
    return true;
  }

  function buildDefaultsObject(objectPattern) {
    const props = [];
    for (const p of objectPattern.properties || []) {
      if (p.type === 'Property' || p.type === 'ObjectProperty') {
        if (p.value && p.value.type === 'AssignmentPattern' && p.key.type === 'Identifier') {
          const key = p.key.name;
          const right = p.value.right;
          props.push(j.property('init', j.identifier(key), right));
        }
      }
    }
    return j.objectExpression(props);
  }

  function stripDefaults(objectPattern) {
    const newProps = [];
    for (const p of objectPattern.properties || []) {
      if (p.type === 'RestElement') { newProps.push(p); continue; }
      if (p.type === 'Property' || p.type === 'ObjectProperty') {
        if (p.value && p.value.type === 'AssignmentPattern') {
          const newProp = j.property('init', p.key, p.value.left);
          newProp.shorthand = p.shorthand
            && p.value.left.type === 'Identifier'
            && p.key.type === 'Identifier'
            && p.value.left.name === p.key.name;
          newProps.push(newProp);
          continue;
        }
        newProps.push(p);
      } else {
        newProps.push(p);
      }
    }
    return j.objectPattern(newProps);
  }

  function extractChildrenAndStrip(objectPattern) {
    let hasChildren = false;
    const newProps = [];
    for (const p of objectPattern.properties || []) {
      if (
        (p.type === 'Property' || p.type === 'ObjectProperty')
        && p.key && p.key.type === 'Identifier' && p.key.name === 'children'
        && (!p.computed)
      ) {
        hasChildren = true;
        continue;
      }
      newProps.push(p);
    }
    return { hasChildren, pattern: j.objectPattern(newProps) };
  }

  function buildPrologue(objectPattern) {
    const stripped = stripDefaults(objectPattern);
    const { hasChildren, pattern: rawPropsPattern } = extractChildrenAndStrip(stripped);

    const destructureProps = [
      j.property('init', j.identifier('rawProps'), rawPropsPattern),
    ];
    let lastDP = destructureProps[0];
    lastDP.shorthand = false;

    if (hasChildren) {
      const childrenProp = j.property('init', j.identifier('children'), j.identifier('children'));
      childrenProp.shorthand = true;
      destructureProps.push(childrenProp);
    }

    const defaultsObj = buildDefaultsObject(objectPattern);
    const splitArgsCall = j.callExpression(
      j.identifier('splitArgs'),
      defaultsObj.properties.length ? [j.identifier('args'), defaultsObj] : [j.identifier('args')],
    );

    const decl = j.variableDeclaration('const', [
      j.variableDeclarator(j.objectPattern(destructureProps), splitArgsCall),
    ]);
    return decl;
  }

  function ensureBlock(fn) {
    if (fn.body && fn.body.type === 'BlockStatement') return fn.body;
    return j.blockStatement([j.returnStatement(fn.body)]);
  }

  function convertFunction(fn) {
    if (!fn.params || fn.params.length !== 1 || fn.params[0].type !== 'ObjectPattern') return false;

    const original = fn.params[0];
    const block = ensureBlock(fn);
    const prologue = buildPrologue(original);

    fn.params = [j.restElement(j.identifier('args'))];
    fn.body = j.blockStatement([prologue, ...block.body]);

    return true;
  }

  function processFunctionPath(fnPath, declaredName) {
    const fn = fnPath.node;
    if (!shouldConvert(fn, declaredName)) return;
    if (convertFunction(fn)) touched = true;
  }

  root.find(j.FunctionDeclaration).forEach((path) => {
    const name = path.node.id?.name;
    processFunctionPath(path, name);
  });

  root.find(j.VariableDeclarator).forEach((path) => {
    const node = path.node;
    if (!node.id || node.id.type !== 'Identifier') return;
    const init = node.init;
    if (!init) return;
    if (init.type !== 'ArrowFunctionExpression' && init.type !== 'FunctionExpression') return;
    const fnPath = path.get('init');
    processFunctionPath(fnPath, node.id.name);
  });

  if (touched && !alreadyImports) {
    const decl = j.importDeclaration(
      [j.importSpecifier(j.identifier('splitArgs'))],
      j.literal('@granularjs/jsx'),
    );
    const body = root.get().node.program.body;
    let insertAt = 0;
    for (let i = 0; i < body.length; i++) {
      if (body[i].type === 'ImportDeclaration') insertAt = i + 1;
      else break;
    }
    body.splice(insertAt, 0, decl);
  }

  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';
