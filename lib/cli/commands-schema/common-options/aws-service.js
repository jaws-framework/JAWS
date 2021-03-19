'use strict';

module.exports = {
  ...require('./service'),
  'region': {
    usage: 'Region of the service',
    shortcut: 'r',
  },
  'app': { usage: 'Dashboard app' },
  'org': { usage: 'Dashboard org' },
  'use-local-credentials': {
    usage:
      'Rely on locally resolved AWS credentials instead of loading them from ' +
      'Dashboard provider settings (applies only to services integrated with Dashboard)',
    type: 'boolean',
  },
};
