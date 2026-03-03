/**
 * Routes Barrel Export
 */

module.exports = {
  ...require('./chat'),
  ...require('./image'),
  ...require('./video'),
  ...require('./audio'),
  ...require('./tools'),
  ...require('./gallery'),
  ...require('./knowledge'),
  ...require('./videoAnalyze'),
  ...require('./driveSync'),
};
