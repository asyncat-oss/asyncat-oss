// Loaded before every test file (see "test" in package.json) so that tests
// never touch the real data folder (den/data) or database: each test file
// gets its own temporary ones unless it sets its own.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-test-'));
process.env.DB_PATH ||= path.join(scratch, 'asyncat.db');
process.env.ASYNCAT_DATA_PATH ||= path.join(scratch, 'data');
process.on('exit', () => fs.rmSync(scratch, { recursive: true, force: true }));
