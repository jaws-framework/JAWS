'use strict';

const _ = require('lodash');
const BbPromise = require('bluebird');

module.exports = {
  compileResources() {
    this.resourceFunctions = [];
    this.resourcePaths = [];
    this.resourceLogicalIds = {};

    _.forEach(this.serverless.service.functions, (functionObject, functionName) => {
      functionObject.events.forEach(event => {
        if (event.http) {
          let path;

          if (typeof event.http === 'object') {
            path = event.http.path;
          } else if (typeof event.http === 'string') {
            path = event.http.split(' ')[1];
          } else {
            const errorMessage = [
              `HTTP event of function ${functionName} is not an object nor a string.`,
              ' The correct syntax is: http: get users/list',
              ' OR an object with "path" and "method" proeprties.',
              ' Please check the docs for more info.',
            ].join('');
            throw new this.serverless.classes
              .Error(errorMessage);
          }

          while (path !== '') {
            if (this.resourcePaths.indexOf(path) === -1) {
              this.resourcePaths.push(path);
              this.resourceFunctions.push(functionName);
            }

            const splittedPath = path.split('/');
            splittedPath.pop();
            path = splittedPath.join('/');
          }
        }
      });
    });

    const restApiId = this.provider.naming.getLogicalApiGatewayName();
    // ['users', 'users/create', 'users/create/something']
    this.resourcePaths.forEach(path => {
      const splitPath = path.split('/');
      const resourcePath = path;
      const resourceName = splitPath[splitPath.length - 1]; // resourceName is not unique.
      const logicalResourceName = this.provider.naming.getLogicalApiGatewayResourceName(path);
      this.resourceLogicalIds[resourcePath] = logicalResourceName;

      splitPath.pop();

      let resourceParentId;
      if (splitPath.length === 0) {
        resourceParentId = `{ "Fn::GetAtt": ["${
          this.provider.naming.getLogicalApiGatewayName()
        }", "RootResourceId"] }`;
      } else {
        const logicalParentResourceName = this.provider.naming
          .getLogicalApiGatewayResourceName(splitPath.join('/'));
        resourceParentId = `{ "Ref" : "${logicalParentResourceName}" }`;
      }

      const resourceTemplate = `
        {
          "Type" : "AWS::ApiGateway::Resource",
          "Properties" : {
            "ParentId" : ${resourceParentId},
            "PathPart" : "${resourceName}",
            "RestApiId" : { "Ref" : "${restApiId}" }
          }
        }
      `;

      const resourceObject = {
        [logicalResourceName]: JSON.parse(resourceTemplate),
      };

      _.merge(this.serverless.service.provider.compiledCloudFormationTemplate.Resources,
        resourceObject);
    });

    return BbPromise.resolve();
  },
};
