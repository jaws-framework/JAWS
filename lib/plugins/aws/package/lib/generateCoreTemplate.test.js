'use strict';

const sinon = require('sinon');
const path = require('path');
const chai = require('chai');
const AwsProvider = require('../../provider/awsProvider');
const Serverless = require('../../../../Serverless');
const validate = require('../../lib/validate');
const generateCoreTemplate = require('./generateCoreTemplate');

chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

describe('#generateCoreTemplate()', () => {
  let serverless;
  const awsPlugin = {};
  const functionName = 'test';

  beforeEach(() => {
    serverless = new Serverless();
    awsPlugin.serverless = serverless;
    awsPlugin.provider = new AwsProvider(serverless, {});
    awsPlugin.options = {
      stage: 'dev',
      region: 'us-east-1',
    };

    Object.assign(awsPlugin, generateCoreTemplate, validate);

    awsPlugin.serverless.cli = new serverless.classes.CLI();

    awsPlugin.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsPlugin.serverless.service.service = 'new-service';
    awsPlugin.serverless.service.functions = {
      [functionName]: {
        name: 'test',
        artifact: 'test.zip',
        handler: 'handler.hello',
      },
    };
  });

  it('should reject an S3 bucket that does not exist', () => {
    const bucketName = 'com.serverless.deploys';
    const errorObj = { message: 'Access Denied' };

    const createStackStub = sinon
      .stub(awsPlugin.provider, 'request').throws(errorObj);

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;
    return awsPlugin.generateCoreTemplate()
      .catch((err) => {
        expect(createStackStub.args[0][0]).to.equal('S3');
        expect(createStackStub.args[0][1]).to.equal('getBucketLocation');
        expect(createStackStub.args[0][2].Bucket).to.equal(bucketName);
        expect(err.message).to.contain(errorObj.message);
        expect(err.message).to.contain('Could not locate deployment bucket');
      })
      .then(() => {});
  });

  it('should throw error if S3 bucket name is invalid', () => {
    awsPlugin.serverless.service.provider.deploymentBucket = 'com.$erverle$$.deploy$';

    return expect(awsPlugin.generateCoreTemplate())
      .to.eventually.be.rejectedWith(Error, 'Bucket name must end with a letter or number.');
  });

  it('should validate the region for the given S3 bucket', () => {
    const bucketName = 'com.serverless.deploys';

    const getBucketLocationStub = sinon
      .stub(awsPlugin.provider, 'request').resolves({
        LocationConstraint: awsPlugin.options.region,
      });

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;
    return awsPlugin.generateCoreTemplate()
      .then(() => {
        expect(getBucketLocationStub.args[0][0]).to.equal('S3');
        expect(getBucketLocationStub.args[0][1]).to.equal('getBucketLocation');
        expect(getBucketLocationStub.args[0][2].Bucket).to.equal(bucketName);
      });
  });

  it('should reject an S3 bucket in the wrong region', () => {
    const bucketName = 'com.serverless.deploys';

    const createStackStub = sinon
      .stub(awsPlugin.provider, 'request').resolves({
        LocationConstraint: 'us-west-1',
      });

    awsPlugin.serverless.service.provider.deploymentBucket = 'com.serverless.deploys';
    return awsPlugin.generateCoreTemplate()
      .catch((err) => {
        expect(createStackStub.args[0][0]).to.equal('S3');
        expect(createStackStub.args[0][1]).to.equal('getBucketLocation');
        expect(createStackStub.args[0][2].Bucket).to.equal(bucketName);
        expect(err.message).to.contain('not in the same region');
      })
      .then(() => {});
  });

  it('should call #getCoreTemplateFileName if deploymentBucket not specified', () => {
    const getCoreTemplateFileNameStub = sinon
      .stub(awsPlugin.provider.naming, 'getCoreTemplateFileName')
      .returns('bla-bla');
    awsPlugin.serverless.config.servicePath = '/';
    awsPlugin.serverless.utils.writeFileSync = sinon.spy();

    return awsPlugin.generateCoreTemplate()
      .then(() => {
        expect(getCoreTemplateFileNameStub.callCount).to.equal(1);
      });
  });

  it('should not call #getCoreTemplateFileName if deploymentBucket specified', () => {
    const bucketName = 'com.serverless.deploys';

    const getCoreTemplateFileNameStub = sinon
      .stub(awsPlugin.provider.naming, 'getCoreTemplateFileName')
      .returns('bla-bla');
    sinon.stub(awsPlugin.provider, 'request').resolves({
      LocationConstraint: 'us-east-1',
    });

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;
    awsPlugin.serverless.config.servicePath = '/';
    awsPlugin.serverless.utils.writeFileSync = sinon.spy();

    return awsPlugin.generateCoreTemplate()
      .then(() => {
        expect(getCoreTemplateFileNameStub.callCount).to.equal(0);
      });
  });

  it('should use a custom bucket if specified', () => {
    const bucketName = 'com.serverless.deploys';

    awsPlugin.serverless.service.provider.deploymentBucket = bucketName;

    const coreCloudFormationTemplate = awsPlugin.serverless.utils.readFileSync(
      path.join(
        __dirname,
        'core-cloudformation-template.json'
      )
    );
    awsPlugin.serverless.service.provider
      .compiledCloudFormationTemplate = coreCloudFormationTemplate;

    sinon
      .stub(awsPlugin.provider, 'request')
      .resolves({ LocationConstraint: '' });

    return awsPlugin.generateCoreTemplate()
      .then(() => {
        expect(
          awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
            .Outputs.ServerlessDeploymentBucketName.Value
        ).to.equal(bucketName);
        // eslint-disable-next-line no-unused-expressions
        expect(
          awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
            .Resources.ServerlessDeploymentBucket
        ).to.not.exist;
      });
  });

  [
    { region: 'eu-west-1', response: 'EU' },
    { region: 'us-east-1', response: '' },
  ].forEach((value) => {
    it(`should handle inconsistent getBucketLocation responses for ${value.region} region`, () => {
      const bucketName = 'com.serverless.deploys';

      awsPlugin.options.region = value.region;

      sinon
        .stub(awsPlugin.provider, 'request').resolves({
          LocationConstraint: value.response,
        });

      awsPlugin.serverless.service.provider.deploymentBucket = bucketName;
      return awsPlugin.generateCoreTemplate()
        .then(() => {
          expect(
            awsPlugin.serverless.service.provider.compiledCloudFormationTemplate
              .Outputs.ServerlessDeploymentBucketName.Value
          ).to.equal(bucketName);
          awsPlugin.provider.request.restore();
        });
    });
  });

  it('should add a deployment bucket to the CF template, if not provided', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';

    return awsPlugin.generateCoreTemplate()
      .then(() => {
        const template = serverless.service.provider.coreCloudFormationTemplate;
        expect(template).to.not.equal(null);
      });
  });

  it('should add a custom output if S3 Transfer Acceleration is enabled', () => {
    sinon.stub(awsPlugin.provider, 'request').resolves();
    sinon.stub(serverless.utils, 'writeFileSync').resolves();
    serverless.config.servicePath = './';
    awsPlugin.provider.options['aws-s3-accelerate'] = true;

    return awsPlugin.generateCoreTemplate()
      .then(() => {
        const template = serverless.service.provider.coreCloudFormationTemplate;
        expect(template.Outputs.ServerlessDeploymentBucketAccelerated).to.not.equal(null);
        expect(template.Outputs.ServerlessDeploymentBucketAccelerated.Value).to.equal(true);
      });
  });
});
