'use strict';

/**
 * Codemod: rewrites `React.xxx` namespace usages that survive after the other
 * transforms. Granular has no `React` global, and most of these idioms map to
 * native JS or to direct prop access.
 *
 * Mappings:
 *
 *   React.forwardRef(function Cmp({ a, b }, ref) { ... })
 *     → function Cmp({ a, b, ref }) { ... }
 *   React.forwardRef((props, ref) => { ... })
 *     → (props) => { ... } and a TODO comment (couldn't safely rewrite ref usage)
 *
 *   React.Children.map(children, fn)    → (children ?? []).map(fn)
 *   React.Children.forEach(children, fn)→ (children ?? []).forEach(fn)
 *   React.Children.toArray(children)    → (children ?? [])
 *   React.Children.count(children)      → (children ?? []).length
 *   React.Children.only(children)       → children   (with TODO)
 *
 *   React.memo(fn)                      → fn   (Granular has no rerender)
 *   React.lazy(() => import(...))       → kept as-is, with TODO (granular suspense story differs)
 *   React.Fragment / <React.Fragment>   → <>…</>
 *   React.createElement(Type, props, …) → kept, with TODO (rare in JSX projects)
 *   React.cloneElement(...)             → kept, with TODO
 *
 * Both `React.xxx` (default import) and unqualified `xxx` (named import like
 * `import { forwardRef, memo } from 'react'`) are handled.
 */

const { removeReactNamedImport } = require('../utils/granular-imports');

