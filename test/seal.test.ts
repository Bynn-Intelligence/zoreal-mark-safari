import { describe, expect, it } from 'vitest';
import { newOrderKey, seal, unseal } from '../src/shared/seal.js';
import { launchLink, qrFrame } from '../src/shared/qr.js';

describe('the order key', () => {
  it('seals the text so only the key holder reads it', async () => {
    const key = newOrderKey();
    const sealed = await seal('I was at the launch.', key);
    expect(await unseal(sealed, key)).toBe('I was at the launch.');
    await expect(unseal(sealed, newOrderKey())).rejects.toThrow();
    expect(await seal('x', key)).not.toBe(await seal('x', key)); // a fresh nonce every time
  });

  it('never puts the key anywhere but the fragment of the QR frame and the launch link', async () => {
    const key = newOrderKey();
    const created = Date.now() - 2500;
    const frame = new URL(await qrFrame('TOKEN', 'SECRET', created, key));
    expect(frame.origin + frame.pathname).toBe('https://id.zoreal.com/sign');
    const [prefix, token, time, mac] = frame.searchParams.get('q')!.split('.');
    expect(prefix).toBe('zoreal');
    expect(token).toBe('TOKEN');
    expect(time).toBe('2');
    expect(mac).toMatch(/^[0-9a-f]{64}$/);
    const k = frame.hash.slice('#k='.length);
    expect(k).toHaveLength(43);
    expect(frame.search).not.toContain(k);
    const link = new URL(launchLink('ORDER', 'START', key));
    expect(link.origin + link.pathname).toBe('https://id.zoreal.com/sign');
    expect(link.hash).toBe(`#k=${k}`);
    expect(link.search).not.toContain(k);
  });

  it('changes the frame every second under the same secret', async () => {
    const key = newOrderKey();
    const a = new URL(await qrFrame('T', 'S', 0, key, 1000)).searchParams.get('q')!;
    const b = new URL(await qrFrame('T', 'S', 0, key, 2000)).searchParams.get('q')!;
    expect(a).not.toBe(b);
    expect(a.split('.')[3]).not.toBe(b.split('.')[3]);
  });
});
