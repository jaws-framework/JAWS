'use strict';

const _ = require('lodash');

class AwsCompileSNSEvents {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileEvents': this.compileSNSEvents.bind(this),
    };
  }

  existingTopic(topicName) {
    const resources = this.serverless.service.resources.Resources;

    const resourceName = Object.keys(resources).find((name) => (
      resources[name].Type === 'AWS::SNS::Topic' &&
        resources[name].Properties.TopicName === topicName
    ));

    return resourceName;
  }

  compileSNSEvents() {
    if (!this.serverless.service.resources.Resources) {
      throw new this.serverless.classes
        .Error('This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        for (let i = 0; i < functionObj.events.length; i++) {
          const event = functionObj.events[i];
          if (event.sns) {
            let topicName;
            let displayName = '';
            let topicArn;

            if (typeof event.sns === 'object') {
              if (event.sns.topicArn) {
                topicArn = event.sns.topicArn;
              } else if (!event.sns.topicName || !event.sns.displayName) {
                const errorMessage = [
                  `Missing "topicName" property for sns event in function ${functionName}`,
                  ' The correct syntax is: sns: topic-name',
                  ' OR an object with "topicName" AND "displayName" properties.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              } else {
                topicName = event.sns.topicName;
                displayName = event.sns.displayName;
              }
            } else if (typeof event.sns === 'string') {
              if (event.sns.indexOf(':') === -1) {
                topicName = event.sns;
              } else {
                topicArn = event.sns;
              }
            } else {
              const errorMessage = [
                `SNS event of function ${functionName} is not an object nor a string`,
                ' The correct syntax is: sns: topic-name',
                ' OR an object with "topicName" AND "displayName" properties.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const snsTemplate = `
              {
                "Type": "AWS::SNS::Topic",
                "Properties": {
                  "TopicName": "${topicName}",
                  "DisplayName": "${displayName}",
                  "Subscription": [
                    {
                      "Endpoint": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                      "Protocol": "lambda"
                    }
                  ]
                }
              }
            `;

            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "sns.amazonaws.com",
                  "SourceArn": { "Ref": "${functionName}SNSEvent${i}" }
                }
              }
            `;

            const newPermissionObject = {
              [`${functionName}SNSEventPermission${i}`]: JSON.parse(permissionTemplate),
            };

            const existingResourceName = this.existingTopic(topicName);
            // Modify existing topic resource if one already exists
            if (existingResourceName) {
              const newSNSSubscription = JSON.parse(`{
                    "Endpoint": { "Fn::GetAtt": ["${functionName}", "Arn"] },
                    "Protocol": "lambda"}`);

              if (!this.serverless.service.resources.Resources[existingResourceName].Properties
                .hasOwnProperty('Subscription')) {
                // Set subscription to empty array if the property does not exist
                this.serverless.service.resources.Resources[existingResourceName].Properties
                  .Subscription = [];
              }
              this.serverless.service.resources.Resources[existingResourceName].Properties
                .Subscription.push(newSNSSubscription);

              // Reference existing SNS Topic Resource if found
              newPermissionObject[`${functionName}SNSEventPermission${i}`]
                  .Properties.SourceArn = { Ref: existingResourceName };
            } else {
              const newSNSObject = {
                [`${functionName}SNSEvent${i}`]: JSON.parse(snsTemplate),
              };

              // create new topic if no topic arn provided
              if (!topicArn) {
                _.merge(this.serverless.service.resources.Resources,
                  newSNSObject);
              } else {
                newPermissionObject[`${functionName}SNSEventPermission${i}`]
                  .Properties.SourceArn = topicArn;
              }
            }

            _.merge(this.serverless.service.resources.Resources, newPermissionObject);
          }
        }
      }
    });
  }
}

module.exports = AwsCompileSNSEvents;
