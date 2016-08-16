'use strict';

const expect = require('chai').expect;
const AwsCompileSNSEvents = require('../index');
const Serverless = require('../../../../../../../Serverless');

describe('AwsCompileSNSEvents', () => {
  let serverless;
  let awsCompileSNSEvents;

  beforeEach(() => {
    serverless = new Serverless();
    serverless.service.resources = { Resources: {} };
    awsCompileSNSEvents = new AwsCompileSNSEvents(serverless);
  });

  describe('#constructor()', () => {
    it('should set the provider variable to "aws"', () => expect(awsCompileSNSEvents.provider)
      .to.equal('aws'));
  });

  describe('#existingTopic()', () => {
    it('should return nothing if existing resource does not exist', () => expect(awsCompileSNSEvents
      .existingTopic('SampleSNSTopic')).to.equal(undefined));

    it('should return topic resource name if one exists', () => {
      awsCompileSNSEvents.serverless.service.resources.Resources.sampleSNSTopic = {
        Type: 'AWS::SNS::Topic',
        Properties: {
          TopicName: 'SampleSNSTopic',
        },
      };
      expect(awsCompileSNSEvents.existingTopic('SampleSNSTopic')).to.equal('sampleSNSTopic');
    });
  });

  describe('#compileSNSEvents()', () => {
    it('should throw an error if the resource section is not available', () => {
      awsCompileSNSEvents.serverless.service.resources.Resources = false;
      expect(() => awsCompileSNSEvents.compileSNSEvents()).to.throw(Error);
    });

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

      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEvent0.Type
      ).to.equal('AWS::SNS::Topic');
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEvent1.Type
      ).to.equal('AWS::SNS::Topic');
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEventPermission0.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEventPermission1.Type
      ).to.equal('AWS::Lambda::Permission');
    });

    it('should only create permission resource when topicArn is given', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicArn: 'some:arn:xxx',
              },
            },
            {
              sns: 'some:other:arn:xxx',
            },
          ],
        },
      };

      awsCompileSNSEvents.compileSNSEvents();

      expect(typeof awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEvent0
      ).to.equal('undefined');
      expect(typeof awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEvent1
      ).to.equal('undefined');
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEventPermission0.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEventPermission1.Type
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
        awsCompileSNSEvents.serverless.service.resources.Resources
      ).to.deep.equal({});
    });

    it('should update existing resource if one is present', () => {
      awsCompileSNSEvents.serverless.service.functions = {
        first: {
          events: [
            {
              sns: {
                topicName: 'existingTopic',
                displayName: 'existingTopic',
              },
            },
            {
              sns: 'anotherExistingTopic',
            },
          ],
        },
      };

      awsCompileSNSEvents.serverless.service
        .resources.Resources.existingTopic = {
          Type: 'AWS::SNS::Topic',
          Properties: {
            TopicName: 'existingTopic',
          },
        };
      awsCompileSNSEvents.serverless.service
        .resources.Resources.anotherExistingTopic = {
          Type: 'AWS::SNS::Topic',
          Properties: {
            TopicName: 'anotherExistingTopic',
          },
        };

      awsCompileSNSEvents.compileSNSEvents();

      expect(typeof awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEvent0
      ).to.equal('undefined');
      expect(typeof awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEvent1
      ).to.equal('undefined');
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEventPermission0.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.firstSNSEventPermission1.Type
      ).to.equal('AWS::Lambda::Permission');
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.existingTopic
        .Properties.hasOwnProperty('Subscriptions'));
      expect(awsCompileSNSEvents.serverless.service
        .resources.Resources.anotherExistingTopic
        .Properties.hasOwnProperty('Subscriptions'));
    });
  });
});