module.exports = function transformer(file, api) {
  const j = api.jscodeshift;
  const root = j(file.source);
  let touched = false;

  root.find(j.CallExpression).forEach((path) => {
    const callee = path.node.callee;
    if (!isReactCall(callee, 'forwardRef')) return;
    const args = path.node.arguments;
    if (args.length !== 1) return;
    const fn = args[0];
    if (fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression' && fn.type !== 'FunctionDeclaration') return;

    if (fn.params.length === 2) {
      const propsParam = fn.params[0];
      const refParam = fn.params[1];

      if (propsParam.type === 'ObjectPattern' && refParam.type === 'Identifier') {
        const refProp = j.property('init', j.identifier(refParam.name), j.identifier(refParam.name));
        refProp.shorthand = true;
        const original = propsParam.properties || [];
        const restIdx = original.findIndex((p) => p.type === 'RestElement');
        const insertAt = restIdx === -1 ? original.length : restIdx;
        const newPropsList = [...original.slice(0, insertAt), refProp, ...original.slice(insertAt)];
        const newProps = j.objectPattern(newPropsList);
        if (propsParam.typeAnnotation) newProps.typeAnnotation = propsParam.typeAnnotation;

        let replacement;
        if (fn.type === 'ArrowFunctionExpression') {
          replacement = j.arrowFunctionExpression([newProps], fn.body, fn.async);
        } else {
          replacement = j.functionExpression(fn.id || null, [newProps], fn.body, fn.generator, fn.async);
        }
        path.replace(replacement);
        touched = true;
        return;
      }

      if (propsParam.type === 'Identifier' && refParam.type === 'Identifier') {
        const newParams = [propsParam];
        let replacement;
        if (fn.type === 'ArrowFunctionExpression') {
          replacement = j.arrowFunctionExpression(newParams, fn.body, fn.async);
        } else {
          replacement = j.functionExpression(fn.id || null, newParams, fn.body, fn.generator, fn.async);
        }
        addLeadingComment(replacement, ` TODO[granular-codemod]: forwardRef removed. The original second parameter '${refParam.name}' is gone; access it as ${propsParam.name}.${refParam.name} or destructure it from props.`);
        path.replace(replacement);
        touched = true;
        return;
      }
    }

    addLeadingComment(path.node, ' TODO[granular-codemod]: forwardRef call could not be auto-migrated. Granular accepts ref as a regular prop.');
  });

  root.find(j.CallExpression).forEach((path) => {
    const callee = path.node.callee;

    const childrenMethod = matchReactChildrenMethod(callee);
    if (!childrenMethod) return;
    const args = path.node.arguments;
    if (!args.length) return;
    const childrenArg = args[0];
    const safeChildren = j.logicalExpression('??', childrenArg, j.arrayExpression([]));

    if (childrenMethod === 'map' || childrenMethod === 'forEach') {
      if (args.length < 2) return;
      path.replace(
        j.callExpression(
          j.memberExpression(safeChildren, j.identifier(childrenMethod)),
          args.slice(1),
        ),
      );
      touched = true;
      return;
    }
    if (childrenMethod === 'toArray') {
      path.replace(safeChildren);
      touched = true;
      return;
    }
    if (childrenMethod === 'count') {
      path.replace(j.memberExpression(safeChildren, j.identifier('length')));
      touched = true;
      return;
    }
    if (childrenMethod === 'only') {
      addLeadingComment(path.node, ' TODO[granular-codemod]: React.Children.only does not have a Granular equivalent. Verify single-child invariant manually.');
      path.replace(childrenArg);
      touched = true;
      return;
    }
  });

  root.find(j.CallExpression).forEach((path) => {
    if (!isReactCall(path.node.callee, 'memo')) return;
    const args = path.node.arguments;
    if (!args.length) return;
    path.replace(args[0]);
    touched = true;
  });

  root.find(j.JSXElement).forEach((path) => {
    const opening = path.node.openingElement;
    if (!opening) return;
    const name = opening.name;
    if (!isReactFragmentJsxName(name)) return;
    const fragment = j.jsxFragment(j.jsxOpeningFragment(), j.jsxClosingFragment(), path.node.children || []);
    path.replace(fragment);
    touched = true;
  });

  root.find(j.MemberExpression, {
    object: { type: 'Identifier', name: 'React' },
    property: { type: 'Identifier', name: 'Fragment' },
  }).forEach((path) => {
    if (path.parent && path.parent.node.type === 'JSXIdentifier') return;
    path.replace(j.identifier('Fragment'));
    touched = true;
  });

  root.find(j.CallExpression).forEach((path) => {
    const callee = path.node.callee;
    if (isReactCall(callee, 'createElement')) {
      addLeadingComment(path.node, ' TODO[granular-codemod]: React.createElement(Type, props, ...children) is not supported. Convert to JSX or to the equivalent factory call.');
    } else if (isReactCall(callee, 'cloneElement')) {
      addLeadingComment(path.node, ' TODO[granular-codemod]: React.cloneElement is not supported. Pass props through directly or destructure.');
    } else if (isReactCall(callee, 'lazy')) {
      addLeadingComment(path.node, ' TODO[granular-codemod]: React.lazy/Suspense flow differs in Granular. Review the dynamic import strategy manually.');
    }
  });

  if (removeReactNamedImport(j, root, 'forwardRef')) touched = true;
  if (removeReactNamedImport(j, root, 'memo')) touched = true;
  if (removeReactNamedImport(j, root, 'Children')) touched = true;
  if (removeReactNamedImport(j, root, 'Fragment')) touched = true;
  if (removeReactNamedImport(j, root, 'lazy')) touched = true;
  if (removeReactNamedImport(j, root, 'createElement')) touched = true;
  if (removeReactNamedImport(j, root, 'cloneElement')) touched = true;

  return touched ? root.toSource() : file.source;
};

module.exports.parser = 'tsx';

function isReactCall(callee, name) {
  if (callee.type === 'Identifier' && callee.name === name) return true;
  if (callee.type === 'MemberExpression'
    && !callee.computed
    && callee.object.type === 'Identifier'
    && callee.object.name === 'React'
    && callee.property.type === 'Identifier'
    && callee.property.name === name) return true;
  return false;
}

function matchReactChildrenMethod(callee) {
  if (callee.type !== 'MemberExpression' || callee.computed) return null;
  if (callee.property.type !== 'Identifier') return null;
  const method = callee.property.name;
  const obj = callee.object;
  if (obj.type === 'MemberExpression'
    && !obj.computed
    && obj.object.type === 'Identifier'
    && obj.object.name === 'React'
    && obj.property.type === 'Identifier'
    && obj.property.name === 'Children') return method;
  if (obj.type === 'Identifier' && obj.name === 'Children') return method;
  return null;
}

function isReactFragmentJsxName(name) {
  if (!name) return false;
  if (name.type === 'JSXIdentifier' && name.name === 'Fragment') return true;
  if (name.type === 'JSXMemberExpression'
    && name.object.type === 'JSXIdentifier'
    && name.object.name === 'React'
    && name.property.name === 'Fragment') return true;
  return false;
}

function addLeadingComment(node, text) {
  node.comments = node.comments || [];
  node.comments.push({ type: 'Line', value: text, leading: true, trailing: false });
}
