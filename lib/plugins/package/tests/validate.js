'use strict';

const expect = require('chai').expect;
const Package = require('../index');
const Serverless = require('../../../Serverless');

describe('#validate()', () => {
  let serverless;
  let packageService;

  beforeEach(() => {
    serverless = new Serverless();
    packageService = new Package(serverless);
  });

  it('should throw error if not inside service (servicePath not defined)', () => {
    packageService.serverless.config.servicePath = false;
    expect(() => packageService.validate()).to.throw(Error);
  });
});
