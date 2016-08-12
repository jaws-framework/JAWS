'use strict';

const _ = require('lodash');

class AwsCompileS3Events {
  constructor(serverless) {
    this.serverless = serverless;
    this.provider = 'aws';

    this.hooks = {
      'deploy:compileEvents': this.compileS3Events.bind(this),
    };
  }

  compileS3Events() {
    if (!this.serverless.service.resources.Resources) {
      throw new this.serverless.classes.Error(
        'This plugin needs access to Resources section of the AWS CloudFormation template');
    }

    this.serverless.service.getAllFunctions().forEach((functionName) => {
      const functionObj = this.serverless.service.getFunction(functionName);

      if (functionObj.events) {
        for (let i = 0; i < functionObj.events.length; i++) {
          const event = functionObj.events[i];

          if (event.s3) {
            let BucketName;
            let Event = 's3:ObjectCreated:*';

            if (typeof event.s3 === 'object') {
              if (!event.s3.bucket) {
                const errorMessage = [
                  `Missing "bucket" property for s3 event in function ${functionName}.`,
                  ' The correct syntax is: s3: bucketName OR an object with "bucket" property.',
                  ' Please check the docs for more info.',
                ].join('');
                throw new this.serverless.classes
                  .Error(errorMessage);
              }
              BucketName = event.s3.bucket;
              if (event.s3.event) {
                Event = event.s3.event;
              }
            } else if (typeof event.s3 === 'string') {
              BucketName = event.s3;
            } else {
              const errorMessage = [
                `S3 event of function ${functionName} is not an object nor a string.`,
                ' The correct syntax is: s3: bucketName OR an object with "bucket" property.',
                ' Please check the docs for more info.',
              ].join('');
              throw new this.serverless.classes
                .Error(errorMessage);
            }

            const notificationTemplate = `
              "NotificationConfiguration": {
                "LambdaConfigurations": [
                  {
                    "Event": "${Event}",
                    "Function": {
                      "Fn::GetAtt": [
                        "${functionName}",
                        "Arn"
                      ]
                    }
                  }
                ]
              }`;

            const bucketTemplate = `
              {
                "Type": "AWS::S3::Bucket",
                "Properties": {
                  "BucketName": "${BucketName}",
                  ${notificationTemplate}
                }
              }
            `;

            const permissionTemplate = `
              {
                "Type": "AWS::Lambda::Permission",
                "Properties": {
                  "FunctionName": {
                    "Fn::GetAtt": [
                      "${functionName}",
                      "Arn"
                    ]
                  },
                  "Action": "lambda:InvokeFunction",
                  "Principal": "s3.amazonaws.com"
                }
              }
            `;

            const bucketResourceKey = BucketName.replace(/-/g, '') + i;

            // check if bucket already appears in resources
            // (currently supports only 1 event per bucket)
            const existingBucket = _.find(this.serverless.service.resources.Resources, {
              Type: 'AWS::S3::Bucket',
              Properties: { BucketName },
            });

            if (existingBucket) {
              // bucket already exists in the resources, so only add the notification
              _.merge(existingBucket.Properties, JSON.parse(`{${notificationTemplate}}`));
            } else {
              // create the bucket resource object
              const newBucketObject = {
                [`${bucketResourceKey}S3Event`]: JSON.parse(bucketTemplate),
              };

              _.merge(this.serverless.service.resources.Resources, newBucketObject);
            }

            // add permission object
            const newPermissionObject = {
              [`${bucketResourceKey}S3EventPermission`]: JSON.parse(permissionTemplate),
            };

            _.merge(this.serverless.service.resources.Resources,
              newPermissionObject);
          }
        }
      }
    });
  }
}

module.exports = AwsCompileS3Events;
