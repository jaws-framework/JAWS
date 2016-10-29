'use strict';

const expect = require('chai').expect;

const AwsCompileSNSEvents = require('../index');
const AwsProvider = require('../../../../../provider/awsProvider');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileSNSEvents', () => {
  let serverless;
  let awsCompileSNSEvents;
  const options = {
    stage: 'dev',
    region: 'us-east-1',
  };

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.provider.compiledCloudFormationTemplate = { Resources: {} };
    serverless.setProvider('aws', new AwsProvider(serverless, options));
    awsCompileSNSEvents = new AwsCompileSNSEvents(serverless, options);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to an instance of AwsProvider', () =>
      expect(awsCompileSNSEvents.provider).to.be.instanceof(AwsProvider));
  });

  describe('#compileSNSEvents()', () => {
    it('should throw an error if SNS event type is not a string or an object', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: 42,
            },
          ],
        },
      };

      expect(() => awsCompileSNSEvents.compileSNSEvents()).to.throw(Error);
    });

    it('should create corresponding resources when SNS events are given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
                displayName: 'Display name for topic 1',
              },
            },
            {
              sns: 'Topic 2',
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileSNSEvents.provider.naming.getLogicalSnsTopicName('Topic 1')].Type
      ).to.equal('AWS::SNS::Topic');
      expect(awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileSNSEvents.provider.naming.getLogicalSnsTopicName('Topic 2')].Type
      ).to.equal('AWS::SNS::Topic');
      expect(awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[
          awsCompileSNSEvents.provider.naming.getLambdaSnsTopicPermissionName('first', 'Topic 1')
        ].Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[
          awsCompileSNSEvents.provider.naming.getLambdaSnsTopicPermissionName('first', 'Topic 2')
        ].Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should create single SNS topic when the same topic is referenced repeatedly', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'Topic 1',
                displayName: 'Display name for topic 1',
              },
            },
            {
              sns: 'Topic 1',
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileSNSEvents.provider.naming.getLogicalSnsTopicName('Topic 1')].Type
      ).to.equal('AWS::SNS::Topic');
      expect(awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[awsCompileSNSEvents.provider.naming.getLogicalSnsTopicName('Topic 1')]
        .Properties.Subscription.length
      ).to.equal(2);
      expect(awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
        .Resources[
          awsCompileSNSEvents.provider.naming.getLambdaSnsTopicPermissionName('first', 'Topic 1')
        ].Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should throw an error when the event an object and the displayName is not given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                displayName: 'Display name for topic 1',
              },
            },
          ],
        },
      };

      expect(() => { awsCompileSNSEvents.compileSNSEvents(); }).to.throw(Error);
    });

    it('should not create corresponding resources when SNS events are not given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(
        awsCompileSNSEvents.serverless.service.provider.compiledCloudFormationTemplate
          .Resources
      ).to.deep.equal({});
    });
  });
});
