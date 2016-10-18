'use strict';

const BbPromise = require('bluebird');
const fs = require('fs');
const SDK = require('../');
const validate = require('../lib/validate');

// The Package plugin which is used to zip the service
const Package = require('../../package');


class AwsDeployFunction extends Package {
  constructor(serverless, options) {
    super(serverless, options || {} );

    this.provider = 'aws';
    this.sdk = new SDK(serverless);

    Object.assign(this.hooks, {
      'deploy:function:deploy': () => BbPromise.bind(this)
        .then(this.validate)
        .then(this.checkIfFunctionExists)
        .then(this.zipFunction)
        .then(this.deployFunction)
        .then(this.cleanup),
    });

  }

  checkIfFunctionExists() {
    // check if the function exists in the service
    this.options.functionObj = this.serverless.service.getFunction(this.options.function);

    // check if function exists on AWS
    const params = {
      FunctionName: this.options.functionObj.name,
    };

    this.sdk.request(
      'Lambda',
      'getFunction',
      params,
      this.options.stage, this.options.region
    ).catch(() => {
      const errorMessage = [
        `The function "${this.options.function}" you want to update is not yet deployed.`,
        ' Please run "serverless deploy" to deploy your service.',
        ' After that you can redeploy your services functions with the',
        ' "serverless deploy function" command.',
      ].join('');
      throw new this.serverless.classes
        .Error(errorMessage);
    });

    return BbPromise.resolve();
  }

  zipFunction() {
    return this.packageFunction(this.options.function);
  }

  deployFunction() {
    const data = fs.readFileSync(this.options.functionObj.artifact);

    const params = {
      FunctionName: this.options.functionObj.name,
      ZipFile: data,
    };

    return this.sdk.request(
      'Lambda',
      'updateFunctionCode',
      params,
      this.options.stage, this.options.region
    ).then(() => {
      this.serverless.cli.log(`Successfully deployed function "${this.options.function}"`);
    });
  }

}

module.exports = AwsDeployFunction;
