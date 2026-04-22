'use strict';

const runner = require('./runner');
const tsconfig = require('./transforms/tsconfig');
const packageJson = require('./transforms/package-json');

module.exports = {
  ...runner,
  applyTsconfig: tsconfig,
  applyPackageJson: packageJson,
};
