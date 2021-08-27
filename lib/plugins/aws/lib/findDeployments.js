'use strict';

const _ = require('lodash');
const limit = require('ext/promise/limit').bind(Promise);

const MAX_CONCURRENT_S3_DOWNLOADS = 5;

const extractArtifactNames = (cloudformationTemplate) => {
  const { Resources: resources = {} } = cloudformationTemplate;
  const artifactNames = Object.entries(resources)
    .map(([, { Properties: properties }]) => _.get(properties, 'Code.S3Key'))
    .filter(Boolean);
  return [...new Set(artifactNames)]; // make unique
};

module.exports = {
  async findDeployments() {
    const deploymentPrefix = this.provider.getDeploymentPrefix();
    const serviceName = this.serverless.service.service;
    const stage = this.provider.getStage();
    const prefix = `${deploymentPrefix}/${serviceName}/${stage}`;

    const { Contents: files } = await this.provider.request('S3', 'listObjectsV2', {
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    if (!files || !files.length) return [];

    const compiledTemplateSuffix = this.provider.naming.getCompiledTemplateS3Suffix();
    const templateFileRegex = new RegExp(`${prefix}/(.+)-(.+-.+-.+)/${compiledTemplateSuffix}`);
    const deployments = files
      .map((file) => file.Key)
      .filter((file) => templateFileRegex.test(file))
      .map((templatePath) => {
        const [, timestamp, datetime] = templatePath.match(templateFileRegex);
        const templateDirectory = `${timestamp}-${datetime}`;
        return { timestamp, datetime, templateDirectory };
      });

    const limitedFetchTemplate = limit(
      MAX_CONCURRENT_S3_DOWNLOADS,
      async ({ templateDirectory, ...others }) => {
        const key = `${prefix}/${templateDirectory}/${compiledTemplateSuffix}`;
        try {
          const { Body: templateFileContents } = await this.provider.request('S3', 'getObject', {
            Bucket: this.bucketName,
            Key: key,
          });
          const artifactNames = extractArtifactNames(JSON.parse(templateFileContents));
          return { ...others, prefix, templateDirectory, artifactNames };
        } catch (error) {
          throw new Error(
            `Unable to retrieve Cloudformation template file from S3: ${this.bucketName}/${key}`
          );
        }
      }
    );

    return Promise.all(deployments.map((deployment) => limitedFetchTemplate(deployment)));
  },
};
