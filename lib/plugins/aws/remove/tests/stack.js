'use strict';

const BbPromise = require('bluebird');
const expect = require('chai').expect;
const sinon = require('sinon');

const AwsProvider = require('../../provider/awsProvider');
const AwsRemove = require('../index');
const Serverless = require('../../../../Serverless');

describe('removeStack', () => {
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };
  const serverless = new Serverless();
  serverless.service.service = 'removeStack';
  serverless.setProvider('aws', new AwsProvider(serverless, options));

  let awsRemove;

  beforeEach(() => {
    awsRemove = new AwsRemove(serverless, options);
    awsRemove.serverless.cli = new serverless.classes.CLI();
  });

  describe('#remove()', () => {
    it('should remove a stack', () => {
      const removeStackStub = sinon
        .stub(awsRemove.provider, 'request').returns(BbPromise.resolve());

      return awsRemove.remove().then(() => {
        expect(removeStackStub.calledOnce).to.be.equal(true);
        expect(removeStackStub.calledWithExactly(
          'CloudFormation',
          'deleteStack',
          {
            StackName: awsRemove.provider.naming.getStackName(),
          }
        )).to.be.equal(true);
        awsRemove.provider.request.restore();
      });
    });
  });

  describe('#removeStack()', () => {
    it('should run promise chain in order', () => {
      const removeStub = sinon
        .stub(awsRemove, 'remove').returns(BbPromise.resolve());

      return awsRemove.removeStack().then(() => {
        expect(removeStub.calledOnce).to.be.equal(true);
        awsRemove.remove.restore();
      });
    });
  });
});
