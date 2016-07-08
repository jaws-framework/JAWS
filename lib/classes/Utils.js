'use strict';

const fs = require('fs');
const path = require('path');
const YAML = require('js-yaml');
const BbPromise = require('bluebird');
const fse = BbPromise.promisifyAll(require('fs-extra'));
const debug = require('debug')('Utils.js');

class Utils {

  constructor(serverless) {
    this.serverless = serverless;
  }

  dirExistsSync(dirPath) {
    try {
      const stats = fse.statSync(dirPath);
      return stats.isDirectory();
    } catch (e) {
      return false;
    }
  }

  fileExistsSync(filePath) {
    try {
      const stats = fse.lstatSync(filePath);
      return stats.isFile();
    } catch (e) {
      return false;
    }
  }

  writeFileSync(filePath, conts) {
    debug(`Reading file sync: ${filePath}`);
    let contents = conts || '';

    fse.mkdirsSync(path.dirname(filePath));

    if (filePath.indexOf('.json') !== -1 && typeof contents !== 'string') {
      contents = JSON.stringify(contents, null, 2);
    }

    if (filePath.indexOf('.yaml') !== -1 && typeof contents !== 'string') {
      contents = YAML.dump(contents, { indent: 4 });
    }

    return fse.writeFileSync(filePath, contents);
  }

  writeFile(filePath, contents) {
    debug(`Writing file async: ${filePath}`);
    const that = this;
    return new BbPromise((resolve, reject) => {
      try {
        that.writeFileSync(filePath, contents);
      } catch (e) {
        reject(e);
      }
      resolve();
    });
  }

  readFileSync(filePath) {
    debug(`Reading file sync: ${filePath}`);
    let contents;

    // Read file
    contents = fse.readFileSync(filePath);

    // Auto-parse JSON
    if (filePath.endsWith('.json')) contents = JSON.parse(contents);

    return contents;
  }

  readFile(filePath) {
    debug(`Reading file async: ${filePath}`);
    const that = this;
    let contents;
    return new BbPromise((resolve, reject) => {
      try {
        contents = that.readFileSync(filePath);
      } catch (e) {
        reject(e);
      }
      resolve(contents);
    });
  }

  walkDirSync(dirPath) {
    let filePaths = [];
    const list = fs.readdirSync(dirPath);
    list.forEach((filePathParam) => {
      let filePath = filePathParam;
      filePath = path.join(dirPath, filePath);
      const stat = fs.statSync(filePath);
      if (stat && stat.isDirectory()) {
        filePaths = filePaths.concat(this.walkDirSync(filePath));
      } else {
        filePaths.push(filePath);
      }
    });

    return filePaths;
  }

  generateShortId(length) {
    return Math.random().toString(36).substr(2, length);
  }

  findServicePath() {
    const that = this;

    // Helper function
    const isServiceDir = (dir) => {
      // TODO: add support for serverless.yml
      const yamlName = 'serverless.yaml';
      const yamlFilePath = path.join(dir, yamlName);

      return that.fileExistsSync(yamlFilePath);
    };

    // Check up to 10 parent levels
    let previous = '.';
    let servicePath = null;
    let i = 10;

    while (i >= 0) {
      const fullPath = path.resolve(process.cwd(), previous);

      if (isServiceDir(fullPath)) {
        servicePath = fullPath;
        break;
      }

      previous = path.join(previous, '..');
      i--;
    }

    return servicePath;
  }
}

module.exports = Utils;
