/**
 * Renders the app icon set for the Mac and iOS app from the brand mark, plus
 * the icon the app's own window shows. Needs rsvg-convert (librsvg) on the
 * PATH; the PNGs are committed so Xcode never needs it.
 *
 * iOS takes one 1024 px square that the system masks itself, so the tile
 * fills the canvas. macOS draws the icon as given, so the tile sits on
 * Apple's grid: an 824 px rounded square centred on a 1024 px canvas with
 * transparent margins, the shape every Mac app icon shares. Both are the
 * tile the ZOREAL ID app icon uses, the mark on the product's dark ink.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const APPICON = 'apple/ZOREAL Mark/Shared (App)/Assets.xcassets/AppIcon.appiconset';
const GLYPH_VIEWBOX = '7.3 6.1 63.6 63.6';
const INK = '#120C07';
const master = readFileSync('public/icons/zoreal-square.svg', 'utf8');
const inner = master.replace(/<\?xml[^>]*\?>/, '').replace(/<svg\b[^>]*>/, '').replace(/<\/svg>\s*$/, '');

function tile({ canvas, size, radius }) {
  const glyph = size * (62 / 96);
  const off = (canvas - size) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${canvas} ${canvas}" width="${canvas}" height="${canvas}">
<rect x="${off}" y="${off}" width="${size}" height="${size}" rx="${radius}" fill="${INK}"/>
<svg x="${off + (size - glyph) / 2}" y="${off + (size - glyph) / 2}" width="${glyph}" height="${glyph}" viewBox="${GLYPH_VIEWBOX}">${inner}</svg>
</svg>`;
}

function render(svg, px, out) {
  const tmp = `${out}.svg`;
  writeFileSync(tmp, svg);
  try { execFileSync('rsvg-convert', ['-w', String(px), '-h', String(px), tmp, '-o', out]); } finally { unlinkSync(tmp); }
}

const ios = tile({ canvas: 1024, size: 1024, radius: 0 });
render(ios, 1024, `${APPICON}/universal-icon-1024@1x.png`);
const mac = tile({ canvas: 1024, size: 824, radius: 185 });
for (const [pt, scale] of [[16, 1], [16, 2], [32, 1], [32, 2], [128, 1], [128, 2], [256, 1], [256, 2], [512, 1], [512, 2]]) {
  render(mac, pt * scale, `${APPICON}/mac-icon-${pt}@${scale}x.png`);
}
// The app window and the store icon field both show the plain tile.
const flat = tile({ canvas: 96, size: 96, radius: 20 });
render(flat, 256, 'apple/ZOREAL Mark/Shared (App)/Assets.xcassets/LargeIcon.imageset/icon-128.png');
render(flat, 256, 'apple/ZOREAL Mark/Shared (App)/Resources/Icon.png');
console.log('app icons written');
