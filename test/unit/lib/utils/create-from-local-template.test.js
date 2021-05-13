'use strict';

const path = require('path');
const chai = require('chai');
const fsp = require('fs').promises;
const { load: yamlParse } = require('js-yaml');
const createFromLocalTemplate = require('../../../../lib/utils/create-from-local-template');
const { getTmpDirPath } = require('../../../utils/fs');

const templatesPath = path.resolve(__dirname, '../../../../lib/plugins/create/templates');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

describe('test/unit/lib/utils/create-from-local-template.test.js', () => {
  describe('Without `projectName` provided', () => {
    it('should create from template referenced locally', async () => {
      const tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      createFromLocalTemplate({
        templatePath: path.join(templatesPath, 'aws-nodejs'),
        projectDir: tmpDirPath,
      });
      const stats = await fsp.lstat(path.join(tmpDirPath, 'serverless.yml'));
      expect(stats.isFile()).to.be.true;
    });
  });

  describe('When `templatePath` does not exist', () => {
    it('should result in an error', async () => {
      const tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      expect(() =>
        createFromLocalTemplate({
          templatePath: path.join(templatesPath, 'nonexistent'),
          projectDir: tmpDirPath,
        })
      )
        .to.throw()
        .and.have.property('code', 'INVALID_TEMPLATE_PATH');
    });
  });

  describe('With `projectName` provided', () => {
    let tmpDirPath;

    before(() => {
      tmpDirPath = path.join(getTmpDirPath(), 'some-service');
      createFromLocalTemplate({
        templatePath: path.join(templatesPath, 'fn-nodejs'),
        projectDir: tmpDirPath,
        projectName: 'testproj',
      });
    });

    it('should set service name in serverless.yml', async () =>
      expect(
        yamlParse(await fsp.readFile(path.join(tmpDirPath, 'serverless.yml'))).service
      ).to.equal('testproj'));

    it('should set name in package.json', async () =>
      expect(JSON.parse(await fsp.readFile(path.join(tmpDirPath, 'package.json'))).name).to.equal(
        'testproj'
      ));
  });
});
