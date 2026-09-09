import { PRODUCTION_ANCHORS } from '@zoreal/mark-verify';
import type { Settings } from '../shared/messages.js';

const send = <T,>(msg: unknown): Promise<T> => chrome.runtime.sendMessage(msg) as Promise<T>;
const baseUrl = document.getElementById('baseUrl') as HTMLInputElement;
const recordBase = document.getElementById('recordBase') as HTMLInputElement;
const apiPrefix = document.getElementById('apiPrefix') as HTMLInputElement;
const sightings = document.getElementById('sightings') as HTMLInputElement;
const status = document.getElementById('status')!;

document.getElementById('pins')!.textContent = [
  `ZOREAL Root CA 1 (ECDSA P-384): ${PRODUCTION_ANCHORS.classical[0]}`,
  `ZOREAL Post-Quantum Root CA 1 (ML-DSA-87): ${PRODUCTION_ANCHORS.postQuantum[0]}`,
  `Timestamping (DigiCert Trusted Root G4): ${PRODUCTION_ANCHORS.timestamping[0]}`,
].join('\n');

const s = await send<Settings>({ type: 'getSettings' });
baseUrl.value = s.baseUrl;
recordBase.value = s.recordBase;
apiPrefix.value = s.apiPrefix;
sightings.checked = s.sightings;

document.getElementById('save')!.addEventListener('click', async () => {
  let origin: string;
  try {
    const u = new URL(baseUrl.value.trim());
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') throw new Error('the record service must be https');
    origin = u.origin;
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : 'not a URL';
    return;
  }
  let records: string;
  try {
    const r = new URL(recordBase.value.trim());
    if (r.protocol !== 'https:' && r.hostname !== 'localhost' && r.hostname !== '127.0.0.1') throw new Error('the record host must be https');
    records = r.href.replace(/\/+$/, '');
  } catch (e) {
    status.textContent = e instanceof Error ? e.message : 'the record host is not a URL';
    return;
  }
  await send({ type: 'saveSettings', settings: { baseUrl: origin, apiPrefix: apiPrefix.value.trim() || '/v1', recordBase: records, sightings: sightings.checked } });
  baseUrl.value = origin;
  recordBase.value = records;
  status.textContent = 'Saved';
  status.className = 'note ok';
});

document.getElementById('clear')!.addEventListener('click', async () => {
  await send({ type: 'clearCache' });
  status.textContent = 'Cache cleared';
  status.className = 'note ok';
});
