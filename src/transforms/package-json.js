'use strict';

/**
 * Codemod: package.json
 *
 *  - Removes `react`, `react-dom` from `dependencies`.
 *  - Removes `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`,
 *    `@vitejs/plugin-react-swc`, `eslint-plugin-react`,
 *    `eslint-plugin-react-hooks`, `react-refresh` from devDependencies.
 *  - Adds `@granularjs/core` to dependencies (latest).
 *  - Adds `@granularjs/jsx` to devDependencies.
 *
 * Returns { source, changed }.
 */

const REACT_DEPS = new Set(['react', 'react-dom', 'react-router-dom', 'react-router']);
const REACT_DEV_DEPS = new Set([
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
  '@vitejs/plugin-react-swc',
  'eslint-plugin-react',
  'eslint-plugin-react-hooks',
  'react-refresh',
]);

module.exports = function applyPackageJson(source, opts = {}) {
  let pkg;
  try {
    pkg = JSON.parse(source);
  } catch {
    return { source, changed: false, error: 'Could not parse package.json.' };
  }

  let changed = false;

  if (pkg.dependencies) {
    for (const k of Object.keys(pkg.dependencies)) {
      if (REACT_DEPS.has(k)) {
        delete pkg.dependencies[k];
        changed = true;
      }
    }
  }

  if (pkg.devDependencies) {
    for (const k of Object.keys(pkg.devDependencies)) {
      if (REACT_DEV_DEPS.has(k)) {
        delete pkg.devDependencies[k];
        changed = true;
      }
    }
  }

  pkg.dependencies = pkg.dependencies || {};
  pkg.devDependencies = pkg.devDependencies || {};

  const coreVersion = opts.coreVersion || 'latest';
  const jsxVersion = opts.jsxVersion || 'latest';

  if (pkg.dependencies['@granularjs/core'] !== coreVersion) {
    pkg.dependencies['@granularjs/core'] = coreVersion;
    changed = true;
  }
  if (pkg.devDependencies['@granularjs/jsx'] !== jsxVersion) {
    pkg.devDependencies['@granularjs/jsx'] = jsxVersion;
    changed = true;
  }

  return { source: JSON.stringify(pkg, null, 2) + '\n', changed };
};
