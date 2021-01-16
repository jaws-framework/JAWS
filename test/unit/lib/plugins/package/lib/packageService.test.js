'use strict';

const path = require('path');
const fs = require('fs');
const chai = require('chai');
const sinon = require('sinon');
const { listFileProperties, listZipFiles } = require('../../../../../utils/fs');
const runServerless = require('../../../../../utils/run-serverless');
const fixtures = require('../../../../../fixtures');

// Configure chai
chai.use(require('chai-as-promised'));
chai.use(require('sinon-chai'));
const { expect } = require('chai');

describe('lib/plugins/package/lib/packageService.test.js', () => {
  const mockedDescribeStacksResponse = {
    CloudFormation: {
      describeStacks: {
        Stacks: [
          {
            Outputs: [
              { OutputKey: 'LayerLambdaLayerHash', OutputValue: '123' },
              { OutputKey: 'LayerLambdaLayerS3Key', OutputValue: 'path/to/layer.zip' },
            ],
          },
        ],
      },
    },
  };

  describe('service wide', () => {
    let fnIndividualZippedFiles;
    let fnLayerFiles;
    let fnFileProperties;

    before(async () => {
      const {
        fixtureData: { servicePath },
      } = await runServerless({
        fixture: 'packaging',
        cliArgs: ['package'],
        awsRequestStubMap: mockedDescribeStacksResponse,
        configExt: {
          package: {
            exclude: ['dir1/**', '!dir1/subdir3/**'],
            include: ['dir1/subdir2/**', '!dir1/subdir2/subsubdir1'],
          },
          functions: {
            fnIndividual: {
              handler: 'index.handler',
              package: {
                individually: true,
                include: 'dir1/subdir4/**',
                exclude: 'dir3/**',
              },
            },
          },
        },
      });

      fnIndividualZippedFiles = await listZipFiles(
        path.join(servicePath, '.serverless', 'fnIndividual.zip')
      );
      fnLayerFiles = await listZipFiles(path.join(servicePath, '.serverless', 'layer.zip'));
      fnFileProperties = await listFileProperties(
        path.join(servicePath, '.serverless', 'fnIndividual.zip')
      );
    });

    it('should exclude defaults', () => {
      expect(fnIndividualZippedFiles).to.not.include('.gitignore');
    });

    it('should exclude service config', () => {
      expect(fnIndividualZippedFiles).to.not.include('serverless.yml');
    });

    describe('with useDotenv', () => {
      it('should exclude .env files', async () => {
        const {
          fixtureData: { servicePath },
        } = await runServerless({
          fixture: 'packaging',
          cliArgs: ['package'],
          awsRequestStubMap: mockedDescribeStacksResponse,
          configExt: {
            useDotenv: true,
            functions: {
              fnIndividual: {
                handler: 'index.handler',
                package: { individually: true },
              },
            },
          },
        });

        const zippedFiles = await listZipFiles(
          path.join(servicePath, '.serverless', 'fnIndividual.zip')
        );

        expect(zippedFiles).to.not.include('.env');
        expect(zippedFiles).to.not.include('.env.stage');
      });
    });

    it('should exclude default plugins localPath', () => {
      expect(fnIndividualZippedFiles).to.not.include('.serverless-plugins/index.js');
    });

    it('should support `package.exclude`', () => {
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir1/index.js');
      expect(fnIndividualZippedFiles).to.include('dir1/subdir3/index.js');
    });

    it('should support `package.include`', () => {
      expect(fnIndividualZippedFiles).to.include('dir1/subdir2/index.js');
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir2/subsubdir1/index.js');
      expect(fnIndividualZippedFiles).to.include('dir1/subdir2/subsubdir2/index.js');
    });

    it('should support `functions[].package.individually`', () => {
      expect(fnIndividualZippedFiles).to.include('artifact.zip');
    });

    it('should support `functions[].package.include`', () => {
      expect(fnIndividualZippedFiles).to.include('dir1/subdir4/index.js');
    });

    (process.platform === 'win32' ? it : it.skip)(
      'should mark go runtime handler files as executable on windows',
      () => {
        expect(fnFileProperties['main.go'].unixPermissions).to.equal(Math.pow(2, 15) + 0o755);
      }
    );

    it('should package layer', () => {
      expect(fnLayerFiles).to.include('layer-module-1.js');
      expect(fnLayerFiles).to.include('layer-module-2.js');
    });
  });

  describe('individually', () => {
    let fnIndividualZippedFiles;
    let serverless;

    before(async () => {
      const {
        fixtureData: { servicePath },
        serverless: serverlessInstance,
      } = await runServerless({
        fixture: 'packaging',
        cliArgs: ['package'],
        awsRequestStubMap: mockedDescribeStacksResponse,
        configExt: {
          package: {
            individually: true,
            artifact: 'artifact.zip',
            exclude: ['dir1/**', '!dir1/subdir3/**'],
            include: ['dir1/subdir2/**', '!dir1/subdir2/subsubdir1'],
          },
          functions: {
            fnIndividual: {
              handler: 'index.handler',
              package: { individually: true, include: 'dir1/subdir3/**', exclude: 'dir1/subdir1' },
            },
          },
          plugins: {
            localPath: './custom-plugins',
            modules: ['index'],
          },
        },
      });
      serverless = serverlessInstance;

      fnIndividualZippedFiles = await listZipFiles(
        path.join(servicePath, '.serverless', 'fnIndividual.zip')
      );
    });

    it('should exclude custom plugins localPath', () => {
      expect(fnIndividualZippedFiles).to.not.include('.custom-plugins/index.js');
    });

    it('TODO: should ignore `package.artifact` if `package.individually`', () => {
      expect(serverless.service.getFunction('fnIndividual').package.artifact).to.exist;
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L237-L260
    });

    it('should support `package.individually`', () => {
      expect(fnIndividualZippedFiles).to.include('dir1/subdir3/index.js');
    });

    it('should support `package.exclude`', () => {
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir1/index.js');
    });

    it('should support `package.include`', () => {
      expect(fnIndividualZippedFiles).to.include('dir1/subdir2/index.js');
      expect(fnIndividualZippedFiles).to.not.include('dir1/subdir2/subsubdir1/index.js');
    });
  });

  describe('pre-prepared artifact', () => {
    before(async () => {
      await runServerless({
        fixture: 'packaging',
        cliArgs: ['package'],
        awsRequestStubMap: mockedDescribeStacksResponse,
        configExt: {
          package: {
            artifact: 'artifact.zip',
            exclude: ['dir1', '!dir1/subdir3/**'],
            include: ['dir1/subdir2/**', '!dir1/subdir2/subsubdir1'],
          },
          functions: {
            fnIndividual: {
              handler: 'index.handler',
              package: { individually: true, include: 'dir1/subdir3/**', exclude: 'dir1/subdir2' },
            },
            fnArtifact: {
              handler: 'index.handler',
              package: { artifact: 'artifact-function.zip' },
            },
          },
        },
      });
    });
    it.skip('TODO: should support `package.artifact`', () => {
      // Confirm that file pointed at `package.artifact` is configured as service level artifact
      //
      // Replace
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L227-L235
    });

    it.skip('TODO: should ignore `package.artifact` if `functions[].package.individually', () => {
      // Confirm that fnIndividual was packaged independently
      //
      // Replace
      // https://github.com/serverless/serverless/blob/b12d565ea0ad588445fb120e049db157afc7bf37/test/unit/lib/plugins/package/lib/packageService.test.js#L262-L287
    });

    it.skip('TODO: should support `functions[].package.artifact`', () => {
      // Confirm that file pointed at `functions.fnArtifact.package.artifact` is configured as function level artifact
    });
  });

  describe('pre-prepared artifact with absolute artifact path', () => {
    describe('while deploying whole service', () => {
      const s3UploadStub = sinon.stub();
      const awsRequestStubMap = {
        Lambda: {
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
            },
          },
        },
        S3: {
          upload: s3UploadStub,
          listObjectsV2: {},
        },
        CloudFormation: {
          describeStacks: {},
          describeStackResource: { StackResourceDetail: { PhysicalResourceId: 'resource-id' } },
        },
        STS: {
          getCallerIdentity: {
            ResponseMetadata: { RequestId: 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
            UserId: 'XXXXXXXXXXXXXXXXXXXXX',
            Account: '999999999999',
            Arn: 'arn:aws:iam::999999999999:user/test',
          },
        },
      };

      beforeEach(() => {
        s3UploadStub.resetHistory();
      });

      it('for function', async () => {
        const { servicePath, updateConfig } = await fixtures.setup('packageArtifact');
        const absoluteArtifactFilePath = path.join(servicePath, 'absoluteArtifact.zip');

        await updateConfig({
          functions: {
            other: {
              package: {
                artifact: absoluteArtifactFilePath,
              },
            },
          },
        });

        await runServerless({
          cwd: servicePath,
          cliArgs: ['deploy'],
          lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
          awsRequestStubMap,
        });

        const callArgs = s3UploadStub.args.find((item) =>
          item[0].Key.endsWith('absoluteArtifact.zip')
        );
        expect(callArgs[0].Body.path).to.equal(absoluteArtifactFilePath);
      });

      it('service-wide', async () => {
        const { servicePath, updateConfig } = await fixtures.setup('packageArtifact');
        const absoluteArtifactFilePath = path.join(servicePath, 'absoluteArtifact.zip');

        await updateConfig({
          package: {
            artifact: absoluteArtifactFilePath,
          },
        });
        await runServerless({
          cwd: servicePath,
          cliArgs: ['deploy'],
          lastLifecycleHookName: 'aws:deploy:deploy:uploadArtifacts',
          awsRequestStubMap,
        });

        const callArgs = s3UploadStub.args.find((item) =>
          item[0].Key.endsWith('absoluteArtifact.zip')
        );
        expect(callArgs[0].Body.path).to.equal(absoluteArtifactFilePath);
      });
    });

    describe('while deploying specific function', () => {
      const updateFunctionCodeStub = sinon.stub();
      const awsRequestStubMap = {
        Lambda: {
          getFunction: {
            Configuration: {
              LastModified: '2020-05-20T15:34:16.494+0000',
            },
          },
          updateFunctionCode: updateFunctionCodeStub,
          updateFunctionConfiguration: {},
        },
      };

      beforeEach(() => {
        updateFunctionCodeStub.resetHistory();
      });

      it('for function', async () => {
        const { servicePath, updateConfig } = await fixtures.setup('packageArtifact');
        const absoluteArtifactFilePath = path.join(servicePath, 'absoluteArtifact.zip');
        const zipContent = await fs.promises.readFile(absoluteArtifactFilePath);

        await updateConfig({
          functions: {
            other: {
              package: {
                artifact: absoluteArtifactFilePath,
              },
            },
          },
        });
        await runServerless({
          cwd: servicePath,
          cliArgs: ['deploy', '-f', 'other'],
          awsRequestStubMap,
        });
        expect(updateFunctionCodeStub).to.have.been.calledOnce;
        expect(updateFunctionCodeStub.args[0][0].ZipFile).to.deep.equal(Buffer.from(zipContent));
      });

      it('service-wide', async () => {
        const { servicePath, updateConfig } = await fixtures.setup('packageArtifact');
        const absoluteArtifactFilePath = path.join(servicePath, 'absoluteArtifact.zip');
        const zipContent = await fs.promises.readFile(absoluteArtifactFilePath);

        await updateConfig({
          package: {
            artifact: absoluteArtifactFilePath,
          },
        });
        await runServerless({
          cwd: servicePath,
          cliArgs: ['deploy', '-f', 'foo'],
          awsRequestStubMap,
        });
        expect(updateFunctionCodeStub).to.have.been.calledOnce;
        expect(updateFunctionCodeStub.args[0][0].ZipFile).to.deep.equal(Buffer.from(zipContent));
      });
    });
  });
});
