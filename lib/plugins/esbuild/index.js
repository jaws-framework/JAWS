import os from 'os';
import path from 'path';
import ServerlessError from '../../serverless-error.js';
import { fileURLToPath } from 'url';
import { copyFile, chmod, readFile, rm, writeFile } from 'fs/promises';
import { createWriteStream, existsSync } from 'fs';
import * as esbuild from 'esbuild';
import utils from '@serverlessinc/sf-core/src/utils.js';
import archiver from 'archiver';
import { spawn } from 'child_process';
import _ from 'lodash';
import pLimit from 'p-limit';

let __dirname = path.dirname(fileURLToPath(import.meta.url));
if (__dirname.endsWith('dist')) {
  __dirname = path.join(__dirname, '../../serverless/lib/plugins/esbuild');
}

const { log } = utils;

const nodeRuntimeRe = /nodejs(?<version>\d+).x/;

class Esbuild {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options || {};
    this._functions = undefined;

    this.hooks = {
      'before:dev-build:build': async () => {
        await this._initEsbuild();
        await this._build('originalHandler');
      },
      'after:dev-build:build': async () => {},
      'before:invoke:local:invoke': async () => {
        await this._initEsbuild();
        await this._build();
        this._setConfigForInvokeLocal();
      },
      'before:package:createDeploymentArtifacts': async () => {
        await this._initEsbuild();
        await this._build();
        await this._preparePackageJson();
        await this._package();
      },
      'before:deploy:function:packageFunction': async () => {
        await this._initEsbuild();
        await this._build();
        await this._preparePackageJson();
        await this._package();
      },
    };
  }

  async asyncInit() {
    this._defineSchema();
  }

  _defineSchema() {
    this.serverless.configSchemaHandler.defineBuildProperty('esbuild', {
      type: 'object',
      properties: {
        // The node modules that should not be bundled
        external: { type: 'array', items: { type: 'string' } },
        // These are node modules that should not be bundled but also not included in the package.json
        exclude: { type: 'array', items: { type: 'string' } },
        // The concurrency to use for building functions. By default it will be set to the number of functions to build.
        // Meaning that all functions will be built concurrently.
        buildConcurrency: { type: 'number' },
        // Whether to bundle or not. Default is true
        bundle: { type: 'boolean' },
        // Wheter to minify or not. Default is false
        minify: { type: 'boolean' },
      },
    });
  }

  /**
   * Get a record of functions that should be built by esbuild
   */
  async functions(handlerPropertyName = 'handler') {
    if (this._functions) {
      return this._functions;
    }

    const functions = this.options.function
      ? { [this.options.function]: this.serverless.service.getFunction(this.options.function) }
      : this.serverless.service.functions;

    const functionsToBuild = {};

    for (const [alias, functionObject] of Object.entries(functions)) {
      const shouldBuild = await this._shouldBuildFunction(functionObject, handlerPropertyName);
      if (shouldBuild) {
        functionsToBuild[alias] = functionObject;
      }
    }

    this._functions = functionsToBuild;

    return functionsToBuild;
  }

  /**
   * Take a Function Configuration and determine if it should be built by esbuild
   * @param {Object} functionObject - A Framework Function Configuration Object
   * @returns
   */
  async _shouldBuildFunction(functionObject, handlerPropertyName = 'handler') {
    // If handler isn't set then it is a docker function so do not attempt to build
    if (!functionObject[handlerPropertyName]) {
      return false;
    }
    const runtime = functionObject.runtime || this.serverless.service.provider.runtime;
    const functionBuildParam = functionObject.build;
    const providerBuildParam = this.serverless.service.build;

    // If runtime is not node then should not build
    if (!runtime.startsWith('nodejs')) {
      return false;
    }

    // If the build property is not set then we use the zero-config checking which is simply
    // if the handler is a typescript file
    if (!functionBuildParam && !providerBuildParam) {
      log.debug('Build property not set using default checking behavior for esbuild');
      const extension = await this._extensionForFunction(functionObject[handlerPropertyName]);
      if (extension && ['.ts', '.cts', '.mts', '.tsx'].includes(extension)) {
        log.debug('Build property not set using esbuild since typescript');
        return true;
      }
    }

    // If the build property on the function config is defined and is set to esbuild then
    // framework should build the function, otherwise if the build property is defined
    // but not set to esbuild then it should not be built
    if (functionBuildParam && functionBuildParam === 'esbuild') {
      return true;
    } else if (functionBuildParam) {
      return false;
    }

    // If the provider build property is set to esbuild then build by default
    if (providerBuildParam && (providerBuildParam === 'esbuild' || providerBuildParam.esbuild)) {
      return true;
    }

    return false;
  }

  /**
   * Initialize Esbuild. This needs to be run before other methods in this plugin.
   * It takes the esbuild binary that comes packaged in the binary and makes it accessbile
   * from the local system.
   *
   * If in the current serviceDirectory there is a `package.json` that includes `esbuild` as a dependency
   * then it uses that version instead of the packaged binary version.
   */
  async _initEsbuild() {
    // Copy ESbuild binary for specific platform
    const operatingSystem = os.type();
    const architecture = os.arch();

    // This is dumb way to do this but is the easiest to make pkg not have issues
    let esbuildPath;
    if (operatingSystem === 'Darwin' && architecture === 'arm64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-darwin-arm64'
      );
    } else if (operatingSystem === 'Darwin' && architecture === 'x64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-darwin-x64'
      );
    } else if (operatingSystem === 'Linux' && architecture === 'arm64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-linux-arm64'
      );
    } else if (operatingSystem === 'Linux' && architecture === 'x64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-linux-x64'
      );
    } else if (operatingSystem === 'Windows_NT' && architecture === 'x64') {
      esbuildPath = path.join(
        __dirname,
        '../../../../../packages/esbuild-dist/dist/esbuild-win32-x64'
      );
    } else {
      throw new ServerlessError(
        'Not a supported platform',
        'ESBUILD_PLUGIN_PLATFORM_NOT_SUPPORTED'
      );
    }

    const useLocalEsbuild = await this._useLocalEsbuild();

    if (!useLocalEsbuild && existsSync(esbuildPath)) {
      // Copy esbuild from binary to local file system
      await copyFile(esbuildPath, path.join(this.serverless.serverlessDirPath, 'esbuild'));
      // Make esbuild executable
      await chmod(path.join(this.serverless.serverlessDirPath, 'esbuild'), 0o755);
      // Set ESBUILD_BINARY_PATH so Serverless uses the correct esbuild binary
      process.env.ESBUILD_BINARY_PATH = path.join(this.serverless.serverlessDirPath, 'esbuild');
    }
  }

  // This is all the possible extensions that the esbuild plugin can build for
  async _extensionForFunction(functionHandler) {
    const functionName = path.extname(functionHandler).slice(1);
    const handlerPath = functionHandler.replace(`.${functionName}`, '');
    for (const extension of ['.js', '.ts', '.cjs', '.mjs', '.cts', '.mts', '.jsx', '.tsx']) {
      if (existsSync(path.join(this.serverless.config.serviceDir, handlerPath + extension))) {
        return extension;
      }
    }
    return undefined;
  }

  _buildProperties() {
    const defaultConfig = { bundle: true, minify: false };
    if (
      this.serverless.service.build &&
      this.serverless.service.build !== 'esbuild' &&
      this.serverless.service.build.esbuild
    ) {
      return _.merge(defaultConfig, this.serverless.service.build.esbuild);
    }

    return defaultConfig;
  }

  /**
   * Determine which modules to mark as external (i.e. added to the generated package.json) and which modules to be excluded all together
   * @param {string} runtime - The provider.runtime or functionObject.runtime value used to determine which version of the AWS SDK to exclude
   * @returns 
   */
  _getExternal(runtime) {
    const buildProperties = this._buildProperties();
    let external = new Set(buildProperties.external || []);
    let exclude = new Set(buildProperties.exclude || []);
    if (buildProperties.excludes) {
      external = [...external, ...buildProperties.excludes];
    } else {
      const nodeRuntimeMatch = runtime.match(nodeRuntimeRe);
      if (nodeRuntimeMatch) {
        const version = parseInt(nodeRuntimeMatch.groups.version) || 18;
        // If node version is 18 or greater then we need to exclude all @aws-sdk/ packages
        if (version >= 18) {
          external.add('@aws-sdk/*');
          exclude.add('@aws-sdk/*');
        } else {
          external.add('aws-sdk');
          exclude.add('aws-sdk');
        }
      }
    }
    return { external, exclude };
  }

  /**
   * When invoking locally we need to set the servicePath to the build directory so that invoke local correctly uses the built function and does not
   * attempt to use the typescript file directly.
   */
  _setConfigForInvokeLocal() {
    this.serverless.config.servicePath = path.join(
      this.serverless.config.serviceDir,
      '.serverless',
      'build'
    );
  }

  /**
   * Take the current build context. Which could be service-wide or a given function and then build it
   * @param {string} handlerPropertyName - The property name of the handler in the function object. In the case of dev mode this will be different, so we need to be able to set it.
   */
  async _build(handlerPropertyName = 'handler') {
    const functionsToBuild = await this.functions(handlerPropertyName);

    if (Object.keys(functionsToBuild).length === 0) {
      log.debug('No functions to build with esbuild');
      return;
    }

    const updatedFunctionsToBuild = {};

    const buildProperties = this._buildProperties();

    for (const [alias, functionObject] of Object.entries(functionsToBuild)) {
      const functionName = path.extname(functionObject[handlerPropertyName]).slice(1);
      const handlerPath = functionObject[handlerPropertyName].replace(`.${functionName}`, '');
      const runtime = functionObject.runtime || this.serverless.service.provider.runtime;

      const external = Array.from(this._getExternal(runtime).external);

      const extension = await this._extensionForFunction(functionObject[handlerPropertyName]);
      if (extension) {
        // Enrich the functionObject with additional values we will need for building
        updatedFunctionsToBuild[alias] = {
          ...functionObject,
          handlerPath: path.join(this.serverless.config.serviceDir, handlerPath + extension),
          extension,
          esbuild: { external },
        };
      }
    }

    // Determine the concurrency to use for building functions, by default framework will attempt to build
    // all functions concurrently, but this can be overridden by setting the buildConcurrency property.
    const concurrency = buildProperties.buildConcurrency ?? Object.keys(functionsToBuild).length;

    const limit = pLimit(concurrency);

    await Promise.all(
      Object.entries(updatedFunctionsToBuild).map(([alias, functionObject]) => {
        return limit(async () => {
          const functionName = path.extname(functionObject[handlerPropertyName]).slice(1);
          const handlerPath = functionObject[handlerPropertyName].replace(`.${functionName}`, '');
          await esbuild.build({
            ...buildProperties,
            platform: 'node',
            external: functionObject.esbuild.external,
            entryPoints: [functionObject.handlerPath],
            outfile: path.join(
              this.serverless.config.serviceDir,
              '.serverless',
              'build',
              handlerPath + '.js'
            ),
          });
          if (!this.serverless.builtFunctions) {
            this.serverless.builtFunctions = new Set();
          }
          this.serverless.builtFunctions.add(alias);
        });
      })
    );

    return;
  }

  /**
   * Take the current build context. Which could be service-wide or a given function and then package it.
   * 
   * This function takes package.individually into account and will either create a single zip file to use for all functions or a zip file per function otherwise.
   * 
   * @param {string} handlerPropertyName - The property name of the handler in the function object. In the case of dev mode this will be different, so we need to be able to set it.
   */
  async _package(handlerPropertyName = 'handler') {
    const functions = await this.functions(handlerPropertyName);
    const buildProperties = this._buildProperties();

    if (Object.keys(functions).length === 0) {
      log.debug('No functions to package');
      return;
    }

    // If not packaging individually then package all functions together into a single zip
    if (!this.serverless?.service?.package?.individually) {
      await this._packageAll(handlerPropertyName);
      return;
    }

    const concurrency = buildProperties.buildConcurrency ?? Object.keys(functions).length;

    const limit = pLimit(concurrency);

    const zipPromises = Object.entries(functions).map(([functionAlias, functionObject]) => {
      return limit(async () => {
        const zipName = `${this.serverless.service.service}-${functionAlias}.zip`;
        const zipPath = path.join(
          this.serverless.config.serviceDir,
          '.serverless',
          'build',
          zipName
        );

        const zip = archiver.create('zip');
        const output = createWriteStream(zipPath);

        const zipPromise = new Promise(async (resolve, reject) => {
          output.on('close', () => resolve(zipPath));
          output.on('error', (err) => reject(err));

          output.on('open', async () => {
            zip.pipe(output);
            const functionName = path.extname(functionObject[handlerPropertyName]).slice(1);
            const handlerPath = functionObject[handlerPropertyName].replace(`.${functionName}`, '');

            const handlerZipPath = path.join(
              this.serverless.config.serviceDir,
              '.serverless',
              'build',
              handlerPath + '.js'
            );

            zip.file(handlerZipPath, { name: `${handlerPath}.js` });

            zip.directory(
              path.join(this.serverless.config.serviceDir, '.serverless', 'build', 'node_modules'),
              'node_modules'
            );
            await zip.finalize();
            functionObject.package = {
              artifact: zipPath,
            };
          });
        });
        await zipPromise;
      });
    });

    await Promise.all(zipPromises);
  }

  async _packageAll(functions, handlerPropertyName = 'handler') {
    const zipName = `${this.serverless.service.service}.zip`;
    const zipPath = path.join(this.serverless.config.serviceDir, '.serverless', 'build', zipName);

    const zip = archiver.create('zip');
    const output = createWriteStream(zipPath);

    const zipPromise = new Promise(async (resolve, reject) => {
      output.on('close', () => resolve(zipPath));
      output.on('error', (err) => reject(err));

      output.on('open', async () => {
        zip.pipe(output);

        for (const [, functionObject] of Object.entries(functions)) {
          const functionName = path.extname(functionObject[handlerPropertyName]).slice(1);
          const handlerPath = functionObject[handlerPropertyName].replace(`.${functionName}`, '');

          const handlerZipPath = path.join(
            this.serverless.config.serviceDir,
            '.serverless',
            'build',
            handlerPath + '.js'
          );

          zip.file(handlerZipPath, { name: `${handlerPath}.js` });
        }

        zip.directory(
          path.join(this.serverless.config.serviceDir, '.serverless', 'build', 'node_modules'),
          'node_modules'
        );

        await zip.finalize();
        this.serverless.service.package.artifact = zipPath;
      });
    });

    await zipPromise;
  }

  /**
   * Take the package.json and add an updated version with no dev dependencies and external and excluded node_modules taken care of, to the .serverless/build directory
   */
  async _preparePackageJson() {
    const runtime = this.serverless.service.provider.runtime || 'nodejs18.x';

    const { external, exclude } = this._getExternal(runtime);

    const packageJsonPath = path.join(this.serverless.config.serviceDir, 'package.json');
    const packageJsonStr = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonStr);

    const packageJsonNoDevDeps = {
      ...packageJson,
    };
    delete packageJsonNoDevDeps.devDependencies;

    if (packageJson.dependencies) {
      packageJsonNoDevDeps.dependencies = {};
      for (const key of external) {
        if (packageJson.dependencies[key]) {
          packageJsonNoDevDeps.dependencies[key] = packageJson.dependencies[key];
        }
      }

      for (const key of exclude) {
        if (key === '@aws-sdk/*') {
          const awsSdkPackages = Object.keys(packageJsonNoDevDeps.dependencies).filter((dep) =>
            dep.startsWith('@aws-sdk/')
          );
          for (const awsSdkPackage of awsSdkPackages) {
            delete packageJsonNoDevDeps.dependencies[awsSdkPackage];
          }
        } else {
          delete packageJsonNoDevDeps.dependencies[key];
        }
      }
    }

    const packageJsonNoDevDepsStr = JSON.stringify(packageJsonNoDevDeps, null, 2);

    const packageJsonBuildPath = path.join(
      this.serverless.config.serviceDir,
      '.serverless',
      'build',
      'package.json'
    );

    await writeFile(packageJsonBuildPath, packageJsonNoDevDepsStr);

    const packager = this._determinePackager();

    await new Promise((resolve, reject) => {
      const child = spawn(packager, ['install'], {
        cwd: path.join(this.serverless.config.serviceDir, '.serverless', 'build'),
      });
      child.on('error', (error) => {
        log.error('Error installing dependencies', error);
        reject(error);
      });

      child.on('close', (code) => {
        resolve(code);
      });
    });
  }

  _determinePackager() {
    if (existsSync(path.join(this.serverless.config.serviceDir, 'yarn.lock'))) {
      return 'yarn';
    } else if (existsSync(path.join(this.serverless.config.serviceDir, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    } else {
      return 'npm';
    }
  }

  /**
   * Cleanup, mainly removing build files and directories
   */
  async _cleanUp() {
    try {
      await rm(path.join(this.serverless.config.serviceDir, '.serverless', 'build'), {
        recursive: true,
        force: true,
      });
    } catch (err) {
      // empty error
    }
  }

  async _useLocalEsbuild() {
    const packageJsonPath = path.join(this.serverless.serviceDir, 'package.json');
    if (existsSync(packageJsonPath)) {
      const packageJsonStr = await readFile(packageJsonPath, 'utf-8');
      const packageJson = JSON.parse(packageJsonStr);
      return Object.keys(packageJson?.devDependencies || {}).includes('esbuild');
    }

    return false;
  }
}

export default Esbuild;
