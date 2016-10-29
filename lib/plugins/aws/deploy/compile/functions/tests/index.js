'use strict';

const path = require('path');
const expect = require('chai').expect;

const AwsCompileFunctions = require('../index');
const AwsProvider = require('../../../../provider/awsProvider');
const Serverless = require('../../../../../../Serverless');

describe('AwsCompileFunctions', () => {
  let serverless;
  let awsCompileFunctions;
  const functionName = 'test';
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileFunctions = new AwsCompileFunctions(serverless, options);
    awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate = {
      Resources: {},
      Outputs: {},
    };
    awsCompileFunctions.serverless.service.service = 'new-service';
    awsCompileFunctions.serverless.service.package.artifactDirectoryName = 'somedir';
    awsCompileFunctions.serverless.service.package.artifact = 'artifact.zip';
    awsCompileFunctions.serverless.service.functions = {};
    awsCompileFunctions.serverless.service.functions[functionName] = {
      name: 'test',
      artifact: 'test.zip',
      handler: 'handler.hello',
    };
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileFunctions.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileFunctions()', () => {
    it('should throw if no service artifact', () => {
      awsCompileFunctions.serverless.service.package.artifact = null;
      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should throw if no individual artifact', () => {
      awsCompileFunctions.serverless.service.package.individually = true;
      awsCompileFunctions.serverless.service.functions[functionName].artifact = null;
      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should use service artifact if not individually', () => {
      awsCompileFunctions.serverless.service.package.individually = false;
      awsCompileFunctions.compileFunctions();

      const functionResource = awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[
          awsCompileFunctions.provider.naming.getLogicalLambdaName(functionName)
        ];

      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.package.artifact
                          .split(path.sep).pop();

      expect(functionResource.Properties.Code.S3Key)
        .to.deep.equal(`${s3Folder}/${s3FileName}`);
    });

    it('should use function artifact if individually', () => {
      awsCompileFunctions.serverless.service.package.individually = true;
      awsCompileFunctions.compileFunctions();

      const functionResource = awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate.Resources[
          awsCompileFunctions.provider.naming.getLogicalLambdaName(functionName)
        ];

      const s3Folder = awsCompileFunctions.serverless.service.package.artifactDirectoryName;
      const s3FileName = awsCompileFunctions.serverless.service.functions[functionName].artifact
                          .split(path.sep).pop();

      expect(functionResource.Properties.Code.S3Key)
        .to.deep.equal(`${s3Folder}/${s3FileName}`);
    });

    it('should add iamRoleARN', () => {
      awsCompileFunctions.serverless.service.provider.name = 'aws';
      awsCompileFunctions.serverless.service.provider.iamRoleARN = 'some:aws:arn:xxx:*:*';
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileFunctions.provider.naming.getLogicalLambdaName('func')].Properties.Role
      ).to.deep.equal(awsCompileFunctions.serverless.service.provider.iamRoleARN);
    });

    it('should throw an error if the function handler is not present', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          name: 'new-service-dev-func',
        },
      };

      expect(() => awsCompileFunctions.compileFunctions()).to.throw(Error);
    });

    it('should create a simple function resource', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
            S3Bucket: { Ref: awsCompileFunctions.provider.naming.getLogicalDeploymentBucketName() },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': [awsCompileFunctions.provider.naming.getLogicalRoleName(), 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsCompileFunctions.provider.naming.getLogicalLambdaName('func')]
      ).to.deep.equal(compiledFunction);
    });

    it('should create a function resource with VPC config', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          vpc: {
            securityGroupIds: ['xxx'],
            subnetIds: ['xxx'],
          },
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
            S3Bucket: { Ref: awsCompileFunctions.provider.naming.getLogicalDeploymentBucketName() },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': [awsCompileFunctions.provider.naming.getLogicalRoleName(), 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
          VpcConfig: {
            SecurityGroupIds: ['xxx'],
            SubnetIds: ['xxx'],
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsCompileFunctions.provider.naming.getLogicalLambdaName('func')]
      ).to.deep.equal(compiledFunction);

      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
        },
      };
    });

    it('should consider function based config when creating a function resource', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          name: 'customized-func-function',
          handler: 'func.function.handler',
          memorySize: 128,
          timeout: 10,
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
            S3Bucket: { Ref: awsCompileFunctions.provider.naming.getLogicalDeploymentBucketName() },
          },
          FunctionName: 'customized-func-function',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': [awsCompileFunctions.provider.naming.getLogicalRoleName(), 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 10,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsCompileFunctions.provider.naming.getLogicalLambdaName('func')]
      ).to.deep.equal(compiledFunction);
    });

    it('should allow functions to use a different runtime' +
      ' than the service default runtime if specified', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
          runtime: 'python2.7',
        },
      };

      awsCompileFunctions.compileFunctions();

      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
            S3Bucket: { Ref: awsCompileFunctions.provider.naming.getLogicalDeploymentBucketName() },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': [awsCompileFunctions.provider.naming.getLogicalRoleName(), 'Arn'] },
          Runtime: 'python2.7',
          Timeout: 6,
        },
      };

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileFunctions.provider.naming.getLogicalLambdaName('func')]
      ).to.deep.equal(compiledFunction);
    });

    it('should default to the nodejs4.3 runtime when no provider runtime is given', () => {
      awsCompileFunctions.serverless.service.provider.runtime = null;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
            S3Bucket: { Ref: awsCompileFunctions.provider.naming.getLogicalDeploymentBucketName() },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 1024,
          Role: { 'Fn::GetAtt': [awsCompileFunctions.provider.naming.getLogicalRoleName(), 'Arn'] },
          Runtime: 'nodejs4.3',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsCompileFunctions.provider.naming.getLogicalLambdaName('func')]
      ).to.deep.equal(compiledFunction);
    });

    it('should consider the providers runtime and memorySize ' +
      'when creating a function resource', () => {
      awsCompileFunctions.serverless.service.provider.runtime = 'python2.7';
      awsCompileFunctions.serverless.service.provider.memorySize = 128;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
            S3Bucket: { Ref: awsCompileFunctions.provider.naming.getLogicalDeploymentBucketName() },
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': [awsCompileFunctions.provider.naming.getLogicalRoleName(), 'Arn'] },
          Runtime: 'python2.7',
          Timeout: 6,
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsCompileFunctions.provider.naming.getLogicalLambdaName('func')]
      ).to.deep.equal(compiledFunction);
    });

    it('should use a custom bucket if specified', () => {
      const bucketName = 'com.serverless.deploys';

      awsCompileFunctions.serverless.service.package.deploymentBucket = bucketName;
      awsCompileFunctions.serverless.service.provider.runtime = 'python2.7';
      awsCompileFunctions.serverless.service.provider.memorySize = 128;
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          name: 'new-service-dev-func',
        },
      };
      const compiledFunction = {
        Type: 'AWS::Lambda::Function',
        Properties: {
          Code: {
            S3Key: `${awsCompileFunctions.serverless.service.package.artifactDirectoryName}/${
              awsCompileFunctions.serverless.service.package.artifact}`,
            S3Bucket: bucketName,
          },
          FunctionName: 'new-service-dev-func',
          Handler: 'func.function.handler',
          MemorySize: 128,
          Role: { 'Fn::GetAtt': [awsCompileFunctions.provider.naming.getLogicalRoleName(), 'Arn'] },
          Runtime: 'python2.7',
          Timeout: 6,
        },
      };
      const coreCloudFormationTemplate = awsCompileFunctions.serverless.utils.readFileSync(
        path.join(
          __dirname,
          '..',
          '..',
          '..',
          'lib',
          'core-cloudformation-template.json'
        )
      );
      awsCompileFunctions.serverless.service.provider
        .compiledCloudFormationTemplate = coreCloudFormationTemplate;

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[awsCompileFunctions.provider.naming.getLogicalLambdaName('func')]
      ).to.deep.equal(compiledFunction);
    });

    it('should include description if specified', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
          description: 'Lambda function description',
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Resources[
            awsCompileFunctions.provider.naming.getLogicalLambdaName('func')
        ].Properties.Description
      ).to.equal('Lambda function description');
    });

    it('should create corresponding function output objects', () => {
      awsCompileFunctions.serverless.service.functions = {
        func: {
          handler: 'func.function.handler',
        },
        anotherFunc: {
          handler: 'anotherFunc.function.handler',
        },
      };

      const expectedOutputs = {
        [awsCompileFunctions.provider.naming.getLogicalLambdaArnName('func')]: {
          Description: 'Lambda function info',
          Value: {
            'Fn::GetAtt': [
              awsCompileFunctions.provider.naming.getLogicalLambdaName('func'),
              'Arn',
            ],
          },
        },
        [awsCompileFunctions.provider.naming.getLogicalLambdaArnName('anotherFunc')]: {
          Description: 'Lambda function info',
          Value: {
            'Fn::GetAtt': [
              awsCompileFunctions.provider.naming.getLogicalLambdaName('anotherFunc'),
              'Arn',
            ],
          },
        },
      };

      awsCompileFunctions.compileFunctions();

      expect(
        awsCompileFunctions.serverless.service.provider.compiledCloudFormationTemplate
          .Outputs
      ).to.deep.equal(
        expectedOutputs
      );
    });
  });
});
