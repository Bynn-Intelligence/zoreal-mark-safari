/**
 * Shapes the Vite build for Safari and copies it into the Xcode project.
 *
 * Safari does not run background.scripts as an ES module (the packager warns
 * about the `type` key) and, without an explicit choice, treats the
 * background as persistent, which iOS refuses. So the built manifest is
 * rewritten to a non-persistent background page: an HTML file that loads
 * the module loader CRXJS emitted. The page lives under src/, because the
 * Xcode project references the top-level entries of Resources by name and
 * the folders wholesale; a new top-level file would not ship, a file inside
 * src/ does. options_ui.open_in_tab is dropped because Safari does not know
 * it and the packager warns.
 *
 * The result replaces `Shared (Extension)/Resources` in the Xcode project,
 * which is build output and not committed: run `npm run build:safari` (or
 * `build:safari:local`) before opening the project.
 */
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const manifestPath = 'dist/manifest.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const loader = manifest.background?.scripts?.[0];
if (!loader) { console.error('dist/manifest.json has no background.scripts: build with CRXJS in Firefox mode first'); process.exit(1); }

mkdirSync('dist/src/background', { recursive: true });
writeFileSync('dist/src/background/index.html', `<!doctype html>
<meta charset="utf-8">
<title>ZOREAL Mark background</title>
<script type="module" src="../../${loader}"></script>
`);
manifest.background = { page: 'src/background/index.html', persistent: false };
if (manifest.options_ui) delete manifest.options_ui.open_in_tab;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const resources = 'apple/ZOREAL Mark/Shared (Extension)/Resources';
rmSync(resources, { recursive: true, force: true });
cpSync('dist', resources, { recursive: true });
console.log(`dist shaped for Safari and copied to ${resources}`);
