import path from 'path';
import fsp from 'fs/promises';
import { fileURLToPath } from 'url';
import utils from '@serverlessinc/sf-core/src/utils.js';

const { log } = utils;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const npmPackageRoot = path.resolve(__dirname, '../../../');

export default async () => {
  const stats = await fsp.stat(npmPackageRoot);
  try {
    await fsp.utimes(npmPackageRoot, String(stats.atimeMs / 1000), String(stats.mtimeMs / 1000));
    return true;
  } catch (error) {
    log.info('Auto update: file access error: %O', error);
    return false;
  }
};
