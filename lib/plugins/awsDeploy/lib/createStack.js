'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const lowerFirst = require('lodash').lowerFirst;
const async = require('async');

module.exports = {
  create() {
    this.serverless.cli.log('Creating Stack...');

    const stackName = `${this.serverless.service.service}-${this.options.stage}`;

    const params = {
      StackName: stackName,
      OnFailure: 'DELETE',
      Capabilities: [
        'CAPABILITY_IAM',
      ],
      Parameters: [],
      TemplateBody: JSON.stringify(this.serverless.service.resources),
      Tags: [{
        Key: 'STAGE',
        Value: this.options.stage,
      }],
    };

    return this.aws.request('CloudFormation',
      'createStack',
      params,
      this.options.stage,
      this.options.region);
  },

  monitorCreate(cfData, frequency) {
    const validStatuses = [
      'CREATE_COMPLETE',
      'CREATE_IN_PROGRESS',
    ];

    return new BbPromise((resolve, reject) => {
      let stackStatus = null;
      let stackData = null;

      async.whilst(
        () => (stackStatus !== 'CREATE_COMPLETE'),
        (callback) => {
          setTimeout(() => {
            const params = {
              StackName: cfData.StackId,
            };
            return this.aws.request('CloudFormation',
              'describeStacks',
              params,
              this.options.stage,
              this.options.region)
              .then((data) => {
                stackData = data;
                stackStatus = stackData.Stacks[0].StackStatus;

                this.serverless.cli.log('Checking stack creation progress...');

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

  addOutputVars(cfData) {
    this.serverless.cli.log('Stack successfully created.');

    const serverlessEnvYamlPath = path
      .join(this.serverless.config.servicePath, 'serverless.env.yaml');
    return this.serverless.yamlParser.parse(serverlessEnvYamlPath).then(parsedServerlessEnvYaml => {
      const serverlessEnvYaml = parsedServerlessEnvYaml;
      cfData.Outputs.forEach((output) => {
        const varName = lowerFirst(output.OutputKey);

        // add vars to memory
        const regionVars = this.serverless.service
          .getVariables(this.options.stage, this.options.region);
        regionVars[varName] = output.OutputValue;

        // add vars to file system
        serverlessEnvYaml.stages[this.options.stage]
          .regions[this.options.region].vars = regionVars;
      });
      this.serverless.utils.writeFileSync(serverlessEnvYamlPath, serverlessEnvYaml);
      return BbPromise.resolve();
    });
  },

  createStack() {
    const stackName = `${this.serverless.service.service}-${this.options.stage}`;

    return this.aws.request('CloudFormation',
      'describeStackResources',
      { StackName: stackName },
      this.options.stage,
      this.options.region)
      .then(() => BbPromise.resolve())
      .catch(e => {
        if (e.message.indexOf('does not exist') > -1) {
          return BbPromise.bind(this)
            .then(this.create)
            .then(this.monitorCreate)
            .then(this.addOutputVars);
        }

        throw new this.serverless.classes.Error(e);
      });
  },
};
