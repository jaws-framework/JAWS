'use strict';

const BbPromise = require('bluebird');
const fse = require('fs-extra');
const path = require('path');

class Create {
  constructor(serverless, options) {
    this.serverless = serverless;
    this.options = options;

    this.commands = {
      create: {
        usage: 'create new Serverless Service.',
        lifecycleEvents: [
          'create',
        ],
        options: {
          name: {
            usage: 'Name of the service',
            required: true,
            shortcut: 'n',
          },
          provider: {
            usage: 'Provider of the service',
            required: true,
            shortcut: 'p',
          },
          template: {
            usage: 'Template of the service (default: node)',
            shortcut: 't',
          },
        },
      },
    };

    if (this.options) {
      this.options.template = this.options.t = this.options.template
        || (this.serverless.service.defaults && this.serverless.service.defaults.template)
        || 'node';
    }

    this.hooks = {
      'create:create': () => BbPromise.bind(this)
        // .then(this.prompt)
        .then(this.validate)
        .then(this.scaffold)
        .then(this.finish),
    };
  }

  validate() {
    this.serverless.cli.log('Creating new Serverless service...');

    // Validate Name - AWS only allows Alphanumeric and - in name
    const nameOk = /^([a-zA-Z0-9-]+)$/.exec(this.options.name);
    if (!nameOk) {
      throw new this.serverless.classes.Error('Service names can only be alphanumeric and -');
    }

    if (['aws', 'azure', 'google', 'ibm'].indexOf(this.options.provider)) {
      const errorMessage = [
        `Provider "${this.options.provider}" is not supported.`,
        ' Valid values for provider are: aws, azure, google, ibm.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    if (['node', 'node43', 'python27', 'java8', 'golang'].indexOf(this.options.template)) {
      const errorMessage = [
        `Template "${this.options.template}" is not supported.`,
        ' Valid values for template are: node, node43, python27, java8, golang.',
      ].join('');
      throw new this.serverless.classes.Error(errorMessage);
    }

    this.serverless.config
      .update({ servicePath: path.join(process.cwd(), this.options.name) });

    // parse yaml - returns a Promise
    return this.serverless.yamlParser.parse(path.join(this.serverless
      .config.serverlessPath, 'templates', 'serverless.yaml'));
  }

  scaffold(serverlessYamlParam) {
    const serverlessYaml = serverlessYamlParam;
    serverlessYaml.service = this.options.name;
    serverlessYaml.provider = this.options.provider;

    // write serverless.yaml
    this.serverless.utils.writeFileSync(path.join(this.serverless
      .config.servicePath, 'serverless.yaml'), serverlessYaml);

    // write serverless.env.yaml
    fse.copySync(path.join(this.serverless.config.serverlessPath,
      'templates', 'serverless.env.yaml'), path.join(this.serverless
      .config.servicePath, 'serverless.env.yaml'));

    this.serverless.cli.log(`Using the "${this.options.template}" template...`);
    // write handler.js
    fse.copySync(path.join(this.serverless.config.serverlessPath,
      'templates', this.options.provider, this.options.template, 'handler.js'),
      path.join(this.serverless.config.servicePath, 'handler.js'));

    const packageJson = this.serverless.utils.readFileSync(
      path.join(this.serverless.config.serverlessPath,
      'templates', this.options.provider, this.options.template, 'package.json'));
    packageJson.name = this.options.name;

    // write package.json
    this.serverless.utils.writeFileSync(path.join(this.serverless
      .config.servicePath, 'package.json'), packageJson);

    return BbPromise.resolve();
  }

  finish() {
    this.serverless.cli.log(`Successfully created service "${this.options.name}"`);
    this.serverless.cli.log('  |- serverless.yaml');
    this.serverless.cli.log('  |- serverless.env.yaml');
    this.serverless.cli.log('  |- handler.js');
    this.serverless.cli.log('  |- package.json');
    return BbPromise.resolve();
  }
}

module.exports = Create;
