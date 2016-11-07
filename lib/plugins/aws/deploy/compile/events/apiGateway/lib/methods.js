'use strict';

const BbPromise = require('bluebird');
const _ = require('lodash');

module.exports = {

  compileMethods() {
    this.apiGatewayMethodLogicalIds = [];

    this.validated.events.forEach((event) => {
      const resourceId = this.getResourceId(event.http.path);
      const resourceName = this.getResourceName(event.http.path);
      const requestParameters = (event.http.request && event.http.request.parameters) || {};

      const template = {
        Type: 'AWS::ApiGateway::Method',
        Properties: {
          HttpMethod: event.http.method.toUpperCase(),
          RequestParameters: requestParameters,
          ResourceId: resourceId,
          RestApiId: { Ref: this.apiGatewayRestApiLogicalId },
        },
      };

      if (event.http.private) {
        template.Properties.ApiKeyRequired = true;
      }

      _.merge(template,
        this.getMethodAuthorization(event.http),
        this.getMethodIntegration(event.http, event.functionName),
        this.getMethodResponses(event.http)
      );

      const methodName = event.http.method[0].toUpperCase() +
        event.http.method.substr(1).toLowerCase();
      const methodLogicalId = `ApiGatewayMethod${resourceName}${methodName}`;

      this.apiGatewayMethodLogicalIds.push(methodLogicalId);

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources, {
        [methodLogicalId]: template,
      });
    });

    return BbPromise.resolve();
  },
};
