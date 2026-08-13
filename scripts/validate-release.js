#!/usr/bin/env node
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_PATHS = ['package.json', 'den/package.json', 'neko/package.json'];

function normalizedTagVersion(tag) {
  const match = String(tag || '').trim().match(
    /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  return match ? `${match[1]}.${match[2]}.${match[3]}${match[4] || ''}` : null;
}

export function validateVersions(packages, tag = '') {
  const entries = Object.entries(packages);
  if (entries.length === 0) throw new Error('No package versions were supplied.');

  const expected = entries[0][1];
  const mismatches = entries.filter(([, version]) => version !== expected);
  if (mismatches.length > 0) {
    throw new Error(`Package versions must match: ${entries.map(([name, version]) => `${name}=${version}`).join(', ')}`);
  }

  if (tag) {
    const tagVersion = normalizedTagVersion(tag);
    if (!tagVersion) throw new Error(`Release tag must be strict SemVer with a leading v: ${tag}`);
    if (tagVersion !== expected) {
      throw new Error(`Release tag ${tag} does not match package version ${expected}.`);
    }
  }

  return expected;
}

export function readPackageVersions(root = ROOT) {
  return Object.fromEntries(PACKAGE_PATHS.map((relativePath) => {
    const pkg = JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
    return [relativePath, pkg.version];
  }));
}

function main() {
  const tag = process.argv[2] || process.env.GITHUB_REF_NAME || '';
  const packages = readPackageVersions();
  const version = validateVersions(packages, tag);
  console.log(`[release] Version contract valid: v${version}${tag ? ` (${tag})` : ''}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(`[release] ${error.message}`);
    process.exitCode = 1;
  }
}
