'use strict';

const chai = require('chai');
const sinon = require('sinon');
const path = require('path');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const overrideStdoutWrite = require('process-utils/override-stdout-write');
const runServerless = require('../../../../../tests/utils/run-serverless');
const fixtures = require('../../../../../tests/fixtures');
const { extendedValidate } = require('./extendedValidate');

chai.use(require('sinon-chai'));

const expect = chai.expect;

describe('extendedValidate', () => {
  let runServelessOptions;
  let extendedValidateStub;

  before(() => {
    extendedValidateStub = sinon.stub().callsFake(function(...args) {
      return extendedValidate.apply(this, args);
    });
    runServelessOptions = {
      // Mimic existence of AWS cres
      env: { AWS_CONTAINER_CREDENTIALS_FULL_URI: 'ignore' },
      lastLifecycleHookName: 'before:deploy:deploy',
      modulesCacheStub: {
        [require.resolve('./extendedValidate')]: {
          extendedValidate: extendedValidateStub,
        },
      },
    };
  });

  afterEach(() => {
    sinon.resetHistory();
    return fixtures.cleanup({ extraPaths: ['_test-package'] });
  });

  describe('extendedValidate()', () => {
    it('should throw error if state file does not exist', () =>
      runServerless(
        Object.assign(
          {
            config: { service: 'irrelevant', provider: 'aws' },
            cliArgs: ['package', '--package', '_test-package'],
          },
          runServelessOptions
        )
      ).then(serverless => {
        const { servicePath } = serverless.config;
        return fse
          .removeAsync(path.join(servicePath, '_test-package/serverless-state.json'))
          .then(() =>
            runServerless(
              Object.assign(
                {
                  cwd: servicePath,
                  cliArgs: ['deploy', '--package', '_test-package'],
                },
                runServelessOptions
              )
            ).then(
              () => {
                throw new Error('Unexpected');
              },
              error => expect(error.message).to.include('No serverless-state.json')
            )
          );
      }));

    it('should throw error if packaged individually but functions packages do not exist', () =>
      runServerless(
        Object.assign(
          {
            cwd: fixtures.map.packagedIndividually,
            cliArgs: ['package', '--package', '_test-package'],
          },
          runServelessOptions
        )
      ).then(serverless => {
        const { servicePath } = serverless.config;
        return fse.removeAsync(path.join(servicePath, '_test-package/foo.zip')).then(() =>
          runServerless(
            Object.assign(
              {
                cwd: servicePath,
                cliArgs: ['deploy', '--package', '_test-package'],
              },
              runServelessOptions
            )
          ).then(
            () => {
              throw new Error('Unexpected');
            },
            error => expect(error.message).to.include('No foo.zip')
          )
        );
      }));

    it('should throw error if service package does not exist', () =>
      runServerless(
        Object.assign(
          {
            cwd: fixtures.map.regular,
            cliArgs: ['package', '--package', '_test-package'],
          },
          runServelessOptions
        )
      ).then(serverless => {
        const { servicePath } = serverless.config;
        return fse.removeAsync(path.join(servicePath, '_test-package/service.zip')).then(() =>
          runServerless(
            Object.assign(
              {
                cwd: servicePath,
                cliArgs: ['deploy', '--package', '_test-package'],
              },
              runServelessOptions
            )
          ).then(
            () => {
              throw new Error('Unexpected');
            },
            error => expect(error.message).to.include('service.zip file found')
          )
        );
      }));

    it('should not throw error if service has no functions and no service package', () =>
      runServerless(
        Object.assign(
          {
            config: { service: 'irrelevant', provider: 'aws' },
            cliArgs: ['deploy'],
          },
          runServelessOptions
        )
      ).then(() => expect(extendedValidateStub.called).to.be.equal(true)));

    it('should not throw error if individual packaging defined on a function level', () =>
      runServerless(
        Object.assign(
          {
            cwd: fixtures.map.packagedIndividually,
            cliArgs: ['deploy'],
          },
          runServelessOptions
        )
      ).then(() => expect(extendedValidateStub.called).to.be.equal(true)));

    it('should use function package level artifact when provided', () =>
      runServerless(
        Object.assign(
          {
            cwd: fixtures.map.customFunctionArtifact,
            cliArgs: ['deploy'],
          },
          runServelessOptions
        )
      ).then(serverless => {
        const serverlessStage = require(path.join(
          serverless.config.servicePath,
          '.serverless/serverless-state.json'
        ));
        expect(serverlessStage.service.functions.foo.package.artifact).to.equal(
          'custom-foo-artifact.zip'
        );
      }));

    it('should throw error if specified package artifact does not exist', () =>
      runServerless(
        Object.assign(
          {
            cwd: fixtures.map.customNonExistingArtifact,
            cliArgs: ['deploy'],
          },
          runServelessOptions
        )
      ).then(
        () => {
          throw new Error('Unexpected');
        },
        error => expect(error.message).to.include('no such file or directory')
      ));

    it('should not throw error if specified package artifact exists', () =>
      runServerless(
        Object.assign(
          {
            cwd: fixtures.map.customArtifact,
            cliArgs: ['deploy'],
          },
          runServelessOptions
        )
      ).then(serverless => {
        const serverlessStage = require(path.join(
          serverless.config.servicePath,
          '.serverless/serverless-state.json'
        ));
        expect(serverlessStage.package.artifact).to.equal('custom-artifact.zip');
      }));

    it("should warn if function's timeout is greater than 30 and it's attached to APIGW", () => {
      const fixturePath = fixtures.map.bigTimeoutAndHttpEvent;
      let gatheredStdout = '';
      const { restoreStdoutWrite } = overrideStdoutWrite(data => (gatheredStdout += data));
      return runServerless(
        Object.assign(
          {
            cwd: fixturePath,
            cliArgs: ['deploy'],
          },
          runServelessOptions
        )
      ).then(
        () => {
          restoreStdoutWrite();
          expect(gatheredStdout).to.include('Function foo has timeout of 31 seconds');
        },
        error => {
          restoreStdoutWrite();
          throw error;
        }
      );
    });
  });
});
