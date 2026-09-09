import type { VerifyResult } from '@zoreal/mark-verify';

/** What the background returns for one Mark: the verifier's result without the record. */
export type MarkSummary = Omit<VerifyResult, 'record'> & {
  id: string;
  marker: 'signed' | 'delegated';
  /** The text between the markers, as found on the page. */
  text?: string;
  /** Where on the page: the frame and the occurrence number the content script gave the badge. */
  where?: { frameId: number; ordinal: number };
};

export interface TabState {
  url: string;
  marks: MarkSummary[];
  /** A page-level Mark from a `zoreal-mark` meta tag, when the page carries one. */
  page?: MarkSummary;
  updatedAt: number;
}

export interface OrderCreated {
  order: string;
  qr_token: string;
  qr_secret: string;
  start_token: string;
  expires_in: number;
}

export type OrderStatus =
  | { status: 'pending'; hint?: string }
  | { status: 'complete'; id: string }
  | { status: 'declined' | 'expired' | 'throttled' }
  | { status: 'failed'; reason: string };

export interface Settings {
  /** The API origin: sign orders and sightings. */
  baseUrl: string;
  /** Where a record is fetched: `<recordBase>/<id>`. The record host has its own name so record checks can be balanced and cached apart from the API. */
  recordBase: string;
  /** Where the API is mounted on that origin: `/v1` in production, `/api/v1` on a local Rails. */
  apiPrefix: string;
  /** Sighting reports on "Verified for another page". Off by default. */
  sightings: boolean;
}

export type Request =
  | { type: 'verify'; pageUrl: string; marks: { marker: 'signed' | 'delegated'; text: string; id: string; ordinal: number }[] }
  | { type: 'verifyPage'; pageUrl: string; id: string; text: string }
  | { type: 'tabState'; tabId?: number }
  | { type: 'openPopupForSigning' }
  | { type: 'ensureContent'; tabId: number }
  | { type: 'editableFocused' }
  | { type: 'signFrame'; tabId: number }
  | { type: 'createOrder'; body: Record<string, unknown> }
  | { type: 'pollOrder'; order: string }
  | { type: 'getSettings' }
  | { type: 'saveSettings'; settings: Settings }
  | { type: 'clearCache' };

export type ContentRequest =
  | { type: 'ping' }
  | { type: 'getSignTarget' }
  | { type: 'insertMark'; id: string; marker: 'signed' | 'delegated' }
  | { type: 'revealMark'; ordinal: number }
  | { type: 'rescan' };

export interface SignTarget {
  found: boolean;
  text: string;
  pageUrl: string;
  /** True when the box came from the community site list rather than focus. */
  listed: boolean;
  kind: 'textarea' | 'input' | 'contenteditable' | 'none';
  /** Set by the popup: the frame that answered, so the Mark is inserted into the same one. */
  frameId?: number;
}
