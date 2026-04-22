'use strict';

/**
 * Helpers to track and add named imports to `@granularjs/core`.
 *
 *   const ge = granularImports(j, root);
 *   ge.add('signal');
 *   ge.add('after');
 *   ge.flush(); // mutates the file's import declarations
 */
function granularImports(j, root) {
  const SOURCE = '@granularjs/core';
  const wanted = new Set();

  const findExisting = () => root
    .find(j.ImportDeclaration, { source: { value: SOURCE } });

  const existingSpecifiers = new Set();
  findExisting().forEach((p) => {
    for (const s of p.node.specifiers || []) {
      if (s.type === 'ImportSpecifier') existingSpecifiers.add(s.imported.name);
      else if (s.type === 'ImportDefaultSpecifier') existingSpecifiers.add(s.local.name);
    }
  });

  return {
    has(name) { return existingSpecifiers.has(name); },
    add(name) {
      if (!name) return;
      if (existingSpecifiers.has(name)) return;
      wanted.add(name);
    },
    flush() {
      if (!wanted.size) return false;
      const adds = [...wanted].filter((n) => !existingSpecifiers.has(n));
      if (!adds.length) return false;
      const newSpecs = adds.map((n) => j.importSpecifier(j.identifier(n)));

      const existing = findExisting();
      if (existing.size() > 0) {
        existing.at(0).get('specifiers').replace([
          ...existing.at(0).get('specifiers').value,
          ...newSpecs,
        ]);
      } else {
        const decl = j.importDeclaration(newSpecs, j.literal(SOURCE));
        const body = root.get().node.program.body;
        let insertAt = 0;
        for (let i = 0; i < body.length; i++) {
          if (body[i].type === 'ImportDeclaration') insertAt = i + 1;
          else break;
        }
        body.splice(insertAt, 0, decl);
      }
      for (const n of adds) existingSpecifiers.add(n);
      return true;
    },
  };
}

/**
 * Removes the named specifier from an existing react import (and removes the
 * whole import declaration if the specifier was the last one).
 */
function removeReactNamedImport(j, root, name) {
  let removed = false;
  root
    .find(j.ImportDeclaration, { source: { value: 'react' } })
    .forEach((p) => {
      const specs = p.node.specifiers || [];
      const next = specs.filter((s) => {
        if (s.type !== 'ImportSpecifier') return true;
        if (s.imported.name !== name) return true;
        removed = true;
        return false;
      });
      if (next.length === 0) {
        j(p).remove();
      } else if (next.length !== specs.length) {
        p.node.specifiers = next;
      }
    });
  return removed;
}

module.exports = { granularImports, removeReactNamedImport };
