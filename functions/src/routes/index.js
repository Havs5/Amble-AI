/**
 * Routes Barrel Export
 */

module.exports = {
  ...require('./chat'),
  ...require('./audio'),
  ...require('./tools'),
  ...require('./knowledge'),
  ...require('./driveSync'),
};
