'use strict';

const _ = require('lodash');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const limit = require('ext/promise/limit').bind(Promise);
const filesize = require('filesize');
const normalizeFiles = require('../../lib/normalizeFiles');
const getLambdaLayerArtifactPath = require('../../utils/getLambdaLayerArtifactPath');
const ServerlessError = require('../../../../serverless-error');

const MAX_CONCURRENT_ARTIFACTS_UPLOADS =
  Number(process.env.SLS_MAX_CONCURRENT_ARTIFACTS_UPLOADS) || 3;

module.exports = {
  async uploadArtifacts() {
    await this.uploadCloudFormationFile();
    await this.uploadFunctionsAndLayers();
    await this.uploadCustomResources();
  },

  async uploadCloudFormationFile() {
    this.serverless.cli.log('Uploading CloudFormation file to S3...');

    const compiledTemplateFileName = this.provider.naming.getCompiledTemplateS3Suffix();

    const compiledCfTemplate = this.serverless.service.provider.compiledCloudFormationTemplate;
    const normCfTemplate = normalizeFiles.normalizeCloudFormationTemplate(compiledCfTemplate);
    const fileHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(normCfTemplate))
      .digest('base64');
    const { deploymentDirectoryPrefix, timestamp } = this.serverless.service.package;

    let params = {
      Bucket: this.bucketName,
      Key: `${deploymentDirectoryPrefix}/${timestamp}/${compiledTemplateFileName}`,
      Body: JSON.stringify(compiledCfTemplate),
      ContentType: 'application/json',
      Metadata: {
        filesha256: fileHash,
      },
    };

    const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
    if (deploymentBucketObject) {
      params = setServersideEncryptionOptions(params, deploymentBucketObject);
    }

    return this.provider.request('S3', 'upload', params);
  },

  async isAlreadyUploaded(key) {
    try {
      const params = {
        Bucket: this.bucketName,
        Key: key,
      };
      await this.provider.request('S3', 'headObject', params);
      return true;
    } catch (error) {
      if (error.code !== 'AWS_S3_HEAD_OBJECT_NOT_FOUND') {
        throw error;
      }
      return false;
    }
  },

  async uploadZipFile(artifactFilePath) {
    const stats = (() => {
      try {
        return fs.statSync(artifactFilePath);
      } catch (error) {
        throw new ServerlessError(
          `Cannot read file artifact "${artifactFilePath}": ${error.message}`,
          'INACCESSIBLE_FILE_ARTIFACT'
        );
      }
    })();

    // TODO refactor to be async (use util function to compute checksum async)
    const data = fs.readFileSync(artifactFilePath);
    const fileHash = crypto.createHash('sha256').update(data).digest('base64');
    const fileName = path.basename(artifactFilePath, '.zip');
    const {
      artifactsMap = {},
      deploymentDirectoryPrefix,
      timestamp,
    } = this.serverless.service.package;
    const s3Key =
      artifactsMap[artifactFilePath] || `${deploymentDirectoryPrefix}/${timestamp}/${fileName}`;

    if (await this.isAlreadyUploaded(s3Key)) {
      this.serverless.cli.log(`Artifact ${fileName} already uploaded to ${s3Key}`);
      return;
    }

    this.serverless.cli.log(
      `Uploading service ${fileName} ZIP file to S3 (${filesize(stats.size)})...`
    );

    const artifactStream = fs.createReadStream(artifactFilePath);

    // As AWS SDK request might be postponed (requests are queued)
    // eventual stream error may crash the process (it's thrown as uncaught if not observed).
    // Below lines prevent that
    let streamError;
    artifactStream.on('error', (error) => (streamError = error));

    let params = {
      Bucket: this.bucketName,
      Key: s3Key,
      Body: artifactStream,
      ContentType: 'application/zip',
      Metadata: {
        filesha256: fileHash,
      },
    };

    const deploymentBucketObject = this.serverless.service.provider.deploymentBucketObject;
    if (deploymentBucketObject) {
      params = setServersideEncryptionOptions(params, deploymentBucketObject);
    }

    await this.provider.request('S3', 'upload', params);
    // Interestingly, if request handling was queued, and stream errored (before being consumed by
    // AWS SDK) then SDK call succeeds without actually uploading a file to S3 bucket.
    // Below line ensures that eventual stream error is communicated
    if (streamError) throw streamError;
  },

  async uploadFunctionsAndLayers() {
    this.serverless.cli.log('Uploading artifacts...');

    const functionNames = this.serverless.service.getAllFunctions();
    let artifactFilePaths = _.uniq(
      functionNames
        .map((name) => {
          const functionObject = this.serverless.service.getFunction(name);
          if (functionObject.image) return null;
          const functionArtifactFileName = this.provider.naming.getFunctionArtifactName(name);
          functionObject.package = functionObject.package || {};
          const artifactFilePath =
            functionObject.package.artifact || this.serverless.service.package.artifact;

          if (
            !artifactFilePath ||
            (this.serverless.service.artifact && !functionObject.package.artifact)
          ) {
            if (
              this.serverless.service.package.individually ||
              functionObject.package.individually
            ) {
              const artifactFileName = functionArtifactFileName;
              return path.join(this.packagePath, artifactFileName);
            }
            return path.join(this.packagePath, this.provider.naming.getServiceArtifactName());
          }

          return artifactFilePath;
        })
        .filter(Boolean)
    );

    const layerNames = this.serverless.service.getAllLayers();
    artifactFilePaths = artifactFilePaths.concat(
      layerNames
        .map((name) => {
          const layerObject = this.serverless.service.getLayer(name);
          if (layerObject.artifactAlreadyUploaded) {
            this.serverless.cli.log(`Skip uploading ${name}`);
            return null;
          }
          return getLambdaLayerArtifactPath(
            this.packagePath,
            name,
            this.provider.serverless.service,
            this.provider.naming
          );
        })
        .filter(Boolean)
    );

    const limitedUpload = limit(MAX_CONCURRENT_ARTIFACTS_UPLOADS, async (artifactFilePath) =>
      this.uploadZipFile(artifactFilePath)
    );
    await Promise.all(artifactFilePaths.map((file) => limitedUpload(file)));
  },

  async uploadCustomResources() {
    const artifactFilePath = path.join(
      this.serverless.serviceDir,
      '.serverless',
      this.provider.naming.getCustomResourcesArtifactName()
    );

    if (this.serverless.utils.fileExistsSync(artifactFilePath)) {
      this.serverless.cli.log('Uploading custom CloudFormation resources...');
      await this.uploadZipFile(artifactFilePath);
    }
  },
};

function setServersideEncryptionOptions(putParams, deploymentBucketOptions) {
  const encryptionFields = [
    ['serverSideEncryption', 'ServerSideEncryption'],
    ['sseCustomerAlgorithim', 'SSECustomerAlgorithm'],
    ['sseCustomerKey', 'SSECustomerKey'],
    ['sseCustomerKeyMD5', 'SSECustomerKeyMD5'],
    ['sseKMSKeyId', 'SSEKMSKeyId'],
  ];

  const params = putParams;

  encryptionFields.forEach((element) => {
    if (deploymentBucketOptions[element[0]]) {
      params[element[1]] = deploymentBucketOptions[element[0]];
    }
  }, this);

  return params;
}
