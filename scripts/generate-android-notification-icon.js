const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const projectRoot = path.resolve(__dirname, '..');
const sourcePath = path.join(projectRoot, 'assets', 'icon-light.png');
const targetPath = path.join(projectRoot, 'assets', 'images', 'android-icon-monochrome.png');
const notificationAssetPath = path.join(projectRoot, 'assets', 'images', 'notification-android.png');
const notificationTargets = [
  ['drawable-mdpi', 24],
  ['drawable-hdpi', 36],
  ['drawable-xhdpi', 48],
  ['drawable-xxhdpi', 72],
  ['drawable-xxxhdpi', 96],
].map(([density, size]) => ({
  size,
  path: path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', density, 'notification_icon.png'),
}));

const src = PNG.sync.read(fs.readFileSync(sourcePath));
const outSize = 192;
const paddingRatio = 0.16;
const padding = Math.round(outSize * paddingRatio);
const drawableSize = outSize - padding * 2;

const mask = [];
let minX = src.width;
let minY = src.height;
let maxX = -1;
let maxY = -1;

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

for (let y = 0; y < src.height; y += 1) {
  for (let x = 0; x < src.width; x += 1) {
    const idx = (src.width * y + x) << 2;
    const alpha = src.data[idx + 3] / 255;
    const lum = luminance(src.data[idx], src.data[idx + 1], src.data[idx + 2]);
    const isGlyph = alpha > 0.05 && lum < 235;
    mask.push(isGlyph ? 1 : 0);
    if (isGlyph) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
}

if (maxX < 0 || maxY < 0) {
  throw new Error('No drawable glyph detected in source icon.');
}

const glyphWidth = maxX - minX + 1;
const glyphHeight = maxY - minY + 1;
const scale = Math.min(drawableSize / glyphWidth, drawableSize / glyphHeight);
const scaledWidth = glyphWidth * scale;
const scaledHeight = glyphHeight * scale;
const offsetX = (outSize - scaledWidth) / 2;
const offsetY = (outSize - scaledHeight) / 2;

const out = new PNG({ width: outSize, height: outSize });

for (let y = 0; y < outSize; y += 1) {
  for (let x = 0; x < outSize; x += 1) {
    const sourceX = minX + (x - offsetX) / scale;
    const sourceY = minY + (y - offsetY) / scale;

    const sx = Math.max(0, Math.min(src.width - 1, Math.round(sourceX)));
    const sy = Math.max(0, Math.min(src.height - 1, Math.round(sourceY)));
    const sample = mask[sy * src.width + sx];

    const idx = (out.width * y + x) << 2;
    out.data[idx] = 255;
    out.data[idx + 1] = 255;
    out.data[idx + 2] = 255;
    out.data[idx + 3] = sample ? 255 : 0;
  }
}

fs.writeFileSync(targetPath, PNG.sync.write(out));
console.log(`Generated ${path.relative(projectRoot, targetPath)} from ${path.relative(projectRoot, sourcePath)}`);

function fillRect(image, scale, x, y, width, height) {
  const left = Math.round(x * scale);
  const top = Math.round(y * scale);
  const right = Math.round((x + width) * scale);
  const bottom = Math.round((y + height) * scale);

  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) {
        continue;
      }

      const idx = (image.width * py + px) << 2;
      image.data[idx] = 255;
      image.data[idx + 1] = 255;
      image.data[idx + 2] = 255;
      image.data[idx + 3] = 255;
    }
  }
}

function clearRect(image, scale, x, y, width, height) {
  const left = Math.round(x * scale);
  const top = Math.round(y * scale);
  const right = Math.round((x + width) * scale);
  const bottom = Math.round((y + height) * scale);

  for (let py = top; py < bottom; py += 1) {
    for (let px = left; px < right; px += 1) {
      if (px < 0 || py < 0 || px >= image.width || py >= image.height) {
        continue;
      }

      const idx = (image.width * py + px) << 2;
      image.data[idx + 3] = 0;
    }
  }
}

function drawNotificationIcon(size) {
  const image = new PNG({ width: size, height: size });
  const scale = size / 24;

  // Android notification icons are masks. Keep this as a bold storefront silhouette,
  // not the SalonPro wordmark, so it remains legible in the tiny status bar.
  fillRect(image, scale, 5, 5, 14, 2);
  fillRect(image, scale, 4, 7, 16, 2);
  fillRect(image, scale, 4, 9, 3, 3);
  fillRect(image, scale, 8, 9, 3, 3);
  fillRect(image, scale, 13, 9, 3, 3);
  fillRect(image, scale, 17, 9, 3, 3);
  fillRect(image, scale, 5, 12, 14, 8);
  clearRect(image, scale, 8, 14, 3, 4);
  clearRect(image, scale, 13, 14, 3, 4);
  fillRect(image, scale, 4, 20, 16, 1);

  return image;
}

notificationTargets.forEach((target) => {
  fs.mkdirSync(path.dirname(target.path), { recursive: true });
  fs.writeFileSync(target.path, PNG.sync.write(drawNotificationIcon(target.size)));
  console.log(`Generated ${path.relative(projectRoot, target.path)}`);
});
fs.writeFileSync(notificationAssetPath, PNG.sync.write(drawNotificationIcon(96)));
console.log(`Generated ${path.relative(projectRoot, notificationAssetPath)}`);
