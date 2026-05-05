import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'fs';

const outdir = 'dist';

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
