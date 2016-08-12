'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileDeployment() {
    const deploymentTemplate = `
      {
        "Type" : "AWS::ApiGateway::Deployment",
        "Properties" : {
          "RestApiId" : { "Ref": "RestApiApigEvent" },
          "StageName" : "${this.options.stage}"
        }
      }
    `;

    const timestamp = (new Date).getTime().toString();
    this.serverless.service.custom.deployTime = timestamp;
    const deploymentLogicalId = `DeploymentApigEvent${timestamp}`;
    const deploymentTemplateJson = JSON.parse(deploymentTemplate);
    deploymentTemplateJson.DependsOn = this.methodDependencies;

    const newDeploymentObject = {
      [deploymentLogicalId]: deploymentTemplateJson,
    };

    _.merge(this.serverless.service.resources.Resources, newDeploymentObject);

    // create CLF Output for endpoint
    const outputServiceEndpointTemplate = `
    {
      "Description": "URL of the service endpoint",
      "Value": { "Fn::Join" : [ "", [ "https://", { "Ref": "RestApiApigEvent" },
        ".execute-api.${this.options.region}.amazonaws.com/${this.options.stage}"] ] }
    }`;

    const newOutputEndpointObject = {
      ServiceEndpoint: JSON.parse(outputServiceEndpointTemplate),
    };

    this.serverless.service.resources.Outputs =
      this.serverless.service.resources.Outputs || {};
    _.merge(this.serverless.service.resources.Outputs, newOutputEndpointObject);

    return BbPromise.resolve();
  },
};
