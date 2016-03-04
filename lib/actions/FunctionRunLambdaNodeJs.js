'use strict';

/**
 * Action: FunctionRunLambdaNodeJs
 */

module.exports = function(SPlugin, serverlessPath) {

  const path    = require('path'),
    SError      = require(path.join(serverlessPath, 'Error')),
    SCli        = require(path.join(serverlessPath, 'utils/cli')),
    BbPromise   = require('bluebird'),
    chalk       = require('chalk'),
    context     = require(path.join(serverlessPath, 'utils/context'));
  let SUtils;

  class FunctionRunLambdaNodeJs extends SPlugin {

    constructor(S, config) {
      super(S, config);
      SUtils = S.utils;
    }

    static getName() {
      return 'serverless.core.' + FunctionRunLambdaNodeJs.name;
    }

    registerActions() {

      this.S.addAction(this.functionRunLambdaNodeJs.bind(this), {
        handler:       'functionRunLambdaNodeJs',
        description:   'Runs a service that features a lambda using the nodejs runtime.'
      });

      return BbPromise.resolve();
    }

    /**
     * Function Run Lambda NodeJs
     */

    functionRunLambdaNodeJs(evt) {

      let _this    = this;
      _this.evt    = evt;

      if (!_this.evt.options.name) {
        return BbPromise.reject(new SError('Please provide a function name to run'));
      }


      _this.function = _this.S.getProject().getFunction( _this.evt.options.name );

      // Prepare result object
      _this.evt.data.result = { status: false };

      // Run Function
      return new BbPromise(function(resolve) {

        SCli.log(`Running ${_this.evt.options.name}...`);

        try {

          // Load function file & handler
          let functionFile    = _this.function.handler.split('/').pop().split('.')[0];
          let functionHandler = _this.function.handler.split('/').pop().split('.')[1];
          functionFile        = _this.function.getRootPath(functionFile + '.js');
          functionHandler     = require(functionFile)[functionHandler];



          // Fire function
          let functionEvent = SUtils.readFileSync(_this.function.getRootPath('event.json'));
          functionHandler(functionEvent, context(_this.function.name, function (err, result) {

            SCli.log(`-----------------`);

            // Show error
            if (err) {
              SCli.log(chalk.bold('Failed - This Error Was Returned:'));
              SCli.log(err.message);
              SCli.log(err.stack);
              _this.evt.data.result.status = 'error';
              _this.evt.data.result.response = err.message;
              return resolve();
            }

            // Show success response
            SCli.log(chalk.bold('Success! - This Response Was Returned:'));
            SCli.log(JSON.stringify(result));
            _this.evt.data.result.status   = 'success';
            _this.evt.data.result.response = result;
            return resolve();
          }));

        } catch(err) {

          SCli.log(`-----------------`);

          SCli.log(chalk.bold('Failed - This Error Was Thrown:'));
          SCli.log(err.stack || err);
          _this.evt.data.result.status   = 'error';
          _this.evt.data.result.response = err.message;
          return resolve();
        }
      })
        .then(function() {

          /**
           * Return EVT
           */

          return _this.evt;

        })
    }
  }

  return( FunctionRunLambdaNodeJs );
};
