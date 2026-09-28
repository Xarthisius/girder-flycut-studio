// setup.py and the client's package.json each carry a version; nothing kept
// them in step. Fails the build when they drift (issue F4).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLIENT = path.resolve(HERE, '..');
const ROOT = path.resolve(HERE, '../../..');

const pkg = JSON.parse(fs.readFileSync(path.join(CLIENT, 'package.json'), 'utf8')).version;
const setup = fs.readFileSync(path.join(ROOT, 'setup.py'), 'utf8').match(/version="([^"]+)"/);

if (!setup) {
    throw new Error('check-version: no version="..." found in setup.py');
}
if (setup[1] !== pkg) {
    throw new Error(
        `check-version: setup.py says ${setup[1]} but package.json says ${pkg}. ` +
        'They name the same release; update both.');
}
process.stdout.write(`Version ${pkg} agrees across setup.py and package.json.\n`);
