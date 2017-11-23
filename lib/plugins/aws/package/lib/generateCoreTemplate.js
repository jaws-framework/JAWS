'use strict';

const BbPromise = require('bluebird');
const path = require('path');
const _ = require('lodash');
const validateS3BucketName = require('s3-bucket-name-validator');

module.exports = {
  generateCoreTemplate() {
    this.serverless.service.provider
      .compiledCloudFormationTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'package',
        'lib',
        'core-cloudformation-template.json')
    );

    const bucketName = this.serverless.service.provider.deploymentBucket;
    const isS3TransferAccelerationEnabled = this.provider.isS3TransferAccelerationEnabled();

    if (bucketName) {
      return BbPromise.bind(this)
        .then(() => {
          const bucketNameError = validateS3BucketName(bucketName);

          if (bucketNameError) {
            throw new this.serverless.classes.Error(bucketNameError);
          }
        })
        .then(() => this.provider.request('S3',
          'getBucketLocation',
          {
            Bucket: bucketName,
          },
          this.options.stage,
          this.options.region
        ))
        .catch(err => {
          throw new this.serverless.classes.Error(
            `Could not locate deployment bucket. Error: ${err.message}`
          );
        })
        .then(resultParam => {
          const result = resultParam;
          if (result.LocationConstraint === '') result.LocationConstraint = 'us-east-1';
          if (result.LocationConstraint === 'EU') result.LocationConstraint = 'eu-west-1';
          if (result.LocationConstraint !== this.options.region) {
            throw new this.serverless.classes.Error(
              'Deployment bucket is not in the same region as the lambda function'
            );
          }
          if (isS3TransferAccelerationEnabled) {
            const warningMessage =
              'Warning: S3 Transfer Acceleration will not be enabled on deploymentBucket.';
            this.serverless.cli.log(warningMessage);
          }
          this.bucketName = bucketName;
          this.serverless.service.package.deploymentBucket = bucketName;
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value = bucketName;

          delete this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket;
        });
    }

    this.serverless.service.provider.compiledCloudFormationTemplate
      .Resources.ServerlessDeploymentBucket.Properties = {
        AccelerateConfiguration: {
          AccelerationStatus:
            isS3TransferAccelerationEnabled ? 'Enabled' : 'Suspended',
        },
      };

    if (isS3TransferAccelerationEnabled) {
      this.serverless.service.provider.compiledCloudFormationTemplate
      .Outputs.ServerlessDeploymentBucketAccelerated = { Value: true };
    }

    const coreTemplateFileName = this.provider.naming.getCoreTemplateFileName();
    const coreTemplateFilePath = path.join(this.serverless.config.servicePath,
      '.serverless',
      coreTemplateFileName);

    this.serverless.utils.writeFileSync(coreTemplateFilePath,
      this.serverless.service.provider.compiledCloudFormationTemplate);

    this.serverless.service.provider.coreCloudFormationTemplate =
      _.cloneDeep(this.serverless.service.provider.compiledCloudFormationTemplate);

    return BbPromise.resolve();
  },

};
