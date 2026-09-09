/**
 * Packs the shaped extension for a GitHub release: release/zoreal-mark-safari-<version>.zip,
 * the version read from the built manifest so the file name and the package
 * never disagree. Run `npm run build` first.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';

if (!existsSync('dist/manifest.json')) { console.error('no dist/manifest.json: run npm run build first'); process.exit(1); }
const { version } = JSON.parse(readFileSync('dist/manifest.json', 'utf8'));
mkdirSync('release', { recursive: true });
const out = `release/zoreal-mark-safari-${version}.zip`;
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', `../${out}`, '.', '-x', '.*', '-x', '*/.*'], { cwd: 'dist', stdio: 'inherit' });
console.log(out);
