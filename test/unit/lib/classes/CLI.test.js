'use strict';

const chai = require('chai');
const sinon = require('sinon');
const CLI = require('../../../../lib/classes/CLI');
const fse = require('fs-extra');
const spawn = require('child-process-ext/spawn');
const resolveAwsEnv = require('@serverless/test/resolve-env');
const stripAnsi = require('strip-ansi');
const Serverless = require('../../../../lib/Serverless');
const { getTmpDirPath } = require('../../../utils/fs');
const runServerless = require('../../../utils/run-serverless');

const { expect } = chai;
chai.use(require('sinon-chai'));

describe('CLI', () => {
  let cli;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless({});
  });

  describe('#constructor()', () => {
    it('should set the serverless instance', () => {
      cli = new CLI(serverless);
      expect(cli.serverless).to.deep.equal(serverless);
    });

    it('should set an empty loadedPlugins array', () => {
      cli = new CLI(serverless);
      expect(cli.loadedPlugins.length).to.equal(0);
    });
  });

  describe('#setLoadedPlugins()', () => {
    it('should set the loadedPlugins array with the given plugin instances', () => {
      class PluginMock {}

      const pluginMock = new PluginMock();
      const plugins = [pluginMock];

      cli = new CLI(serverless);

      cli.setLoadedPlugins(plugins);

      expect(cli.loadedPlugins[0]).to.equal(pluginMock);
    });
  });

  describe('#suppressLogIfPrintCommand()', () => {
    let logStub;
    let consoleLogStub;

    beforeEach(() => {
      logStub = sinon.stub();
      consoleLogStub = sinon.stub();
    });

    it('should do nothing when no command is given', () => {
      cli = new CLI(serverless);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      cli.suppressLogIfPrintCommand({ commands: [], options: {} });
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should do nothing when "print" is given with "--help"', () => {
      cli = new CLI(serverless);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      cli.suppressLogIfPrintCommand({
        commands: ['print'],
        options: { help: true },
      });
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should do nothing when "print" is combined with other command.', () => {
      cli = new CLI(serverless);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      cli.suppressLogIfPrintCommand({ commands: ['other', 'print'], options: {} });
      cli.log('logged');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(true);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });

    it('should suppress log when "print" is given', () => {
      cli = new CLI(serverless);
      cli.log = logStub;
      cli.consoleLog = consoleLogStub;

      cli.suppressLogIfPrintCommand({ commands: ['print'], options: {} });
      cli.log('NOT LOGGED');
      cli.consoleLog('logged');

      expect(logStub.calledOnce).to.equal(false);
      expect(consoleLogStub.calledOnce).to.equal(true);
    });
  });

  describe('#displayHelp()', () => {
    it('should return true when no command is given', () => {
      cli = new CLI(serverless);
      const helpDisplayed = cli.displayHelp({ commands: [], options: {} });

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "help" parameter is given', () => {
      cli = new CLI(serverless);
      const helpDisplayed = cli.displayHelp({ commands: ['help'], options: {} });

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "--help" parameter is given', () => {
      cli = new CLI(serverless);
      serverless.cli = cli;

      class PluginMock {
        constructor() {
          this.commands = {
            test: {
              usage: 'test',
              lifecycleEvents: ['test'],
              options: {
                name: {
                  usage: 'test',
                },
                provider: {
                  usage: 'test',
                },
              },
              commands: {
                test: {
                  usage: 'test',
                  lifecycleEvents: ['test'],
                  options: {
                    name: {
                      usage: 'test',
                    },
                    provider: {
                      usage: 'test',
                    },
                  },
                },
              },
            },
          };
        }
      }
      serverless.pluginManager.addPlugin(PluginMock);

      cli.setLoadedPlugins(serverless.pluginManager.getPlugins());
      cli.setLoadedCommands(serverless.pluginManager.getCommands());

      const helpDisplayed = cli.displayHelp({ commands: [], options: { help: true } });

      expect(helpDisplayed).to.equal(true);
    });

    it('should return true when the "-h" parameter is given with a command', () => {
      cli = new CLI(serverless);
      serverless.cli = cli;
      class PluginMock {
        constructor() {
          this.commands = {
            test: {
              usage: 'test',
              lifecycleEvents: ['test'],
              options: {
                name: {
                  usage: 'test',
                },
                provider: {
                  usage: 'test',
                },
              },
            },
          };
        }
      }
      serverless.pluginManager.addPlugin(PluginMock);

      cli.setLoadedPlugins(serverless.pluginManager.getPlugins());
      cli.setLoadedCommands(serverless.pluginManager.getCommands());

      const helpDisplayed = cli.displayHelp({ commands: ['test'], options: { help: true } });

      expect(helpDisplayed).to.equal(true);
    });

    it('should return false if no "help" related command / option is given', () => {
      cli = new CLI(serverless);
      serverless.cli = cli;
      class PluginMock {
        constructor() {
          this.commands = {
            test: {
              usage: 'test',
              lifecycleEvents: ['test'],
              options: {
                name: {
                  usage: 'test',
                },
              },
            },
          };
        }
      }
      serverless.pluginManager.addPlugin(PluginMock);

      cli.setLoadedPlugins(serverless.pluginManager.getPlugins());
      cli.setLoadedCommands(serverless.pluginManager.getCommands());

      const helpDisplayed = cli.displayHelp({ commands: ['test'], options: {} });

      expect(helpDisplayed).to.equal(false);
    });
  });

  describe('#generateCommandsHelp()', () => {
    let getCommandsStub;
    let consoleLogStub;
    let displayCommandUsageStub;
    let displayCommandOptionsStub;

    const commands = {
      package: {
        usage: 'Packages a Serverless service',
        lifecycleEvents: ['cleanup', 'initialize'],
        options: {},
        key: 'package',
        pluginName: 'Package',
      },
      deploy: {
        usage: 'Deploy a Serverless service',
        lifecycleEvents: ['cleanup', 'initialize'],
        options: {},
        key: 'deploy',
        pluginName: 'Deploy',
        commands: {},
      },
    };

    beforeEach(() => {
      cli = new CLI(serverless);
      getCommandsStub = sinon.stub(cli.serverless.pluginManager, 'getCommands').returns(commands);
      consoleLogStub = sinon.stub(cli, 'consoleLog').returns();
      displayCommandUsageStub = sinon.stub(cli, 'displayCommandUsage').returns();
      displayCommandOptionsStub = sinon.stub(cli, 'displayCommandOptions').returns();
    });

    afterEach(() => {
      cli.serverless.pluginManager.getCommands.restore();
      cli.consoleLog.restore();
      cli.displayCommandUsage.restore();
      cli.displayCommandOptions.restore();
    });

    it('should gather and generate the commands help info if the command can be found', () => {
      const commandsArray = ['package'];

      cli.generateCommandsHelp(commandsArray);

      expect(getCommandsStub.calledOnce).to.equal(true);
      expect(consoleLogStub.called).to.equal(true);
      expect(displayCommandUsageStub.calledOnce).to.equal(true);
      expect(displayCommandUsageStub.calledWithExactly(commands.package, 'package')).to.equal(true);
      expect(displayCommandOptionsStub.calledOnce).to.equal(true);
      expect(displayCommandOptionsStub.calledWithExactly(commands.package)).to.equal(true);
    });

    it('should throw an error if the command could not be found', () => {
      const commandsArray = ['invalid-command'];
      expect(() => {
        cli.generateCommandsHelp(commandsArray);
      }).to.throw(Error, 'not found');
      expect(getCommandsStub.calledOnce).to.equal(true);
      expect(consoleLogStub.called).to.equal(false);
      expect(displayCommandUsageStub.calledOnce).to.equal(false);
      expect(displayCommandOptionsStub.calledOnce).to.equal(false);
    });
  });

  describe('#displayCommandUsage', () => {
    let consoleLogStub;
    const mycommand = {
      type: 'container',
      commands: {
        subcmd: {
          usage: 'Subcmd usage',
          lifecycleEvents: ['event1', 'event2'],
        },
      },
    };

    beforeEach(() => {
      cli = new CLI(serverless);
      consoleLogStub = sinon.stub(cli, 'consoleLog').returns();
    });

    afterEach(() => {
      cli.consoleLog.restore();
    });

    it('should not display container command', () => {
      cli.displayCommandUsage(mycommand, 'mycommand');

      expect(consoleLogStub.calledWith(sinon.match('mycommand .'))).to.equal(false);
    });

    it('should display container subcommand', () => {
      cli.displayCommandUsage(mycommand, 'mycommand');
      expect(stripAnsi(consoleLogStub.firstCall.args[0]).startsWith('mycommand subcmd .')).to.equal(
        true
      );
    });
  });

  describe('#log', () => {
    let consoleLogSpy;

    beforeEach(() => {
      cli = new CLI(serverless);
      consoleLogSpy = sinon.spy(cli, 'consoleLog');
    });

    afterEach(() => {
      cli.consoleLog.restore();
    });

    it('should log messages', () => {
      const msg = 'Hello World!';

      cli.log(msg);

      expect(consoleLogSpy.callCount).to.equal(1);
      expect(stripAnsi(consoleLogSpy.firstCall.args[0])).to.equal('Serverless: Hello World!');
    });

    it('should support different entities', () => {
      const msg = 'Hello World!';
      const entity = 'Entity';

      cli.log(msg, entity);

      expect(consoleLogSpy.callCount).to.equal(1);
      expect(stripAnsi(consoleLogSpy.firstCall.args[0])).to.equal('Entity: Hello World!');
    });

    // NOTE: Here we're just testing that it won't break
    it('should support logging options', () => {
      const msg = 'Hello World!';
      const opts = {
        color: 'orange',
        bold: true,
        underline: true,
      };

      cli.log(msg, 'Serverless', opts);

      expect(consoleLogSpy.callCount).to.equal(1);
      expect(stripAnsi(consoleLogSpy.firstCall.args[0])).to.equal('Serverless: Hello World!');
    });

    it('should ignore invalid logging options', () => {
      const msg = 'Hello World!';
      const opts = {
        invalid: 'option',
      };

      cli.log(msg, 'Serverless', opts);

      expect(consoleLogSpy.callCount).to.equal(1);
      expect(stripAnsi(consoleLogSpy.firstCall.args[0])).to.equal('Serverless: Hello World!');
    });
  });

  describe('Integration tests', function () {
    this.timeout(1000 * 60 * 10);
    const serverlessExec = require('../../../serverlessBinary');
    const env = resolveAwsEnv();

    before(() => {
      const tmpDir = getTmpDirPath();

      this.cwd = process.cwd();

      fse.mkdirsSync(tmpDir);
      process.chdir(tmpDir);
    });

    after(() => {
      process.chdir(this.cwd);
    });

    it('should print general --help to stdout', () =>
      spawn(serverlessExec, ['--help'], { env }).then(({ stdoutBuffer }) =>
        expect(String(stdoutBuffer)).to.contain('contextual help')
      ));

    it('should print command --help to stdout', () =>
      spawn(serverlessExec, ['deploy', '--help'], { env }).then(({ stdoutBuffer }) => {
        const stdout = String(stdoutBuffer);
        expect(stdout).to.contain('deploy');
        expect(stdout).to.contain('--stage');
      }));
  });
});

describe('CLI [new tests]', () => {
  it('Should show help when requested and in context of invalid service configuration', () =>
    runServerless({
      fixture: 'configInvalid',
      cliArgs: ['--help'],
    }).then(({ stdoutData }) => {
      expect(stdoutData).to.include('Documentation: http://slss.io/docs');
    }));

  it('Should handle incomplete command configurations', async () => {
    const { stdoutData } = await runServerless({
      fixture: 'plugin',
      cliArgs: ['customCommand', '--help'],
    });
    expect(stdoutData).to.include('Description of custom command');
  });
});
