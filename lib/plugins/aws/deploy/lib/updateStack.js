'use strict';

const BbPromise = require('bluebird');
const async = require('async');
const _ = require('lodash');
const chalk = require('chalk');

module.exports = {
  update() {
    this.serverless.cli.spinner.setSpinnerTitle(chalk.yellow('Updating Stack '));
    const serviceResources = this.serverless.service.resources;

    _.forEach(serviceResources.Resources, (value, key) => {
      if (_.find(this.deployedFunctions, { name: key })) {
        const newValue = value;
        newValue.Properties.Code.S3Key =
          (_.find(this.deployedFunctions, { name: key }).zipFileKey);

        _.merge(serviceResources.Resources, { [key]: newValue });
      }
    });

    this.serverless.service.resources = serviceResources;

    const stackName = `${this.serverless.service.service}-${this.options.stage}`;
    const params = {
      StackName: stackName,
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(this.serverless.service.resources),
    };

    return this.sdk.request('CloudFormation',
      'updateStack',
      params,
      this.options.stage,
      this.options.region);
  },

  monitorUpdate(cfData, frequency) {
    const validStatuses = [
      'UPDATE_COMPLETE',
      'UPDATE_IN_PROGRESS',
      'UPDATE_COMPLETE_CLEANUP_IN_PROGRESS',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackData = null;

      async.whilst(
        () => (stackStatus !== 'UPDATE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.sdk.request('CloudFormation',
              'describeStacks',
              params,
              this.options.stage,
              this.options.region)
              .then((data) => {
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                if (!stackStatus || validStatuses.indexOf(stackStatus) === -1) {
                  return reject(new this.serverless.classes
                    .Error(`An error occurred while provisioning your cloudformation: ${stackData
                    .Stacks[0].StackStatusReason}`));
                }
                return callback();
              });
          }, frequency || 5000);
        },
        () => resolve(stackData.Stacks[0]));
    });
  },

  updateStack() {
    return BbPromise.bind(this)
      .then(this.update)
      .then(this.monitorUpdate);
  },
};
