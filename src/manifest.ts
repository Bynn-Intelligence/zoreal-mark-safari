import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json' with { type: 'json' };

/**
 * Manifest V3 for Safari. No remote code, no remote fonts, no analytics, and
 * the only host the extension talks to is the record service: fetching public
 * records by id without credentials, creating sign orders, and, when the
 * reader opts in, sighting reports. `<all_urls>` for the content script is
 * what "verify a Mark on any page" costs; the script reads text nodes and
 * draws badges and sends nothing about the page anywhere. Safari grants that
 * access per site, or for every site, when the user says so after install.
 *
 * Where Safari differs from Chrome: the background is a non-persistent page
 * under background.scripts, Safari's default environment, and the package
 * ships inside a native app the App Store distributes, so the manifest
 * carries no store-specific block.
 */
export default defineManifest((env) => ({
  manifest_version: 3,
  name: 'ZOREAL Mark',
  short_name: 'ZOREAL Mark',
  // One version, in package.json: `npm version` moves it and the release
  // workflow tags it.
  version: pkg.version,
  description: 'Verify that a real human, verified by ZOREAL, vouched for what you are reading. Sign what you post. Works on any site.',
  icons: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png', 48: 'icons/icon-48.png', 128: 'icons/icon-128.png' },
  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'ZOREAL Mark',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  options_ui: { page: 'src/options/index.html', open_in_tab: true },
  // Safari: a non-persistent background page. The file keeps its name so the
  // code stays the same as the Chrome build's; it is a module either way.
  background: { scripts: ['src/background/service-worker.ts'], type: 'module' },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/content.ts'],
      run_at: 'document_idle',
      // Frames too: a dashboard that embeds its editor in an iframe, a chat
      // widget, a comment box served from another origin. Each frame scans
      // itself and answers for its own boxes; the worker remembers which frame
      // last held the cursor so the popup asks the right one.
      all_frames: true,
    },
  ],
  // No activeTab: the host permission below already lets the popup see the
  // current tab's URL and message its content script, so activeTab would be
  // a grant that adds nothing, and the store rejects those.
  permissions: ['storage', 'contextMenus', 'scripting', 'alarms'],
  // Every page, the same grant the content script above already implies, so
  // that after an extension reload the script can be put back into the tabs
  // that are already open, and so the worker can see a tab's URL when a Mark
  // sits inside a frame on any site. The record service hosts stay listed
  // for the CSP connect-src below.
  host_permissions: ['<all_urls>'],
  web_accessible_resources: [
    { resources: ['fonts/*', 'icons/*'], matches: ['<all_urls>'] },
  ],
  content_security_policy: {
    // A release talks to the record service and nothing else. A development
    // build (`npm run build:safari:local`) names no connect-src, so it can
    // reach a record service on this machine at whatever port the options
    // page says: Safari refuses a plain-http source even when the policy
    // lists it (seen 2026-09-09 with http://localhost listed), so listing
    // localhost, which works in Chrome and Firefox, does nothing here. The
    // scripts stay 'self' either way; nothing remote ever runs.
    extension_pages: `script-src 'self'; object-src 'self';${env.mode === 'production' ? ' connect-src https://mark.zoreal.com https://api.zoreal.com;' : ''} img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'`,
  },
}));
