'use strict';

const fs = require('fs');
const path = require('path');
const BbPromise = require('bluebird');
const forEach = require('lodash').forEach;
const last = require('lodash').last;
const union = require('lodash').union;
const Zip = require('node-zip');
const chalk = require('chalk');
const debug = require('debug')('Deploy Functions');

module.exports = {
  extractFunctionHandlers() {
    this.deployedFunctions = [];
    forEach(this.serverless.service.functions, (value, key) => {
      if (key !== 'name_template') {
        this.deployedFunctions.push({
          name: key,
          handler: value.handler,
          exclude: value.exclude,
          include: value.include,
        });
      }
    });

    return BbPromise.resolve();
  },

  zipFunctions() {
    this.serverless.cli.spinner.setSpinnerTitle(chalk.yellow('Deploying Functions '));

    this.deployedFunctions.forEach((func, index) => {
      // create a new zip instance so that old functions won't slip into the new zip archive
      const zip = new Zip();

      const servicePath = this.serverless.config.servicePath;

      let exclude = func.exclude || [];

      // add defaults for exclude
      exclude = union(exclude, [
        '.git',
        '.gitignore',
        '.DS_Store',
        'serverless.yaml',
        'serverless.env.yaml',
      ]);

      const include = func.include || [];

      const handler = (last(func.handler.split('/'))).replace(/\\g/, '/');
      const handlerFullPath = path.join(servicePath, handler);
      const zipFileName = `${func.name}-${(new Date).getTime().toString()}.zip`;

      if (!handlerFullPath.endsWith(func.handler)) {
        const errorMessage = [
          `The handler ${func.handler} was not found.`,
          ' Please make sure you have this handler in your service at the referenced location.',
          ' Please check the docs for more info',
        ].join('');
        throw new this.serverless.classes.Error(errorMessage);
      }

      const packageRoot = handlerFullPath.replace(func.handler, '');

      this.serverless.utils.walkDirSync(packageRoot).forEach((filePath) => {
        const relativeFilePath = path.relative(packageRoot, filePath);

        const shouldBeExcluded = exclude.some(sRegex => {
          const regex = new RegExp(sRegex);
          const matches = regex.exec(relativeFilePath);
          return matches && matches.length > 0;
        });

        const shouldBeIncluded = include.some(sRegex => {
          const regex = new RegExp(sRegex);
          const matches = regex.exec(relativeFilePath);
          return matches && matches.length > 0;
        });

        if (!shouldBeExcluded || shouldBeIncluded) {
          zip.file(relativeFilePath, fs.readFileSync(filePath));
        }
      });

      const data = zip.generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        platform: process.platform,
      });

      this.deployedFunctions[index].zipFileData = data;
      this.deployedFunctions[index].zipFileKey = zipFileName;
    });

    return BbPromise.resolve();
  },

  getFunctionObjectsFromS3Bucket() {
    debug('Getting objects from S3');

    const bucketName =
      `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;

    return this.sdk.request('S3',
      'listObjectsV2',
      { Bucket: bucketName },
      this.options.stage,
      this.options.region)
      .then((result) => {
        if (result.Contents.length) {
          const fileNames = result.Contents.map((object) => object.Key);

          const objectsToRemove = [];
          fileNames.forEach((fileName) => {
            const regex = new RegExp(/^(.+)-.+\.zip$/);

            if (fileName.match(regex)) {
              objectsToRemove.push({ Key: fileName });
            }
          });

          return BbPromise.resolve(objectsToRemove);
        }
        return BbPromise.resolve();
      });
  },

  cleanupS3Bucket(objectsToRemove) {
    if (objectsToRemove && objectsToRemove.length) {
      debug('Removing old function versions...');

      const bucketName =
        `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;

      return this.sdk.request('S3',
        'deleteObjects',
        {
          Bucket: bucketName,
          Delete: { Objects: objectsToRemove },
        },
        this.options.stage,
        this.options.region);
    }

    return BbPromise.resolve();
  },

  uploadZipFilesToS3Bucket() {
    debug('uploading zip files to S3');

    const bucketName =
      `${this.serverless.service.service}-${this.options.stage}-${this.options.region}`;
    const uploadPromises = [];

    this.deployedFunctions.forEach(func => {
      const params = {
        Bucket: bucketName,
        Key: func.zipFileKey,
        Body: func.zipFileData,
      };

      const putObjectPromise = this.sdk.request('S3',
        'putObject',
        params,
        this.options.stage,
        this.options.region);

      uploadPromises.push(putObjectPromise);
    });

    return BbPromise.all(uploadPromises);
  },

  deployFunctions() {
    return BbPromise.bind(this)
      .then(this.extractFunctionHandlers)
      .then(this.zipFunctions)
      .then(this.getFunctionObjectsFromS3Bucket)
      .then(this.cleanupS3Bucket)
      .then(this.uploadZipFilesToS3Bucket);
  },
};
