'use strict';

const expect = require('chai').expect;
const AzureDeploy = require('../index');
const Serverless = require('../../../../Serverless');

describe('#initializeResources()', () => {
  const serverless = new Serverless();
  const azureDeploy = new AzureDeploy(serverless);

  it('should add core resources and merge custom resources', () => {
    azureDeploy.options = {
      stage: 'dev',
      region: 'useast',
    };
    azureDeploy.serverless.service.service = 'first-service';

    azureDeploy.serverless.service.resources.azure = {
      resources: {
        fakeResource: {
          apiVersion: '2015-08-01',
          name: 'fakeresource',
          type: 'fake',
        },
      },
    };

    azureDeploy.initializeResources();

    expect(Object.keys(azureDeploy.serverless.service.resources
      .azure.resources).length).to.be.equal(3);
  });

  it('should not merge resoures if none exist', () => {
    azureDeploy.options = {
      stage: 'dev',
      region: 'useast',
    };
    azureDeploy.serverless.service.service = 'first-service';
    azureDeploy.serverless.service.resources.azure = undefined;

    azureDeploy.initializeResources();

    expect(Object.keys(azureDeploy.serverless.service.resources
      .azure.resources).length).to.be.equal(2);
  });

  it('overwrites options in the template, if given', () => {
    azureDeploy.options = {
      stage: 'dev',
      region: 'useast',
    };
    azureDeploy.serverless.service.service = 'first-service';
    azureDeploy.options.storageAccountType = 'superduperpremium';
    azureDeploy.options.region = 'moon';

    azureDeploy.initializeResources();

    const variables = azureDeploy.serverless.service.resources.azure.variables;

    expect(variables.storageAccountType).to.be.equal('superduperpremium');
    expect(variables.location).to.be.equal('moon');
    expect(variables.siteName).to.be.equal('serverless-first-service-dev');
  });
});
