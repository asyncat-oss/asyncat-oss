'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const { appInfo } = context.packager;
  const executable = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const icon = path.join(context.packager.buildResourcesDir, 'icon.ico');
  const rcedit = path.join(
    path.dirname(require.resolve('electron-winstaller/package.json')),
    'vendor',
    'rcedit.exe',
  );

  const fileVersion = appInfo.shortVersion || appInfo.buildVersion;
  const productVersion = appInfo.shortVersionWindows || appInfo.getVersionInWeirdWindowsForm();
  const args = [
    executable,
    '--set-icon', icon,
    '--set-version-string', 'FileDescription', appInfo.productName,
    '--set-version-string', 'ProductName', appInfo.productName,
    '--set-version-string', 'InternalName', appInfo.productFilename,
    '--set-version-string', 'OriginalFilename', `${appInfo.productFilename}.exe`,
    '--set-version-string', 'LegalCopyright', appInfo.copyright,
    '--set-file-version', fileVersion,
    '--set-product-version', productVersion,
  ];

  if (appInfo.companyName) {
    args.push('--set-version-string', 'CompanyName', appInfo.companyName);
  }

  execFileSync(rcedit, args, { stdio: 'inherit' });
};
