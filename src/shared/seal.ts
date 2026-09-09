import { fromBase64Url, toBase64Url, utf8 } from '@zoreal/mark-verify';

/**
 * The order key seals the text the holder will read on the phone. It is
 * generated here, per signature, travels inside the QR frames or the launch
 * link fragment, and is never sent to the record service. AES-256-GCM with a
 * random 96-bit nonce; the sealed form is nonce || ciphertext, base64url.
 */
export function newOrderKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

export async function seal(text: string, key: Uint8Array): Promise<string> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, utf8(text) as BufferSource));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return toBase64Url(out);
}

export async function unseal(sealed: string, key: Uint8Array): Promise<string> {
  const bytes = fromBase64Url(sealed);
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
  const iv = new Uint8Array(bytes.subarray(0, 12));
  const ct = new Uint8Array(bytes.subarray(12));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, k, ct);
  return new TextDecoder().decode(pt);
}
