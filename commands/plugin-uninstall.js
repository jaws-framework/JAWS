'use strict';

const spawn = require('child-process-ext/spawn');
const fsp = require('fs').promises;
const fse = require('fs-extra');
const path = require('path');
const _ = require('lodash');
const isPlainObject = require('type/plain-object/is');
const yaml = require('js-yaml');
const cloudformationSchema = require('@serverless/utils/cloudformation-schema');
const log = require('@serverless/utils/log');
const yamlAstParser = require('../lib/utils/yamlAstParser');
const npmCommandDeferred = require('../lib/utils/npm-command-deferred');
const {
  getPluginInfo,
  getServerlessFilePath,
  validate,
} = require('../lib/commands/plugin-management');

module.exports = async ({ configuration, serviceDir, configurationFilename, options }) => {
  validate({ serviceDir });

  const pluginInfo = getPluginInfo(options.name);
  const pluginName = pluginInfo.name;
  const pluginVersion = pluginInfo.version || 'latest';
  const configurationFilePath = getServerlessFilePath({ serviceDir, configurationFilename });

  const context = { configuration, serviceDir, configurationFilePath, pluginName, pluginVersion };
  await uninstallPlugin(context);
  await removePluginFromServerlessFile(context);

  log(`Successfully uninstalled "${pluginName}@${pluginVersion}"`);
};

const uninstallPlugin = async ({ serviceDir, pluginName }) => {
  log(`Uninstalling plugin "${pluginName}" (this might take a few seconds...)`);
  await npmUninstall(pluginName, { serviceDir });
};

const removePluginFromServerlessFile = async ({ configurationFilePath, pluginName }) => {
  const fileExtension = path.extname(configurationFilePath);
  if (fileExtension === '.js' || fileExtension === '.ts') {
    requestManualUpdate(configurationFilePath);
    return;
  }

  if (_.last(configurationFilePath.split('.')) === 'json') {
    const serverlessFileObj = await fse.readJson(configurationFilePath);
    const isArrayPluginsObject = Array.isArray(serverlessFileObj.plugins);
    const plugins = isArrayPluginsObject
      ? serverlessFileObj.plugins
      : serverlessFileObj.plugins && serverlessFileObj.plugins.modules;

    if (plugins) {
      _.pull(plugins, pluginName);
      if (!plugins.length) {
        if (isArrayPluginsObject) {
          delete serverlessFileObj.plugins;
        } else {
          delete serverlessFileObj.plugins.modules;
        }
      }
      await fse.writeJson(configurationFilePath, serverlessFileObj);
    }
    return;
  }

  const serverlessFileObj = yaml.load(await fsp.readFile(configurationFilePath, 'utf8'), {
    filename: configurationFilePath,
    schema: cloudformationSchema,
  });
  if (serverlessFileObj.plugins != null) {
    // Plugins section can be behind veriables, opt-out in such case
    if (isPlainObject(serverlessFileObj.plugins)) {
      if (
        serverlessFileObj.plugins.modules != null &&
        !Array.isArray(serverlessFileObj.plugins.modules)
      ) {
        requestManualUpdate(configurationFilePath);
        return;
      }
    } else if (!Array.isArray(serverlessFileObj.plugins)) {
      requestManualUpdate(configurationFilePath);
      return;
    }
  }
  await yamlAstParser.removeExistingArrayItem(
    configurationFilePath,
    Array.isArray(serverlessFileObj.plugins) ? 'plugins' : 'plugins.modules',
    pluginName
  );
};

const npmUninstall = async (name, { serviceDir }) => {
  const { command, args } = await npmCommandDeferred;
  try {
    await spawn(command, [...args, 'uninstall', '--save-dev', name], {
      cwd: serviceDir,
      stdio: 'pipe',
      // To parse quotes used in module versions. E.g. 'serverless@"^1.60.0 || 2"'
      // https://stackoverflow.com/a/48015470
      shell: true,
    });
  } catch (error) {
    process.stdout.write(error.stderrBuffer);
    throw error;
  }
};

const requestManualUpdate = (configurationFilePath) =>
  log(`
  Can't automatically remove plugin from "${path.basename(configurationFilePath)}" file.
  Please do it manually.
`);
