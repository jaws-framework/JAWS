'use strict';

const BbPromise = require('bluebird');
const path = require('path');

module.exports = {
  configureStack() {
    this.serverless.service.provider
      .compiledCloudFormationTemplate = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
        'plugins',
        'aws',
        'deploy',
        'lib',
        'core-cloudformation-template.json')
    );

    if (this.serverless.service.provider.deploymentBucket) {
      return BbPromise.bind(this)
        .then(() => this.provider.resolveExportValue(
          this.serverless.service.provider.deploymentBucket)
        )
        .then(bucketName => {
          this.bucketName = bucketName;
          return this.validateS3BucketName(bucketName);
        })
        .then(() => this.provider.request('S3',
          'getBucketLocation',
          {
            Bucket: this.bucketName,
          },
          this.options.stage,
          this.options.region
        ))
        .then(resultParam => {
          const result = resultParam;
          if (result.LocationConstraint === '') result.LocationConstraint = 'us-east-1';
          if (result.LocationConstraint === 'EU') result.LocationConstraint = 'eu-west-1';
          if (result.LocationConstraint !== this.options.region) {
            throw new this.serverless.classes.Error(
              'Deployment bucket is not in the same region as the lambda function'
            );
          }
          this.serverless.service.package.deploymentBucket = this.bucketName;
          this.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value = this.bucketName;

          delete this.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket;
        });
    }

    return BbPromise.resolve();
  },

};
