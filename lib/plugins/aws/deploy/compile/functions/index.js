'use strict';

const _ = require('lodash');
const path = require('path');

class AwsCompileFunctions {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileFunctions': this.compileFunctions.bind(this),
    };
  }

  compileFunctions() {
    if (!this.serverless.service.resources.Resources) {
      throw new this.serverless.classes
        .Error('This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    // merge in the iamRoleLambdaTemplate
    const iamRoleLambdaTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
        'compile',
        'functions',
        'iam-role-lambda-template.json')
    );

    _.merge(this.serverless.service.resources.Resources, iamRoleLambdaTemplate);

    // merge in the iamPolicyLambdaTemplate
    const iamPolicyLambdaTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
        'compile',
        'functions',
        'iam-policy-lambda-template.json')
    );

    _.merge(this.serverless.service.resources.Resources, iamPolicyLambdaTemplate);

    // set the necessary variables for the IamPolicyLambda
    this.serverless.service.resources
      .Resources
      .IamPolicyLambda
      .Properties
      .PolicyName = `${this.options.stage}-${this.serverless.service.service}-lambda`;
    this.serverless.service.resources
      .Resources
      .IamPolicyLambda
      .Properties
      .PolicyDocument
      .Statement[0]
      .Resource = `arn:aws:logs:${this.options.region}:*:*`;

    // add custom iam role statements
    if (this.serverless.service.provider.iamRoleStatements &&
      this.serverless.service.provider.iamRoleStatements instanceof Array) {
      this.serverless.service.resources
        .Resources
        .IamPolicyLambda
        .Properties
        .PolicyDocument
        .Statement = this.serverless.service.resources
        .Resources
        .IamPolicyLambda
        .Properties
        .PolicyDocument
        .Statement.concat(this.serverless.service.provider.iamRoleStatements);
    }

    this.serverless.service.resources.Outputs = this.serverless.service.resources.Outputs || {};

    let functionCounter = 1;
    const functionTemplate = `
      {
        "Type": "AWS::Lambda::Function",
        "Properties": {
          "Code": {
            "S3Bucket": { "Ref": "ServerlessDeploymentBucket" },
            "S3Key": "S3Key"
          },
          "FunctionName": "FunctionName",
          "Handler": "Handler",
          "MemorySize": "MemorySize",
          "Role": "Role",
          "Runtime": "Runtime",
          "Timeout": "Timeout"
        }
      }
    `;

    const outputTemplate = `
      {
        "Description": "Lambda function info",
        "Value": "Value"
      }
     `;

    const versionTemplate = `
     {
       "Type" : "AWS::Lambda::Version",
       "Properties" : {
         "FunctionName" : { "Ref" : "MyFunction" }
       },
       "DependsOn": "FunctionName"
     }
     `;

    this.serverless.service.getAllFunctions().forEach((functionLogicalName) => {
      const newFunction = JSON.parse(functionTemplate);
      const functionObject = this.serverless.service.getFunction(functionLogicalName);

      newFunction.Properties.Code
        .S3Key = this.serverless.service.package.artifact.split(path.sep).pop();

      if (!functionObject.handler) {
        const errorMessage = [
          `Missing "handler" property in function ${functionLogicalName}`,
          ' Please make sure you point to the correct lambda handler.',
          ' For example: handler.hello.',
          ' Please check the docs for more info',
        ].join('');
        throw new this.serverless.classes
          .Error(errorMessage);
      }

      const Handler = functionObject.handler;
      const FunctionName = functionObject.name;
      const MemorySize = Number(functionObject.memorySize)
        || Number(this.serverless.service.provider.memorySize)
        || 1024;
      const Timeout = Number(functionObject.timeout)
        || Number(this.serverless.service.provider.timeout)
        || 6;
      const Runtime = this.serverless.service.provider.runtime
        || 'nodejs4.3';

      newFunction.Properties.Handler = Handler;
      newFunction.Properties.FunctionName = FunctionName;
      newFunction.Properties.MemorySize = MemorySize;
      newFunction.Properties.Timeout = Timeout;
      newFunction.Properties.Runtime = Runtime;
      newFunction.Properties.Role = { 'Fn::GetAtt': ['IamRoleLambda', 'Arn'] };

      if (!functionObject.vpc) functionObject.vpc = {};
      if (!this.serverless.service.provider.vpc) this.serverless.service.provider.vpc = {};

      newFunction.Properties.VpcConfig = {
        SecurityGroupIds: functionObject.vpc.securityGroupIds ||
          this.serverless.service.provider.vpc.securityGroupIds,
        SubnetIds: functionObject.vpc.subnetIds || this.serverless.service.provider.vpc.subnetIds,
      };

      if (!newFunction.Properties.VpcConfig.SecurityGroupIds
        || !newFunction.Properties.VpcConfig.SubnetIds) {
        delete newFunction.Properties.VpcConfig;
      }

      const newFunctionObject = {
        [functionLogicalName]: newFunction,
      };

      _.merge(this.serverless.service.resources.Resources, newFunctionObject);


      const newFunctionVersion = JSON.parse(versionTemplate);
      newFunctionVersion.Properties.FunctionName = { Ref: functionLogicalName };
      newFunctionVersion.DependsOn = functionLogicalName;

      const functionVersionLogicalName =
            `${functionLogicalName}Version${(new Date).getTime().toString()}`;

      const newFunctionVersionObject = {
        [functionVersionLogicalName]: newFunctionVersion,
      };

      _.merge(this.serverless.service.resources.Resources, newFunctionVersionObject);

      // Add function to Outputs section
      const newOutput = JSON.parse(outputTemplate);
      newOutput.Value = { 'Fn::GetAtt': [functionLogicalName, 'Arn'] };

      const newOutputObject = {
        [`Function${functionCounter++}Arn`]: newOutput,
      };

      _.merge(this.serverless.service.resources.Outputs, newOutputObject);
    });
  }
}

module.exports = AwsCompileFunctions;
