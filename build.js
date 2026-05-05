import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, readFileSync, readdirSync, statSync, createWriteStream } from 'fs';
import { join, relative } from 'path';
import { createDeflateRaw } from 'zlib';

const outdir = 'dist';
const shouldPackage = process.argv.includes('--package');

// Clean dist
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

// JS files to minify (keep as separate modules for Chrome extension)
const entryPoints = [
  'content.js',
  'background.js',
  'popup.js',
  'sidebar.js',
  'utils/dom-utils.js',
  'utils/logger.js',
  'utils/i18n.js',
  'utils/text-reader.js',
  'utils/keyboard-nav.js',
  'utils/visual-nav.js',
  'utils/a11y-checker.js'
];

await esbuild.build({
  entryPoints,
  outdir,
  format: 'esm',
  minify: true,
  target: ['chrome110'],
  bundle: false
});

// Copy static assets
cpSync('manifest.json', `${outdir}/manifest.json`);
cpSync('popup.html', `${outdir}/popup.html`);
cpSync('popup.css', `${outdir}/popup.css`);
cpSync('sidebar.html', `${outdir}/sidebar.html`);
cpSync('sidebar.css', `${outdir}/sidebar.css`);
cpSync('icons', `${outdir}/icons`, { recursive: true });

console.log('Build complete → dist/');

if (shouldPackage) {
  const manifest = JSON.parse(readFileSync(`${outdir}/manifest.json`, 'utf-8'));
  const zipName = `a11ygo-v${manifest.version}.zip`;

  function collectFiles(dir) {
    const files = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        files.push(...collectFiles(full));
      } else {
        files.push(full);
      }
    }
    return files;
  }

  function deflateBuffer(buf) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      const deflater = createDeflateRaw();
      deflater.on('data', c => chunks.push(c));
      deflater.on('end', () => resolve(Buffer.concat(chunks)));
      deflater.on('error', reject);
      deflater.end(buf);
    });
  }

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  const files = collectFiles(outdir);
  const out = createWriteStream(zipName);
  const centralHeaders = [];
  let offset = 0;

  for (const filePath of files) {
    const name = relative(outdir, filePath).replace(/\\/g, '/');
    const raw = readFileSync(filePath);
    const compressed = await deflateBuffer(raw);
    const crc = crc32(raw);
    const nameBuffer = Buffer.from(name, 'utf-8');

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(raw.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    out.write(localHeader);
    out.write(nameBuffer);
    out.write(compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralHeaders.push({ header: central, name: nameBuffer });

    offset += 30 + nameBuffer.length + compressed.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const { header, name } of centralHeaders) {
    out.write(header);
    out.write(name);
    centralSize += 46 + name.length;
  }

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(centralHeaders.length, 8);
  endRecord.writeUInt16LE(centralHeaders.length, 10);
  endRecord.writeUInt32LE(centralSize, 12);
  endRecord.writeUInt32LE(centralStart, 16);
  endRecord.writeUInt16LE(0, 20);
  out.write(endRecord);
  out.end();

  await new Promise(resolve => out.on('finish', resolve));
  console.log(`Package complete → ${zipName}`);
}
