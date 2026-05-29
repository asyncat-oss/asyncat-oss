#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createCanvas, loadImage } = require('canvas');
const { appBuilderPath } = require('app-builder-bin');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'neko', 'public');
const sourcePath = path.join(publicDir, 'Logo_Asyncat.png');
const linuxIconDir = path.join(publicDir, 'icons');

const pngTargets = [
  ['app-icon-1024.png', 1024],
  ['app-icon-512.png', 512],
  ['app-tray.png', 32],
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['cat-icon-96.png', 96],
  ['cat-icon-512.png', 512],
  ['pwa-72x72.png', 72],
  ['pwa-96x96.png', 96],
  ['pwa-128x128.png', 128],
  ['pwa-144x144.png', 144],
  ['pwa-152x152.png', 152],
  ['pwa-192x192.png', 192],
  ['pwa-384x384.png', 384],
  ['pwa-512x512.png', 512],
];

const linuxSizes = [16, 32, 48, 64, 128, 256, 512, 1024];
const icoSizes = [16, 24, 32, 48, 64, 128, 256];
const macIconsetTargets = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
];

function renderSquarePngBuffer(image, size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const scale = size / Math.max(image.width, image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (size - width) / 2;
  const y = (size - height) / 2;

  ctx.drawImage(image, x, y, width, height);
  return canvas.toBuffer('image/png');
}

function renderSquarePng(image, size, outputPath) {
  fs.writeFileSync(outputPath, renderSquarePngBuffer(image, size));
}

function writeIco(image, outputPath) {
  const images = icoSizes.map(size => ({
    size,
    data: renderSquarePngBuffer(image, size),
  }));

  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entryOffset = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entryOffset);
    header.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    header.writeUInt8(0, entryOffset + 2);
    header.writeUInt8(0, entryOffset + 3);
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(data.length, entryOffset + 8);
    header.writeUInt32LE(offset, entryOffset + 12);
    offset += data.length;
  });

  fs.writeFileSync(outputPath, Buffer.concat([header, ...images.map(({ data }) => data)]));
}

function runAppBuilderIcns() {
  const result = spawnSync(appBuilderPath, [
    'icon',
    '--format=icns',
    '--root',
    publicDir,
    '--out',
    publicDir,
    '--input',
    path.join(publicDir, 'app-icon-1024.png'),
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }
}

function writeIcns(image, outputPath) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asyncat-iconset-'));
  const iconsetDir = path.join(tmpDir, 'Asyncat.iconset');
  fs.mkdirSync(iconsetDir, { recursive: true });

  try {
    for (const [name, size] of macIconsetTargets) {
      renderSquarePng(image, size, path.join(iconsetDir, name));
    }

    const result = spawnSync('iconutil', [
      '-c',
      'icns',
      '-o',
      outputPath,
      iconsetDir,
    ], {
      cwd: root,
      encoding: 'utf8',
    });

    if (result.status !== 0) {
      runAppBuilderIcns();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

(async () => {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source icon: ${sourcePath}`);
  }

  fs.mkdirSync(linuxIconDir, { recursive: true });

  const image = await loadImage(sourcePath);

  for (const [name, size] of pngTargets) {
    renderSquarePng(image, size, path.join(publicDir, name));
  }

  for (const size of linuxSizes) {
    renderSquarePng(image, size, path.join(linuxIconDir, `${size}x${size}.png`));
  }

  writeIcns(image, path.join(publicDir, 'icon.icns'));
  writeIco(image, path.join(publicDir, 'icon.ico'));

  console.log(`Generated icons from ${path.relative(root, sourcePath)}`);
})();
