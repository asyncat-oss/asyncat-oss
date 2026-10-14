// Loaded before every test file (see "test" in package.json) so that tests
// never touch the real data folder (den/data), database, den/.env or home
// folder (the command sandbox makes folders there): each test file gets its
// own temporary ones unless it sets its own.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-test-'));
process.env.DB_PATH ||= path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH ||= path.join(scratch, 'data');
process.env.ASYNCAT_ENV_PATH ||= path.join(scratch, '.env');
// Apart from the data folder, so a folder that holds one doesn't hold the other.
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-test-home-'));
process.env.HOME = home;
process.on('exit', () => {
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});
