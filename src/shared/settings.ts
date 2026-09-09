import type { Settings } from './messages.js';

// A development build (`npm run build:local`, `npm run dev`) starts pointed at
// the mock record server on this machine, so a build loaded into Safari
// verifies the fixtures with nothing typed into the options page; a release
// build starts at the record service and its CSP admits nothing else.
const LOCAL = import.meta.env.MODE !== 'production';

export const DEFAULT_SETTINGS: Settings = {
  // The API origin: orders are created and polled here.
  baseUrl: LOCAL ? 'http://localhost:4820' : 'https://api.zoreal.com',
  apiPrefix: '/v1',
  // The record host. A record is https://mark.zoreal.com/<id>, the same URL a
  // person opens. Its own name, so record checks can be balanced and cached
  // apart from the API. A local setup uses http://localhost:<port>/mark.
  recordBase: LOCAL ? 'http://localhost:4820/mark' : 'https://mark.zoreal.com',
  sightings: false,
};

export async function loadSettings(): Promise<Settings> {
  const got = await chrome.storage.local.get('settings');
  const s = (got.settings ?? {}) as Partial<Settings>;
  const merged = { ...DEFAULT_SETTINGS, ...s, apiPrefix: normalisePrefix(s.apiPrefix ?? DEFAULT_SETTINGS.apiPrefix) };
  // Settings saved before the record host existed: a local API origin
  // served its records at /mark, and still does.
  if (!s.recordBase && s.baseUrl && isLocalDev(s.baseUrl)) merged.recordBase = `${s.baseUrl.replace(/\/$/, '')}/mark`;
  merged.recordBase = merged.recordBase.replace(/\/+$/, '');
  return merged;
}

/** "/v1" or "/api/v1": a leading slash, no trailing one. */
export function normalisePrefix(p: string): string {
  const t = p.trim().replace(/\/+$/, '');
  return t.startsWith('/') ? t : `/${t}`;
}

export async function saveSettings(s: Settings): Promise<void> {
  await chrome.storage.local.set({ settings: s });
}

/** Local development against the mock record server, and nothing else. */
export function isLocalDev(baseUrl: string): boolean {
  try {
    const u = new URL(baseUrl);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
