#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { createCanvas, loadImage } = require('canvas');
const { appBuilderPath } = require('app-builder-bin');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'neko', 'public');
const sourcePath = path.join(publicDir, 'Logo_Asyncat.svg');
const linuxIconDir = path.join(publicDir, 'icons');

const pngTargets = [
  ['Logo_Asyncat.png', 1024],
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
const windowsIconSizes = [16, 20, 24, 32, 40, 48, 64, 256];
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

function renderSquareCanvas(image, size) {
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
  return canvas;
}

function renderSquarePngBuffer(image, size) {
  return renderSquareCanvas(image, size).toBuffer('image/png');
}

function renderSquarePng(image, size, outputPath) {
  fs.writeFileSync(outputPath, renderSquarePngBuffer(image, size));
}

function renderWindowsDib(image, size) {
  const canvas = renderSquareCanvas(image, size);
  const rgba = canvas.getContext('2d').getImageData(0, 0, size, size).data;
  const pixelBytes = size * size * 4;
  const maskStride = Math.ceil(size / 32) * 4;
  const maskBytes = maskStride * size;
  const dib = Buffer.alloc(40 + pixelBytes + maskBytes);

  // BITMAPINFOHEADER. ICO DIB heights include the color bitmap and AND mask.
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(pixelBytes, 20);

  for (let y = 0; y < size; y++) {
    const sourceY = size - 1 - y;
    for (let x = 0; x < size; x++) {
      const source = (sourceY * size + x) * 4;
      const target = 40 + (y * size + x) * 4;
      dib[target] = rgba[source + 2];
      dib[target + 1] = rgba[source + 1];
      dib[target + 2] = rgba[source];
      dib[target + 3] = rgba[source + 3];

      if (rgba[source + 3] < 128) {
        const maskOffset = 40 + pixelBytes + y * maskStride + Math.floor(x / 8);
        dib[maskOffset] |= 0x80 >> (x % 8);
      }
    }
  }

  return dib;
}

function writeWindowsIco(image, outputPath) {
  const images = windowsIconSizes.map(size => ({ size, data: renderWindowsDib(image, size) }));
  const directoryBytes = 6 + images.length * 16;
  const header = Buffer.alloc(directoryBytes);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  let imageOffset = directoryBytes;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header[entry + 2] = 0;
    header[entry + 3] = 0;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(imageOffset, entry + 12);
    imageOffset += data.length;
  });

  fs.writeFileSync(outputPath, Buffer.concat([header, ...images.map(item => item.data)]));
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
  // Windows taskbar/title-bar surfaces request several small sizes. Store real
  // 32-bit DIB frames instead of relying on a single scalable 256px entry.
  writeWindowsIco(image, path.join(publicDir, 'icon.ico'));

  console.log(`Generated icons from ${path.relative(root, sourcePath)}`);
})();
