/**
 * Rasterises the brand mark into the sizes the manifest names, plus the
 * store icon. Needs rsvg-convert (librsvg) on the PATH. The SVG is the
 * master; the PNGs are committed so a build does not need librsvg.
 *
 * The master's viewBox leaves the glyph on about 80% of the canvas, which
 * reads as a small icon in the toolbar. The toolbar rendering crops to the
 * glyph with a 3% margin on each side, so the mark fills the icon space. The
 * viewBox below is the glyph's measured bounds, squared on its centre;
 * remeasure it if the master changes.
 *
 * The Chrome Web Store icon follows the store's guideline instead: a 128 px
 * canvas whose art sits in the middle 96 px with 16 px of transparent
 * padding, so the store can add its own frame. The art is the same tile the
 * ZOREAL ID app icon uses, the mark on the product's dark ink, so the two
 * are recognisably one brand side by side.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const FILLED_VIEWBOX = '7.3 6.1 63.6 63.6';
const INK = '#120C07';
const master = readFileSync('public/icons/zoreal-square.svg', 'utf8');
const filled = master.replace(/viewBox="[^"]*"/, `viewBox="${FILLED_VIEWBOX}"`);
const tmp = 'public/icons/.zoreal-square-filled.svg';
writeFileSync(tmp, filled);
try {
  for (const s of [16, 32, 48, 128]) {
    execFileSync('rsvg-convert', ['-w', String(s), '-h', String(s), tmp, '-o', `public/icons/icon-${s}.png`]);
  }
} finally {
  unlinkSync(tmp);
}

// Store icon: the glyph at two thirds of a 96 px rounded tile, the ratio the
// app icon uses, centred on a 128 px canvas with transparent padding.
const inner = master.replace(/<\?xml[^>]*\?>/, '').replace(/<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const glyph = 62;
const off = 16 + (96 - glyph) / 2;
const store = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
<rect x="16" y="16" width="96" height="96" rx="20" fill="${INK}"/>
<svg x="${off}" y="${off}" width="${glyph}" height="${glyph}" viewBox="${FILLED_VIEWBOX}">${inner}</svg>
</svg>`;
const storeTmp = 'store/.icon-128.svg';
writeFileSync(storeTmp, store);
try {
  execFileSync('rsvg-convert', ['-w', '128', '-h', '128', storeTmp, '-o', 'store/icon-128.png']);
} finally {
  unlinkSync(storeTmp);
}

console.log('icons written');
