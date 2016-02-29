'use strict';

/**
 * Serverless Provider AWS Class
 */

const SError       = require('./Error'),
    SUtils           = require('./utils/index'),
    SCli             = require('./utils/cli'),
    BbPromise        = require('bluebird'),
    httpsProxyAgent  = require('https-proxy-agent'),
    awsMisc          = require('./utils/aws/Misc'),
    path             = require('path'),
    _                = require('lodash'),
    url              = require('url'),
    fs               = require('fs'),
    os               = require('os');

// Load AWS Globally for the first time
const AWS          = require('aws-sdk');

class ServerlessProviderAws {

  /**
   * Constructor
   */

  // TODO: Move project bucket functions here

  constructor(serverless, config) {

    // Defaults
    this._S      = serverless;
    this._config = config || {};
    this.sdk     = AWS; // We recommend you use the "request" method instead

    // Use HTTPS Proxy (Optional)
    let proxy = process.env.proxy || process.env.HTTP_PROXY || process.env.http_proxy || process.env.HTTPS_PROXY || process.env.https_proxy;
    if (proxy) {
      let proxyOptions;
      proxyOptions = url.parse(proxy);
      proxyOptions.secureEndpoint  = true;
      AWS.config.httpOptions.agent = new httpsProxyAgent(proxyOptions);
    }

    // Detect Profile Prefix. Useful for multiple projects (e.g., myproject_prod)
    this._config.profilePrefix = process.env['AWS_PROFILE_PREFIX'] ? process.env['AWS_PROFILE_PREFIX'] : null;
    if (this._config.profilePrefix && this._config.profilePrefix.charAt(this._config.profilePrefix.length - 1) !== '_') {
      this._config.profilePrefix = this._config.profilePrefix + '_';
    }

    this.validLambdaRegions = awsMisc.validLambdaRegions;

    // TODO: Check for Project Bucket Region in ENV or bucket name
  }

  /**
   * Request
   * - Perform an SDK request
   */

  request(service, method, params, stage, region, options) {
    let _this = this;
    let awsService = new this.sdk[service](_this.getCredentials(stage, region));
    let req = awsService[method](params);

    // Add listeners...
    req.on('validate', function (r) {
    });

    return SUtils.persistentRequest(function () {
      return new BbPromise(function (resolve, reject) {
        req.send(function (err, data) {
          if (err) {
            reject(err);
          } else {
            resolve(data);
          }
        });
      });
    });
  }

  /**
   * Get Credentials
   * - Fetches credentials from ENV vars via profile, access keys, or session token
   * - Don't use AWS.EnvironmentCredentials, since we want to require "AWS" in the ENV var names, otherwise provider trampling could occur
   * - TODO: Remove Backward Compatibility: Older versions include "ADMIN" in env vars, we're not using that anymore.  Too long.
   */

  getCredentials(stage, region) {

    let credentials;
    stage = stage ? stage.toUpperCase() : null;

    if (stage && process.env['AWS_PROFILE_' + stage]) {

      // Profile w/ Stage Suffix
      let profile = process.env['AWS_PROFILE_' + stage];
      profile     = (this._config.profilePrefix ? this._config.profilePrefix + '_' + profile : profile).toLowerCase();
      credentials = this.getProfile(profile);

    } else if (process.env['AWS_PROFILE'] || process.env['SERVERLESS_ADMIN_AWS_PROFILE']) {

      // Profile Plain
      let profile = process.env['AWS_PROFILE'] || process.env['SERVERLESS_ADMIN_AWS_PROFILE'];
      profile     = (this._config.profilePrefix ? this._config.profilePrefix + '_' + profile : profile).toLowerCase();
      credentials = this.getProfile(profile);

    } else if (process.env['AWS_ACCESS_KEY_ID_'  + stage] && process.env['AWS_SECRET_ACCESS_KEY_'  + stage]) {

      // Access Keys w/ Stage Suffix
      credentials = {
        accessKeyId:     process.env['AWS_ACCESS_KEY_ID_' + stage],
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY_' + stage],
        sessionToken:    process.env['AWS_SESSION_TOKEN_' + stage],
        region: region
      };

    } else if ((process.env['AWS_ACCESS_KEY_ID'] && process.env['AWS_SECRET_ACCESS_KEY'])
        || process.env['SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID'] && process.env['SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY']) {

      // Access Keys Plain
      credentials = {
        accessKeyId:     process.env['AWS_ACCESS_KEY_ID'] || process.env['SERVERLESS_ADMIN_AWS_ACCESS_KEY_ID'],
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || process.env['SERVERLESS_ADMIN_AWS_SECRET_ACCESS_KEY'],
        sessionToken:    process.env['AWS_SESSION_TOKEN'],
        region: region
      };
      
    } else if (this._S.config.awsAdminKeyId) {

      // Access Keys from the config
      credentials = {
        accessKeyId:     this._S.config.awsAdminKeyId,
        secretAccessKey: this._S.config.awsAdminSecretKey,
        region: region
      };
    }

    if (!credentials) {
      throw new SError('Cant find AWS credentials', SError.errorCodes.MISSING_AWS_CREDS);
    }

    return credentials;
  }

