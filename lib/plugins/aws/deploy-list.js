import utils from '@serverlessinc/sf-core/src/utils.js';
import validate from './lib/validate.js';
import findAndGroupDeployments from './utils/find-and-group-deployments.js';
import setBucketName from './lib/set-bucket-name.js';
import ServerlessError from '../../serverless-error.js';

const { log, writeText } = utils;

class AwsDeployList {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this.provider = this.serverless.getProvider('aws');

    Object.assign(this, validate, setBucketName);

    this.hooks = {
      'before:deploy:list:log': () => this.validate(),
      'before:deploy:list:functions:log': () => this.validate(),

      'deploy:list:log': async () => {
        await this.setBucketName();
        await this.listDeployments();
      },
      'deploy:list:functions:log': async () => this.listFunctions(),
    };
  }

  async listDeployments() {
    const service = this.serverless.service.service;
    const stage = this.provider.getStage();
    const prefix = this.provider.getDeploymentPrefix();

    let response;
    try {
      response = await this.provider.request('S3', 'listObjectsV2', {
        Bucket: this.bucketName,
        Prefix: `${prefix}/${service}/${stage}`,
      });
    } catch (err) {
      if (err.code === 'AWS_S3_LIST_OBJECTS_V2_ACCESS_DENIED') {
        throw new ServerlessError(
          'Could not list objects in the deployment bucket. Make sure you have sufficient permissions to access it.',
          err.code
        );
      }
      throw err;
    }

    const directoryRegex = new RegExp('(.+)-(.+-.+-.+)');
    const deployments = findAndGroupDeployments(response, prefix, service, stage);

    if (deployments.length === 0) {
      log.notice();
      log.aside(
        "No deployments found, if that's unexpected ensure that stage and region are correct"
      );
      return;
    }

    deployments.forEach((deployment) => {
      const match = deployment[0].directory.match(directoryRegex);
      const date = new Date(Date.parse(match[2]));
      writeText(
        `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, 0)}-${String(
          date.getUTCDate()
        ).padStart(2, 0)} ` +
          `${String(date.getUTCHours()).padStart(2, 0)}:${String(date.getUTCMinutes()).padStart(
            2,
            0
          )}:${String(date.getUTCSeconds()).padStart(2, 0)} UTC`,
        `Timestamp: ${match[1]}`,
        'Files:'
      );
      deployment.forEach((entry) => {
        writeText(`  - ${entry.file}`);
      });
    });
  }

  // list all functions and their versions
  async listFunctions() {
    const funcs = await this.getFunctions();
    const funcsVersions = await this.getFunctionVersions(funcs);
    this.displayFunctions(funcsVersions);
  }

  async getFunctions() {
    const funcs = this.serverless.service.getAllFunctionsNames();

    const result = await Promise.all(
      funcs.map((funcName) => {
        const params = {
          FunctionName: funcName,
        };

        return this.provider.request('Lambda', 'getFunction', params);
      })
    );

    return result.map((item) => item.Configuration);
  }

  async getFunctionPaginatedVersions(params, totalVersions) {
    const response = await this.provider.request('Lambda', 'listVersionsByFunction', params);

    const Versions = (totalVersions || []).concat(response.Versions);
    if (response.NextMarker) {
      return this.getFunctionPaginatedVersions(
        { ...params, Marker: response.NextMarker },
        Versions
      );
    }

    return { Versions };
  }

  async getFunctionVersions(funcs) {
    return Promise.all(
      funcs.map((func) => {
        const params = {
          FunctionName: func.FunctionName,
        };

        return this.getFunctionPaginatedVersions(params);
      })
    );
  }

  displayFunctions(funcs) {
    funcs.forEach((func) => {
      let name = func.Versions[0].FunctionName;
      name = name.replace(`${this.serverless.service.service}-`, '');
      name = name.replace(`${this.provider.getStage()}-`, '');

      writeText(name);
      const versionsLength = func.Versions.length;
      const versions = func.Versions.map((funcEntry) => funcEntry.Version).slice(
        Math.max(0, func.Versions.length - 5)
      );
      if (versionsLength < 6) writeText(`  All versions: ${versions.join(', ')}`);
      else writeText(`  Last 5 versions: ${versions.join(', ')}`);
    });
  }
}

export default AwsDeployList;
