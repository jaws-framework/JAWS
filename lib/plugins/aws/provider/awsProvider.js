'use strict';

const BbPromise = require('bluebird');
const HttpsProxyAgent = require('https-proxy-agent');
const url = require('url');
const AWS = require('aws-sdk');

const impl = {
  /**
   * Add credentials, if present, from the given credentials configuration
   * @param credentials The credentials to add credentials configuration to
   * @param config The credentials configuration
   */
  addCredentials: (credentials, config) => {
    if (credentials &&
        config &&
        config.accessKeyId &&
        config.accessKeyId !== 'undefined' &&
        config.secretAccessKey &&
        config.secretAccessKey !== 'undefined') {
      if (config.accessKeyId) {
        credentials.accessKeyId = config.accessKeyId; // eslint-disable-line no-param-reassign
      }
      if (config.secretAccessKey) {
        // eslint-disable-next-line no-param-reassign
        credentials.secretAccessKey = config.secretAccessKey;
      }
      if (config.sessionToken) {
        credentials.sessionToken = config.sessionToken; // eslint-disable-line no-param-reassign
      } else if (credentials.sessionToken) {
        delete credentials.sessionToken; // eslint-disable-line no-param-reassign
      }
    }
  },
  /**
   * Add credentials, if present, from the environment
   * @param credentials The credentials to add environment credentials to
   * @param prefix The environment variable prefix to use in extracting credentials
   */
  addEnvironmentCredentials: (credentials, prefix) => {
    if (prefix) {
      const environmentCredentials = new AWS.EnvironmentCredentials(prefix);
      impl.addCredentials(credentials, environmentCredentials);
    }
  },
  /**
   * Add credentials from a profile, if the profile exists
   * @param credentials The credentials to add profile credentials to
   * @param prefix The prefix to the profile environment variable
   * @returns Promise
   */
  addProfileCredentials: (credentials, profile) => {
    if (!profile) return BbPromise.resolve(undefined);

    const profileCredentials = new AWS.SharedIniFileCredentials({
      profile,
      filename: process.env.AWS_SHARED_CREDENTIALS_FILE,
    });
    const getAsync = BbPromise.promisify(
      profileCredentials.get,
      { context: profileCredentials }
    );

    return getAsync().then(() => {
      credentials.profile = profile; // eslint-disable-line no-param-reassign
      impl.addCredentials(credentials, profileCredentials);
    });
  },
  /**
   * Add credentials, if present, from a profile that is specified within the environment
   * @param credentials The prefix of the profile's declaration in the environment
   * @param prefix The prefix for the environment variable
   * @returns Promise
   */
  addEnvironmentProfile: (credentials, prefix) => {
    const profile = process.env[`${prefix}_PROFILE`];
    return impl.addProfileCredentials(credentials, profile);
  },
};

class AwsProvider {
  static getProviderName() {
    return 'aws';
  }

  constructor(serverless) {
    this.serverless = serverless;
    this.sdk = AWS;
    this.provider = this; // only load plugin in an AWS service context
    this.serverless.setProvider(this.constructor.getProviderName(), this);

    // Use HTTPS Proxy (Optional)
    const proxy = process.env.proxy
      || process.env.HTTP_PROXY
      || process.env.http_proxy
      || process.env.HTTPS_PROXY
      || process.env.https_proxy;

    if (proxy) {
      const proxyOptions = url.parse(proxy);
      proxyOptions.secureEndpoint = true;
      AWS.config.httpOptions.agent = new HttpsProxyAgent(proxyOptions);
    }

    // Configure the AWS Client timeout (Optional).  The default is 120000 (2 minutes)
    const timeout = process.env.AWS_CLIENT_TIMEOUT || process.env.aws_client_timeout;
    if (timeout) {
      AWS.config.httpOptions.timeout = parseInt(timeout, 10);
    }
  }

  persistentRequest(awsMethodAsync, params) {
    const that = this;
    return awsMethodAsync(params)
      .catch((err) => {
        if (err.statusCode === 429) {
          that.serverless.cli.log("'Too many requests' received, sleeping 5 seconds");
          return BbPromise.delay(5000)
            .then(() => that.persistentRequest(awsMethodAsync, params));
        }
        throw err;
      });
  }

  request(service, method, params, stage, region) {
    const that = this;
    return that.getCredentials(stage, region)
      .then((credentials) => {
        const awsService = new that.sdk[service](credentials);
        const awsMethodAsync = BbPromise.promisify(
          awsService[method],
          { context: awsService }
        );
        return that.persistentRequest(awsMethodAsync, params);
      })
      .catch((err) => {
        if (err.message === 'Missing credentials in config') {
          const errorMessage = [
            'AWS provider credentials not found.',
            ' You can find more info on how to set up provider',
            ' credentials in our docs here: https://git.io/vXsdd',
          ].join('');
          // eslint-disable-next-line no-param-reassign
          err.message = errorMessage;
        }
        throw new that.serverless.classes.Error(err.message, err.statusCode);
      });
  }

  /**
   * Fetch credentials directly or using a profile from serverless yml configuration or from the
   * well known environment variables
   * @param stage
   * @param region
   * @returns Promise that resolves to: {{region: *}}
   */
  getCredentials(stage, region) {
    const that = this;
    const ret = { region };
    const credentials = {};
    const stageUpper = stage ? stage.toUpperCase() : null;

    // add specified credentials, overriding with more specific declarations

    return BbPromise.try(() => {
      // config creds
      impl.addCredentials(credentials, that.serverless.service.provider.credentials);
      return impl.addProfileCredentials(credentials, that.serverless.service.provider.profile);
    })
    .then(() => {
      // creds for all stages
      impl.addEnvironmentCredentials(credentials, 'AWS');
      return impl.addEnvironmentProfile(credentials, 'AWS');
    })
    .then(() => {
      // stage specific creds
      impl.addEnvironmentCredentials(credentials, `AWS_${stageUpper}`);
      return impl.addEnvironmentProfile(credentials, `AWS_${stageUpper}`);
    })
    .then(() => {
      if (Object.keys(credentials).length) {
        ret.credentials = credentials;
      }
      return ret;
    });
  }

  getServerlessDeploymentBucketName(stage, region) {
    if (this.serverless.service.provider.deploymentBucket) {
      return BbPromise.resolve(this.serverless.service.provider.deploymentBucket);
    }
    const stackName = `${this.serverless.service.service}-${stage}`;
    return this.request('CloudFormation',
      'describeStackResource',
      {
        StackName: stackName,
        LogicalResourceId: 'ServerlessDeploymentBucket',
      },
      stage,
      region
    ).then((result) => result.StackResourceDetail.PhysicalResourceId);
  }

  getStackName(stage) {
    return `${this.serverless.service.service}-${stage}`;
  }
}

module.exports = AwsProvider;