  /**
   * Get the directory containing AWS configuration files
   */

  getConfigDir() {
    let env  = process.env;
    let home = env.HOME ||
        env.USERPROFILE ||
        (env.HOMEPATH ? ((env.HOMEDRIVE || 'C:/') + env.HOMEPATH) : null);

    if (!home) {
      throw new SError('Cant find homedir', SError.errorCodes.MISSING_HOMEDIR);
    }

    return path.join(home, '.aws');
  }

  /**
   * Get All Profiles
   * - Gets all profiles from ~/.aws/credentials
   */

  getAllProfiles() {
    let credsPath = path.join(this.getConfigDir(), 'credentials');
    try {
      return AWS.util.ini.parse(AWS.util.readFileSync(credsPath));
    }
    catch (e) {
      return [];
    }
  }

  /**
   * Get Profile
   * - Gets a single profile from ~/.aws/credentials
   */

  getProfile(awsProfile) {
    let profiles = this.getAllProfiles();
    if (!profiles[awsProfile]) {
      throw new SError(`Cant find profile ${awsProfile} in ~/.aws/credentials`, awsProfile);
    }
    return profiles[awsProfile];
  }

  /**
   * Find or Create Project Bucket
   */

  findOrCreateProjectBucket(bucketName) {

    let _this = this;

    // TODO: Check for AWS_PROJECT_BUCKET_REGION
    // TODO: Backward Compatibility Support check for region in Bucket Name

    let params = {
      Bucket: bucketName
    };

    return this.request('S3', 'getBucketAclPromised', params, stage, region)
        .then(function(response) {
          SUtils.sDebug(`Project bucket already exists: ${bucketName}`);
        })
        .catch(function(err) {
          if (err.code == 'AccessDenied') {
            throw new SError(`S3 Bucket "${bucketName}" already exists and you do not have permissions to use it`,
                SError.errorCodes.ACCESS_DENIED);
          } else if (err.code == 'NoSuchBucket') {
            SCli.log('Creating your project bucket on S3: ' + bucketName + '...');
            params.ACL = 'private';
            return _this.request('S3', 'createBucketPromised', params, stage, region);
          } else {
            throw new SError(err);
          }
        });
  }

  /**
   * Upload To Project Bucket
   * - Takes S3.putObject params
   * - Stage is required in case a Project Bucket is on stage's separate AWS Account
   */

  uploadToProjectBucket(params, stage, region) {

    if (!params || !stage) throw new SError(`params and stage are required`);

    let _this = this;

    return _this.findOrCreateProjectBucket()
        .then(function() {
          SUtils.sDebug(`Uploading to project bucket: ${key}...`);
          return _this.request('S3', 'upload', params, stage);
        });
  }

  /**
   * Download From Project Bucket
   * - Takes S3.getObject params
   * - Stage is required in case a Project Bucket is on stage's separate AWS Account
   */

  downloadFromProjectBucket(params, stage, region) {

    if (!params || !stage) throw new SError(`params and stage are required`);

    let _this = this;

    return _this.findOrCreateProjectBucket()
        .then(function() {
          SUtils.sDebug(`Downloading from project bucket: ${key}...`);
          return _this.request('S3', 'getObject', params, stage);
        });
  }

  getLambdasStackName(stage, projectName) {
    return [projectName, stage, 'l'].join('-');
  }

  getResourcesStackName(stage, projectName) {
    return [projectName, stage, 'r'].join('-');
  }


  /**
   * Get REST API By Name
   */

  getApiByName(apiName, stage, region) {

    let _this = this;

    // Validate Length
    if (apiName.length > 1023) {
      throw new SError('"'
        +apiName
        + '" cannot be used as a REST API name because it\'s over 1023 characters.  Please make it shorter.');
    }

    // Sanitize
   apiName = apiName.trim();

    let params = {
      limit: 500
    };

    // List all REST APIs
    return this.request('APIGateway', 'getRestApis', params, stage, region)
      .then(function(response) {

        let restApi = null,
          found = 0;

        // Find REST API w/ same name as project
        for (let i = 0; i < response.items.length; i++) {

          if (response.items[i].name ===apiName) {

            restApi = response.items[i];
            found++;

            SUtils.sDebug(
              '"'
              + stage
              + ' - '
              + region
              + '": found existing REST API on AWS API Gateway with name: '
              +apiName);

          }
        }

        // Throw error if they have multiple REST APIs with the same name
        if (found > 1) {
          throw new SError('You have multiple API Gateway REST APIs in the region ' + region + ' with this name: ' +apiName);
        }

        if (restApi) return restApi;
      });
  }
}

module.exports = ServerlessProviderAws;