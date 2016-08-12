'use strict';

const BbPromise = require('bluebird');
const JsZip = require('jszip');
const path = require('path');
const fs = require('fs');
const _ = require('lodash');

module.exports = {
  zipService() {
    // check if the user has specified an own artifact
    if (this.serverless.service.package.artifact) {
      return BbPromise.resolve();
    }

    this.serverless.cli.log('Zipping service...');

    const zip = new JsZip();
    const servicePath = this.serverless.config.servicePath;

    let exclude = this.serverless.service.package.exclude || [];

    // add defaults for exclude
    exclude = _.union(exclude, [
      '.git',
      '.gitignore',
      '.DS_Store',
      'serverless.yaml',
      'serverless.yml',
      'serverless.env.yaml',
      'serverless.env.yml',
      '.serverless',
    ]);

    const include = this.serverless.service.package.include || [];

    const zipFileName = `${this.serverless.service.service}-${(new Date).getTime().toString()}.zip`;

    this.serverless.utils.walkDirSync(servicePath).forEach((filePath) => {
      const relativeFilePath = path.relative(servicePath, filePath);

      const shouldBeExcluded =
        exclude.some(value => relativeFilePath.toLowerCase().indexOf(value.toLowerCase()) > -1);

      const shouldBeIncluded =
        include.some(value => relativeFilePath.toLowerCase().indexOf(value.toLowerCase()) > -1);

      if (!shouldBeExcluded || shouldBeIncluded) {
        const permissions = fs.statSync(filePath).mode | 0o444;
        zip.file(relativeFilePath, fs.readFileSync(filePath), { unixPermissions: permissions });
      }
    });

    const platformName = ['UNIX', 'DOS'].indexOf(process.platform) !== -1 ? process.platform :
      'UNIX';

    return zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      platform: platformName,
    }).then(data => {
      const artifactFilePath = path.join(servicePath,
        '.serverless', zipFileName);
      this.serverless.utils.writeFileSync(artifactFilePath, data);

      this.serverless.service.package.artifact = artifactFilePath;

      return BbPromise.resolve();
    });
  },
};
