'use strict';

const test = require('ava');
const path = require('path');
const expect = require('chai').expect;
const BbPromise = require('bluebird');
const AWS = require('aws-sdk');
const _ = require('lodash');
const fetch = require('node-fetch');

const Utils = require('../../../../../utils/index');

const CF = new AWS.CloudFormation({ region: 'us-east-1' });
BbPromise.promisifyAll(CF, { suffix: 'Promised' });

let stackName;
let endpointBase;

test.before('AWS - API Gateway (Integration: Lambda): CORS test', () => {
  stackName = Utils.createTestService('aws-nodejs', path.join(__dirname, 'service'));
  Utils.deployService();
});

test.before('should expose the endpoint(s) in the CloudFormation Outputs', () =>
  CF.describeStacksPromised({ StackName: stackName })
    .then((result) => _.find(result.Stacks[0].Outputs,
      { OutputKey: 'ServiceEndpoint' }).OutputValue)
    .then((endpointOutput) => {
      endpointBase = endpointOutput.match(/https:\/\/.+\.execute-api\..+\.amazonaws\.com.+/)[0];
    })
);

test('should setup CORS support with simple string config', () =>
  fetch(`${endpointBase}/simple-cors`, { method: 'OPTIONS' })
    .then((response) => {
      const headers = response.headers;

      expect(headers.get('access-control-allow-headers'))
        .to.equal('Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token');
      expect(headers.get('access-control-allow-methods')).to.equal('OPTIONS,GET');
      expect(headers.get('access-control-allow-origin')).to.equal('*');
    })
);

test('should setup CORS support with complex object config', () =>
  fetch(`${endpointBase}/complex-cors`, { method: 'OPTIONS' })
    .then((response) => {
      const headers = response.headers;

      expect(headers.get('access-control-allow-headers'))
        .to.equal('Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token');
      expect(headers.get('access-control-allow-methods')).to.equal('OPTIONS,GET');
      expect(headers.get('access-control-allow-origin')).to.equal('*');
    })
);

test.after(() => {
  Utils.removeService();
});
