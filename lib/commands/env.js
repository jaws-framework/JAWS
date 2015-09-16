'use strict';

/**
 * JAWS Command: env
 */

var JawsError = require('../jaws-error'),
    JawsCli = require('../utils/cli'),
    Promise = require('bluebird'),
    utils = require('../utils'),
    fs = require('fs'),
    AWSUtils = require('../utils/aws'),
    path = require('path'),
    chalk = require('chalk'),
    dotenv = require('dotenv');

/**
 *
 * @param {Jaws} JAWS
 * @param awsProfile
 * @param awsRegion
 * @param bucketName
 * @param projectName
 * @param stage
 */

module.exports.getEnvFileAsMap = function(JAWS, stage) {
  return JAWS.validateProject()
      .then(function() {
        var deferred;

        if (stage == 'local') {
          deferred = Promise.resolve(fs.readFileSync(path.join(JAWS._meta.projectRootPath, 'back', '.env')));
        } else {
          deferred = AWSUtils.getEnvFile(
                  JAWS._meta.profile,
                  JAWS._meta.projectJson.project.envVarBucket.region,
                  JAWS._meta.projectJson.project.envVarBucket.name,
                  JAWS._meta.projectJson.name,
                  stage
              )
              .then(function(s3ObjData) {
                if (!s3ObjData.Body) {
                  return '';
                }
                return s3ObjData.Body;
              });
        }
        return deferred;
      })
      .then(function(envFileBuffer) {
        return dotenv.parse(envFileBuffer);
      })
      .catch(function(err) {
        return {};
      });
};

/**
 * List all env vars. Display what env is for stage and where all env vars are used.
 * Also indicates which module envVars are not set in stage
 *
 * @param {Jaws} JAWS
 * @param stage
 * @returns {Promise} map of env vars
 */
module.exports.listEnv = function(JAWS, stage) {
  var _this = this;

  return Promise.all([
        utils.findAllJawsJsons(path.join(JAWS._meta.projectRootPath, 'back')),
        _this.getEnvFileAsMap(JAWS, stage),
      ])
      .spread(function(jawsJsonPaths, envMap) {
        Object.keys(envMap).forEach(function(key) {
          console.log(key + "=" + JSON.stringify(envMap[key]));
        })

        return envMap;
      });
};

module.exports.testEnv = function(JAWS, stage) {
  var _this = this;

  return Promise.all([
        utils.findAllJawsJsons(path.join(JAWS._meta.projectRootPath, 'back')),
        _this.getEnvFileAsMap(JAWS, stage),
      ])
      .spread(function(jawsJsonPaths, envMap) {
        var envInBackMap = {};

        //first build up a list of all env vars modules say they need
        jawsJsonPaths.forEach(function(jjp) {
          var jawsJson = require(jjp);
          if (jawsJson.lambda && jawsJson.lambda.envVars) {
            jawsJson.lambda.envVars.forEach(function(key) {
              if (envInBackMap[key]) {
                envInBackMap[key].push(jawsJson.name);
              } else {
                envInBackMap[key] = [jawsJson.name];
              }
            });
          }
        });

        JawsCli.log_header(' ENV: ' + stage);

        var localEnvKeys = Object.keys(envInBackMap);
        if (localEnvKeys.length) {
          JawsCli.log('Where vars are used (' + chalk.red('red') + ' indicates not set in ' + stage + '):');
          localEnvKeys.forEach(function(key) {
            var keyColored = (envMap[key]) ? chalk.green(key) : chalk.red(key);

            JawsCli.log(keyColored + ': ' + chalk.white(envInBackMap[key].toString()));
          });
        }

        return envMap;
      });
};

/**
 * Get value of key at stage
 *
 * @param {Jaws} JAWS
 * @param stage
 * @param key
 * @returns {Promise} string value
 */
module.exports.getEnvKey = function(JAWS, stage, key) {
  var _this = this;

  return _this.getEnvFileAsMap(JAWS, stage)
      .then(function(envMap) {
        if (!envMap[key]) {
          throw new JawsError(key + ' not set in ' + stage, JawsError.errorCodes.ENV_KEY_NOT_SET);
        } else {
          console.log(envMap[key]);
          return envMap[key];
        }
      });
};

/**
 * Set or unset value of key at stage.
 * If key does not exist it will be created (if set)
 * If env does not exist, will be created
 *
 * @param {Jaws} JAWS
 * @param stage
 * @param key
 * @param val if omitted will unset
 * @returns {Promise} string value
 */
module.exports.setEnvKey = function(JAWS, stage, key, val) {
  var _this = this,
      projectName = JAWS._meta.projectJson.name,
      projectBucketRegion = JAWS._meta.projectJson.project.envVarBucket.region,
      projectBucketName = JAWS._meta.projectJson.project.envVarBucket.name,
      awsProfile = JAWS._meta.profile;

  return _this.getEnvFileAsMap(JAWS, stage)
      .then(function(envMap) {
        if (val) {
          envMap[key] = val;
        } else {
          delete envMap[key];
        }

        var contents = '';
        Object.keys(envMap).forEach(function(newKey) {
          contents += [newKey, envMap[newKey]].join('=') + '\n';
        });

        if (stage == 'local') {
          return utils.writeFile(path.join(JAWS._meta.projectRootPath, 'back', '.env'), contents);
        } else {
          return AWSUtils.putEnvFile(
              awsProfile,
              projectBucketRegion,
              projectBucketName,
              projectName,
              stage,
              contents);
        }
      });
};
