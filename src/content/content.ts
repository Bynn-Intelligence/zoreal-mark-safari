import { isValidId, siteOf, wrap, type FoundMark } from '@zoreal/mark-verify';
import type { ContentRequest, MarkSummary, SignTarget } from '../shared/messages.js';
import { icon, subjectLine, verdictView } from '../ui/verdict.js';
import { BADGE_CSS, CARD_LAYER_CSS, SIGN_CONTROL_CSS } from './styles.js';
import sites from '../../sites.json' with { type: 'json' };

/**
 * The content script. It finds Marks in the page's text, asks the background
 * to verify them, and draws a badge and a hover card beside each in a closed
 * shadow root. It never verifies anything itself and never trusts anything the
 * page says about a record. It also places the sign control beside the boxes
 * the community site list names, and answers the popup's requests for the
 * focused text box and for inserting the finished Mark.
 */

const CLOSE = '::ZOREAL-SIGNATURE:';

/**
 * True once the extension that injected this script has been reloaded or
 * removed. The page keeps running the old script, whose runtime is gone;
 * every call into it throws "Extension context invalidated". A retired
 * script stops scanning and answers nothing, and the fresh script the reload
 * injected takes over.
 */
let retired = false;

/** A message to the worker that cannot throw when the extension is gone. */
function send<T = unknown>(msg: unknown): Promise<T | null> {
  if (retired || !chrome.runtime?.id) { retire(); return Promise.resolve(null); }
  try {
    return (chrome.runtime.sendMessage(msg) as Promise<T>).catch((e: unknown) => { if (isInvalidated(e)) retire(); return null; });
  } catch (e) {
    if (isInvalidated(e)) retire();
    return Promise.resolve(null);
  }
}

function isInvalidated(e: unknown): boolean {
  return String((e as { message?: unknown })?.message ?? e).includes('context invalidated');
}

function retire(): void {
  if (retired) return;
  retired = true;
  document.documentElement.removeAttribute('data-zoreal-mark-script');
  (globalThis as unknown as { __zorealMarkAlive?: boolean }).__zorealMarkAlive = false;
  log('retired: the extension was reloaded or removed; this copy of the script stops here');
  try { observer.disconnect(); } catch { /* not created yet */ }
}
const processed = new WeakSet<Node>();
const log = (...args: unknown[]): void => console.debug('[ZOREAL Mark]', ...args);
/** Each badge's closing-marker text node, so a badge a framework removed can be put back after it. */
const closerOfHost = new Map<HTMLElement, Text>();
type Render = (m: MarkSummary | null, error?: string) => void;
const renders: Render[] = [];

const OPEN_RE = /::ZOREAL-(MARK|DELEGATED)::/;
/** How far up, and how much text, the scanner will take in to pair a closing marker with its opening one. */
const CLIMB_LIMIT = 8;
const CLIMB_TEXT_LIMIT = 40_000;

function isBlock(el: HTMLElement): boolean {
  const d = getComputedStyle(el).display;
  return d === 'block' || d === 'list-item' || d === 'table-cell' || d === 'flex' || d === 'grid' || /^(P|DIV|LI|TD|ARTICLE|SECTION|BLOCKQUOTE|DD|DT|H[1-6])$/.test(el.tagName);
}

/**
 * The element whose text holds the whole Mark.
 *
 * A Mark posted over several lines lands as several paragraphs on most
 * platforms: the opening marker in one, the text in the next, the closing
 * marker in a third. The nearest block around the closing marker then holds
 * no opening marker, so the climb continues, block by block, until one does.
 * Bounded, so a closing marker with no opening anywhere near it stops at a
 * container the size of a post rather than at the page.
 */
function blockOf(node: Node): HTMLElement {
  let el: HTMLElement | null = node.parentElement;
  let block: HTMLElement | null = null;
  let climbed = 0;
  while (el && el !== document.body) {
    if (isBlock(el)) {
      block ??= el;
      const text = el.innerText ?? el.textContent ?? '';
      // A verified Mark's opening marker is hidden, and hidden text is not in
      // innerText: without the second test the climb would run past the post
      // and stop at whatever container holds another post's visible marker.
      if (OPEN_RE.test(text) || el.querySelector('[data-zoreal-marker="open"]')) return el;
      if (++climbed >= CLIMB_LIMIT || text.length > CLIMB_TEXT_LIMIT) break;
    }
    el = el.parentElement;
  }
  return block ?? document.body;
}

function editable(el: Element | null): boolean {
  return !!el && (el.closest('textarea, input, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]') !== null);
}

/** Badges from an earlier copy of this script that this copy found and left in place. */
let adopted = 0;

/** Text nodes carrying the closing marker, outside our own hosts and outside editors. */
function candidateNodes(root: Node): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || processed.has(n)) return NodeFilter.FILTER_REJECT;
      if (p.closest('script, style, noscript, textarea, [data-zoreal-mark-host], [data-zoreal-marker]')) return NodeFilter.FILTER_REJECT;
      if (editable(p)) return NodeFilter.FILTER_REJECT;
      // A closing marker that already wears a badge belongs to an earlier
      // copy of this script (the extension was reloaded, or the worker put
      // the script back). Its badge stays; this copy leaves it alone.
      const next = n.nextSibling;
      if (next instanceof Element && next.hasAttribute('data-zoreal-mark-host')) { adopted++; processed.add(n); return NodeFilter.FILTER_REJECT; }
      return n.nodeValue && n.nodeValue.includes(CLOSE) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let n: Node | null;
  while ((n = walker.nextNode())) out.push(n as Text);
  return out;
}

/** Every badge placed in this frame gets a number, so the popup can point back at it. */
let nextOrdinal = 0;
const hostsByOrdinal = new Map<number, HTMLElement>();
/** The element a page-level Mark covers, for the same purpose; ordinal -1. */
let pageMarkElement: HTMLElement | null = null;

/**
 * The Mark whose closing marker sits in `closer`: the id from that marker, and
 * the text back to the NEAREST opening marker before it, in the smallest block
 * that holds both.
 *
 * Pairing is done from the closing marker backwards, one Mark at a time, and
 * never by listing every Mark in a container and matching by position. A page
 * that mentions a marker in passing (a README explaining the format, a table
 * of verdicts) would otherwise lend its stray opening marker to the next real
 * Mark below it, and a container with several Marks would hand each closing
 * marker some other Mark's text. Both happened on this repository's own page.
 */
function markFor(closer: Text): { mark: FoundMark } | { broken: 'bad_id' } | null {
  let el: HTMLElement | null = closer.parentElement;
  let climbed = 0;
  while (el && el !== document.body) {
    if (isBlock(el)) {
      const text = el.innerText ?? el.textContent ?? '';
      // Our closing marker is the n-th visible one in this block.
      const n = candidateClosers(el).indexOf(closer);
      const closeRe = /::ZOREAL-SIGNATURE:([0-9A-Za-z]{1,64})::/g;
      let close: RegExpExecArray | null = null;
      for (let i = 0; i <= n; i++) { close = closeRe.exec(text); if (!close) break; }
      if (n >= 0 && close) {
        const openRe = /::ZOREAL-(MARK|DELEGATED)::/g;
        let open: RegExpExecArray | null = null;
        let m: RegExpExecArray | null;
        while ((m = openRe.exec(text)) && m.index < close.index) open = m;
        if (open) {
          const id = close[1]!;
          if (!isValidId(id)) return { broken: 'bad_id' };
          return { mark: { marker: open[1] === 'DELEGATED' ? 'delegated' : 'signed', text: text.slice(open.index + open[0].length, close.index).trim(), id, start: open.index, end: close.index + close[0].length } };
        }
      }
      if (++climbed >= CLIMB_LIMIT || text.length > CLIMB_TEXT_LIMIT) break;
    }
    el = el.parentElement;
  }
  return null;
}

function scan(root: Node = document.body): void {
  const found: { mark: FoundMark; node: Text }[] = [];
  for (const node of candidateNodes(root)) {
    processed.add(node);
    const r = markFor(node);
    if (!r) continue;
    if ('broken' in r) { placeBrokenBadge(node, r.broken); continue; }
    found.push({ mark: r.mark, node });
  }
  log('scan', root === document.body ? 'document' : (root as Element).tagName ?? root.nodeName, 'found', found.length, 'mark(s)', adopted ? `(${adopted} already badged by an earlier copy, left alone)` : '');
  adopted = 0;
  if (found.length === 0) return;
  // One badge per occurrence, and results come back in the order sent: the
  // same id can appear several times on a page with different text around it
  // (a quote, an altered copy), and each occurrence gets its own verdict.
  const ordinals = found.map(() => nextOrdinal++);
  const slots = found.map((f, i) => placeBadge(f.node, f.mark, ordinals[i]!));
  void send<{ results?: MarkSummary[]; error?: string }>({ type: 'verify', pageUrl: location.href, marks: found.map((f, i) => ({ marker: f.mark.marker, text: f.mark.text, id: f.mark.id, ordinal: ordinals[i]! })) })
    .then((res) => {
      if (!res || !res.results) { for (const r of slots) r(null, res?.error); return; }
      res.results.forEach((r, i) => slots[i]?.(r));
    })
    .catch((e: unknown) => { for (const r of slots) r(null, e instanceof Error ? e.message : 'the extension could not verify'); });
}

/**
 * The one hover card on the page, in a layer at the document root, fixed
 * from the badge it belongs to. Each badge keeps its own card CONTENT; the
 * layer shows a copy of it while the pointer is on the badge or the card, or
 * while the badge is pinned by a click. Scroll and resize move it with the
 * badge; Escape and a click elsewhere close it.
 */
const cardLayer = (() => {
  let host: HTMLElement | null = null;
  let card: HTMLDivElement | null = null;
  let owner: HTMLElement | null = null;
  let pinned = false;
  let hideTimer: number | undefined;

  function ensure(): HTMLDivElement {
    if (card && host?.isConnected) return card;
    host = document.createElement('div');
    host.setAttribute('data-zoreal-mark-host', 'card');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CARD_LAYER_CSS;
    card = document.createElement('div');
    card.className = 'card';
    card.addEventListener('mouseenter', () => { if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; } });
    card.addEventListener('mouseleave', () => { if (!pinned) hideSoon(); });
    shadow.append(style, card);
    document.documentElement.append(host);
    window.addEventListener('scroll', () => { if (owner) place(); }, { passive: true, capture: true });
    window.addEventListener('resize', () => { if (owner) place(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(true); });
    document.addEventListener('click', (e) => { if (owner && !e.composedPath().includes(owner) && !e.composedPath().includes(host!)) hide(true); });
    return card;
  }

  function place(): void {
    if (!owner || !card) return;
    if (!owner.isConnected) { hide(true); return; }
    const rect = owner.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth * 0.9);
    const height = card.offsetHeight || 200;
    const gap = 6;
    const right = rect.left + width > window.innerWidth - 8;
    const above = rect.bottom + gap + height > window.innerHeight - 8 && rect.top - gap - height > 8;
    const left = right ? Math.max(8, rect.right - width) : Math.max(8, rect.left);
    const top = above ? rect.top - gap - height : rect.bottom + gap;
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
    card.style.width = `${Math.round(width)}px`;
    card.classList.toggle('right', right);
    card.classList.toggle('above', above);
  }

  function show(badge: HTMLElement, html: string): void {
    const c = ensure();
    if (hideTimer !== undefined) { clearTimeout(hideTimer); hideTimer = undefined; }
    if (owner !== badge) pinned = false;
    owner = badge;
    c.innerHTML = html;
    c.classList.remove('shown');
    place();
    // Two frames: one to lay the new content out, one to start the transition.
    requestAnimationFrame(() => { place(); c.classList.add('shown'); });
  }

  function hideSoon(): void {
    if (hideTimer !== undefined) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => hide(false), 160);
  }

  function hide(force: boolean): void {
    if (pinned && !force) return;
    pinned = false;
    owner = null;
    card?.classList.remove('shown');
  }

  /** Wires a badge to the layer. `content` is read at show time, so a verdict that lands later is what the card shows. */
  function attach(badge: HTMLElement, content: () => string): void {
    badge.addEventListener('mouseenter', () => show(badge, content()));
    badge.addEventListener('mouseleave', () => { if (!pinned) hideSoon(); });
    badge.addEventListener('focus', () => show(badge, content()));
    badge.addEventListener('blur', () => { if (!pinned) hideSoon(); });
    const toggle = () => {
      if (owner === badge && pinned) { hide(true); return; }
      show(badge, content());
      pinned = true;
    };
    badge.addEventListener('click', toggle);
    badge.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }

  /** The content of the card now showing for `badge` is refreshed, when a verdict lands while it is open. */
  function refresh(badge: HTMLElement, html: string): void {
    if (owner === badge && card) { card.innerHTML = html; place(); }
  }

  return { attach, refresh };
})();

/** An opening marker that never became a Mark gets a neutral badge: no signature found. */
function placeBrokenBadge(node: Text, reason: 'no_closing_marker' | 'bad_id'): void {
  const host = document.createElement('span');
  host.setAttribute('data-zoreal-mark-host', 'broken');
  host.setAttribute('data-zoreal-verdict', 'no_signature');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = BADGE_CSS;
  const badge = document.createElement('span');
  badge.className = 'badge neutral';
  badge.innerHTML = `${icon('shield-alert')}<span>No signature found</span>`;
  badge.tabIndex = 0;
  const cardHtml = `<div class="verdict neutral">${icon('shield-alert')}<span>No signature found</span></div><div class="note">${reason === 'bad_id' ? 'The id after the signature marker is not 24 Crockford base32 characters.' : 'The opening marker has no closing marker after it. A platform that truncates long posts cuts the signature first.'}</div>`;
  shadow.append(style, badge);
  cardLayer.attach(badge, () => cardHtml);
  node.parentNode?.insertBefore(host, node.nextSibling);
}

/** The visible closing-marker text nodes in a block, in document order: the same set innerText shows. */
function candidateClosers(block: HTMLElement): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (!n.nodeValue?.includes(CLOSE)) continue;
    const p = n.parentElement;
    if (p?.closest('[data-zoreal-marker], [data-zoreal-mark-host], script, style, noscript')) continue;
    out.push(n as Text);
  }
  return out;
}

/**
 * A verified post reads as the words and the badge, not the words wrapped in
 * markers. The two marker strings are moved into hidden spans (the text is
 * still in the DOM for copying and for a re-scan, which skips them), and a
 * paragraph left holding nothing but a hidden marker is hidden with it.
 * Anything short of a strong verdict keeps its markers on screen: a Mark that
 * did not verify should look exactly like what it is.
 */
function hideMarkers(closingMarker: Text, host: HTMLElement): void {
  const block = blockOf(host);
  const opening = openingMarkerBefore(block, closingMarker);
  for (const marker of [opening, closingMarker]) {
    if (!marker || !marker.isConnected) continue;
    const span = document.createElement('span');
    span.setAttribute('data-zoreal-marker', marker === opening ? 'open' : 'close');
    span.style.display = 'none';
    marker.parentNode?.insertBefore(span, marker);
    span.append(marker);
    const paragraph = span.parentElement?.closest('p, li, div, blockquote, dd, dt, h1, h2, h3, h4, h5, h6') as HTMLElement | null;
    const only = (paragraph?.textContent ?? '').replace(/\s|\u00a0/g, '') === (marker.nodeValue ?? '').replace(/\s/g, '');
    if (paragraph && paragraph !== block && !paragraph.querySelector('[data-zoreal-mark-host]') && only) {
      paragraph.setAttribute('data-zoreal-hidden-marker', '');
      paragraph.style.display = 'none';
    }
  }
}

/** The last opening marker in document order before `closer`, cut into its own text node. */
function openingMarkerBefore(block: HTMLElement, closer: Text): Text | null {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let found: Text | null = null;
  let n: Node | null;
  while ((n = walker.nextNode())) {
    if (n === closer) break;
    const t = n as Text;
    if (t.parentElement?.closest('[data-zoreal-marker]')) continue;
    const re = /::ZOREAL-(MARK|DELEGATED)::/g;
    let m: RegExpExecArray | null;
    let last: RegExpExecArray | null = null;
    while ((m = re.exec(t.nodeValue ?? ''))) last = m;
    if (last) found = t;
  }
  if (!found) return null;
  const re = /::ZOREAL-(MARK|DELEGATED)::/g;
  let m: RegExpExecArray | null;
  let last: RegExpExecArray | null = null;
  while ((m = re.exec(found.nodeValue ?? ''))) last = m;
  if (!last) return null;
  const marker = found.splitText(last.index);
  marker.splitText(last[0].length);
  return marker;
}

function placeBadge(node: Text, mark: FoundMark, ordinal: number): Render {
  const value = node.nodeValue ?? '';
  const at = value.indexOf(CLOSE);
  const endRe = /::ZOREAL-SIGNATURE:[0-9A-Za-z]{1,64}::/g;
  endRe.lastIndex = at;
  const m = endRe.exec(value);
  const splitAt = m ? m.index + m[0].length : value.length;
  const after = node.splitText(splitAt);
  // The closing marker is now the tail of `node`, from `m.index`: cut it into
  // its own text node so it can be hidden once the verdict is strong.
  const closingMarker = m ? node.splitText(m.index) : null;
  // The cut-off marker is a new text node carrying the closing marker, and
  // the observer rescans after every badge is placed: unmarked, it would be
  // found again, cut again, and badged again without end.
  if (closingMarker) processed.add(closingMarker);
  const host = document.createElement('span');
  host.setAttribute('data-zoreal-mark-host', mark.id);
  closerOfHost.set(host, closingMarker ?? node);
  host.setAttribute('data-zoreal-ordinal', String(ordinal));
  hostsByOrdinal.set(ordinal, host);
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = BADGE_CSS;
  const badge = document.createElement('span');
  badge.className = 'badge checking';
  badge.setAttribute('role', 'status');
  badge.tabIndex = 0;
  badge.innerHTML = `${icon('loader-circle')}<span>Checking</span>`;
  // The card's content lives here; the card itself is drawn by the layer at
  // the document root, so no ancestor of this post can clip or cover it.
  let cardContent = `<div class="verdict neutral">${icon('loader-circle')}<span>Checking with ZOREAL</span></div><div class="note">Fetching the public record and verifying it against the pinned roots.</div>`;
  shadow.append(style, badge);
  cardLayer.attach(badge, () => cardContent);
  after.parentNode?.insertBefore(host, after);
  const render = (r: MarkSummary | null, error?: string): void => {
    // The verdict is also written on the host as data, for assistive tools and
    // tests. A page can read it; a page could never forge the toolbar, which
    // is why the toolbar and not this attribute is the reader's own check.
    host.setAttribute('data-zoreal-verdict', r ? r.verdict : 'cannot_verify_now');
    if (r?.reason) host.setAttribute('data-zoreal-reason', r.reason); else host.removeAttribute('data-zoreal-reason');
    if (!r) {
      badge.className = 'badge neutral';
      badge.innerHTML = `${icon('clock')}<span>Cannot verify now</span>`;
      cardContent = `<div class="verdict neutral">${icon('clock')}<span>Cannot verify now</span></div><div class="note">${esc(error ?? 'The record could not be fetched. This is not a failed check.')}</div>`;
      cardLayer.refresh(badge, cardContent);
      return;
    }
    const v = verdictView(r);
    badge.className = `badge ${v.style}`;
    badge.innerHTML = `${icon(v.icon)}<span>${esc(v.label)}</span>`;
    cardContent = cardHtml(r);
    cardLayer.refresh(badge, cardContent);
    if (v.style === 'strong' && closingMarker) hideMarkers(closingMarker, host);
  };
  renders.push(render);
  return render;
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function cardHtml(r: MarkSummary): string {
  const v = verdictView(r);
  const rows: string[] = [];
  rows.push(`<div class="verdict ${v.style}">${icon(v.icon)}<span>${esc(v.label)}</span></div>`);
  if (v.detail) rows.push(`<div class="note">${esc(v.detail)}</div>`);
  if (r.verdict !== 'not_verified' && r.verdict !== 'no_signature' && r.verdict !== 'cannot_verify_now') {
    rows.push(`<div class="hairline"></div>`);
    rows.push(`<div class="row"><b>Vouched for by</b> ${esc(subjectLine(r))}</div>`);
    if (r.grade) rows.push(`<div class="row"><b>Presence</b> ${esc(r.grade === 'delegated' ? 'delegated' : r.grade === 'live' ? 'live, a fresh liveness check' : 'recent, within fifteen minutes of a liveness check')}</div>`);
    if (r.time) rows.push(`<div class="row"><b>Signed</b> ${esc(r.time.at ? r.time.at.replace('T', ' ').replace(/:\d\dZ$/, ' UTC') : 'unknown')}${r.time.status === 'unconfirmed' ? ' (time unconfirmed)' : ''}</div>`);
    if (r.claims?.age_over?.length || r.claims?.nationality) {
      const parts = [...(r.claims.age_over ?? []).map((n) => `over ${n}`), ...(r.claims.nationality ? [r.claims.nationality] : [])];
      rows.push(`<div class="row"><b>Attached claims</b> ${esc(parts.join(', '))}</div>`);
    }
    if (r.relation?.coSignerCount) rows.push(`<div class="row"><b>Co-signed by</b> ${r.relation.coSignerCount} verified humans</div>`);
    if (r.relation?.coSigns) rows.push(`<div class="row"><b>Co-signs</b> another Mark</div>`);
    if (r.relation?.inReplyTo) rows.push(`<div class="row"><b>In reply to</b> a Mark</div>`);
    if (r.reports?.count) rows.push(`<div class="row"><b>Reported</b> by ${r.reports.count} verified humans: ${esc(Object.keys(r.reports.reasons).join(', '))}</div>`);
    if (r.assurance) rows.push(`<div class="row note">Uniqueness basis: ${esc(r.assurance.uniqueness)}. Key protection: ${esc(r.assurance.key_protection)}.</div>`);
  } else if (r.failedStep) {
    rows.push(`<div class="note">Failed at step ${r.failedStep} of 18.</div>`);
  }
  rows.push(`<div class="hairline"></div>`);
  rows.push(`<div class="note">A Mark says a verified human vouched for this text. It does not say who wrote it or that it is true. Trust the toolbar badge, not this card: a page can imitate the card.</div>`);
  rows.push(`<div class="mrz">ZOREAL Mark</div>`);
  return rows.join('');
}

// ---------- page-level Mark ----------
function scanPageMark(): void {
  const meta = document.querySelector('meta[name="zoreal-mark"]') as HTMLMetaElement | null;
  if (!meta?.content) return;
  const el = document.querySelector('[data-zoreal-mark]') ?? document.querySelector('article') ?? document.querySelector('main');
  if (!el) return;
  const canonical = (document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href || location.href;
  pageMarkElement = el as HTMLElement;
  void send({ type: 'verifyPage', pageUrl: canonical, id: meta.content.trim(), text: (el as HTMLElement).innerText });
}

// ---------- the sign control ----------
interface SiteEntry { site: string; name?: string; selectors: string[]; binding?: 'page' | 'channel' }
const SITES = sites as { sites: SiteEntry[] };
let lastEditable: HTMLElement | null = null;
let control: { host: HTMLElement; button: HTMLButtonElement; hint: HTMLElement; target: HTMLElement | null } | null = null;

function siteEntry(): SiteEntry | undefined {
  const site = siteOf(location.href);
  return SITES.sites.find((s) => s.site === site);
}

function ensureControl(): NonNullable<typeof control> {
  if (control) return control;
  const host = document.createElement('div');
  host.setAttribute('data-zoreal-mark-host', 'sign');
  host.style.display = 'none';
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = SIGN_CONTROL_CSS;
  const button = document.createElement('button');
  button.type = 'button';
  button.innerHTML = `${icon('pen-line')}<span>Sign with ZOREAL</span>`;
  button.setAttribute('aria-label', 'Sign this text with ZOREAL Mark');
  const hint = document.createElement('div');
  hint.className = 'hint';
  hint.hidden = true;
  button.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus in the box
  button.addEventListener('click', async () => {
    const res = await send<{ opened?: boolean }>({ type: 'openPopupForSigning' });
    if (!res?.opened) {
      hint.textContent = 'Open the ZOREAL Mark icon in the toolbar to sign this text.';
      hint.hidden = false;
      setTimeout(() => { hint.hidden = true; }, 4000);
    }
  });
  shadow.append(style, button, hint);
  document.documentElement.append(host);
  control = { host, button, hint, target: null };
  return control;
}

function positionControl(): void {
  if (!control?.target) return;
  const r = control.target.getBoundingClientRect();
  if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) { control.host.style.display = 'none'; return; }
  control.host.style.display = 'block';
  control.host.style.left = `${Math.max(8, Math.min(window.innerWidth - 170, r.right - 160))}px`;
  control.host.style.top = `${Math.min(window.innerHeight - 40, r.bottom + 6)}px`;
}

function attachSignControls(): void {
  const entry = siteEntry();
  if (!entry) return;
  for (const sel of entry.selectors) {
    let nodes: NodeListOf<Element>;
    try { nodes = document.querySelectorAll(sel); } catch { continue; }
    for (const n of nodes) {
      const el = n as HTMLElement & { __zorealSign?: boolean };
      if (el.__zorealSign) continue;
      el.__zorealSign = true;
      el.addEventListener('focus', () => { const c = ensureControl(); c.target = el; positionControl(); }, true);
      el.addEventListener('blur', () => { setTimeout(() => { if (document.activeElement !== el && control) { control.host.style.display = 'none'; } }, 150); }, true);
    }
  }
}

function rememberEditable(e: Event): void {
  const t = e.target as HTMLElement | null;
  if (!t || !editable(t)) return;
  const box = t.closest('textarea, input, [contenteditable]') as HTMLElement;
  if (box === lastEditable) return;
  lastEditable = box;
  // Tells the worker this frame holds the cursor. The popup cannot see into a
  // frame from the top document, so the answer to "which box?" has to come
  // from whichever frame the holder is typing in.
  void send({ type: 'editableFocused' });
}

/**
 * The page a Mark written here binds to. Inside a frame that is the page the
 * holder is looking at, not the frame's own address: the referrer is the
 * embedding page for a same-site frame, and the top origin is all a
 * cross-site one is allowed to know.
 */
function pageUrlForSigning(): string {
  if (window.top === window) return location.href;
  if (document.referrer) return document.referrer;
  const top = location.ancestorOrigins?.[location.ancestorOrigins.length - 1];
  return top ? `${top}/` : location.href;
}
document.addEventListener('focusin', rememberEditable);
// The context menu path: the box that was right-clicked is the box to sign,
// whether or not the click focused it (framework editors often do not).
document.addEventListener('contextmenu', rememberEditable, true);
document.addEventListener('mousedown', rememberEditable, true);
window.addEventListener('scroll', positionControl, { passive: true });
window.addEventListener('resize', positionControl);

function targetBox(): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  if (active && editable(active)) return active.closest('textarea, input, [contenteditable]') as HTMLElement;
  return lastEditable && lastEditable.isConnected ? lastEditable : null;
}

function textOf(el: HTMLElement): string {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value;
  return el.innerText;
}

function signTarget(): SignTarget {
  const el = targetBox();
  if (!el) return { found: false, text: '', pageUrl: pageUrlForSigning(), listed: false, kind: 'none' };
  const entry = siteEntry();
  const listed = !!entry && entry.selectors.some((s) => { try { return el.matches(s); } catch { return false; } });
  const kind = el instanceof HTMLTextAreaElement ? 'textarea' : el instanceof HTMLInputElement ? 'input' : 'contenteditable';
  return { found: true, text: textOf(el), pageUrl: pageUrlForSigning(), listed, kind };
}

function insertMark(id: string, marker: 'signed' | 'delegated'): boolean {
  const el = targetBox();
  if (!el) return false;
  // Block form, markers on their own lines, wherever the box can hold a line
  // break; a single-line input gets the inline form.
  const wrapped = wrap(textOf(el).trim(), id, marker, el instanceof HTMLInputElement ? 'inline' : 'block');
  el.focus();
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value')?.set;
    setter ? setter.call(el, wrapped) : (el.value = wrapped);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }
  // Rich editors listen for input events; execCommand is the one path that
  // produces them the way typing does, in every framework editor tested.
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel?.removeAllRanges();
  sel?.addRange(range);
  const ok = document.execCommand('insertText', false, wrapped);
  if (!ok) {
    el.textContent = wrapped;
    el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: wrapped }));
  }
  return true;
}

/**
 * Scrolls the Mark into view and outlines the block that holds it for a
 * moment. `scrollIntoView` also scrolls the frames above this one, so a Mark
 * inside an embedded editor comes into view on the page the reader sees.
 */
function revealMark(ordinal: number): boolean {
  // By attribute when this copy did not place the badge itself.
  const host = ordinal < 0 ? pageMarkElement : (hostsByOrdinal.get(ordinal) ?? (document.querySelector(`[data-zoreal-ordinal="${ordinal}"]`) as HTMLElement | null));
  if (!host || !host.isConnected) return false;
  const block = ordinal < 0 ? host : blockOf(host);
  // Instant, not smooth: a smooth scroll is a frame-driven animation, and the
  // popup that asked has just closed over a page that may not be painting yet.
  block.scrollIntoView({ block: 'center' });
  const prev = { outline: block.style.outline, offset: block.style.outlineOffset, radius: block.style.borderRadius, transition: block.style.transition };
  block.style.transition = 'outline-color 400ms ease-out';
  block.style.outline = '2px solid #00B4D9';
  block.style.outlineOffset = '4px';
  if (!block.style.borderRadius) block.style.borderRadius = '6px';
  setTimeout(() => {
    block.style.outlineColor = 'transparent';
    setTimeout(() => {
      block.style.outline = prev.outline;
      block.style.outlineOffset = prev.offset;
      block.style.borderRadius = prev.radius;
      block.style.transition = prev.transition;
    }, 450);
  }, 2200);
  return true;
}

chrome.runtime.onMessage.addListener((msg: ContentRequest, _sender, sendResponse) => {
  switch (msg.type) {
    case 'ping': sendResponse({ ok: true }); return;
    case 'getSignTarget': sendResponse(signTarget()); return;
    case 'insertMark': sendResponse({ ok: insertMark(msg.id, msg.marker) }); return;
    case 'revealMark': sendResponse({ ok: revealMark(msg.ordinal) }); return;
    case 'rescan': scan(); attachSignControls(); sendResponse({ ok: true }); return;
  }
});

// ---------- lifecycle ----------
let pending: number | undefined;
/**
 * Batches of DOM changes, 400 ms apart. Three kinds matter:
 *
 *   added nodes        new content: scan it.
 *   changed text       a framework reusing a text node and rewriting its
 *                      value, which is how a list re-renders when the reader
 *                      comes back to it. The node was processed once; it is
 *                      forgotten and its block scanned again.
 *   removed badges     a framework that owns the paragraph may drop the span
 *                      we put in it on its next render. The closing node it
 *                      belonged to is forgotten so the next scan badges it
 *                      again.
 */
const batch: MutationRecord[] = [];
const observer = new MutationObserver((records) => {
  if (retired) return;
  batch.push(...records);
  if (pending !== undefined) return;
  pending = window.setTimeout(() => {
    pending = undefined;
    const records = batch.splice(0);
    const roots = new Set<Node>();
    let rewritten = 0;
    for (const r of records) {
      for (const n of r.addedNodes) if (n.nodeType === Node.ELEMENT_NODE || n.nodeType === Node.TEXT_NODE) roots.add(n.nodeType === Node.TEXT_NODE ? (n.parentElement ?? document.body) : n);
      if (r.type === 'characterData') {
        // Rewritten in place, whether or not it held a Mark before.
        if (processed.has(r.target)) { processed.delete(r.target); rewritten++; }
        roots.add(r.target.parentElement ?? document.body);
      }
    }
    // A badge the page dropped while its closing marker stayed goes straight
    // back after that marker, verdict and all; no rescan, no refetch. When the
    // marker went too, the page replaced the paragraph, and the new nodes are
    // in `roots` already.
    let restored = 0;
    for (const [host, closer] of closerOfHost) {
      if (host.isConnected) continue;
      if (!closer.isConnected) { closerOfHost.delete(host); continue; }
      const anchor: Node = closer.parentElement?.closest('[data-zoreal-marker]') ?? closer;
      anchor.parentNode?.insertBefore(host, anchor.nextSibling);
      restored++;
    }
    log('mutations:', records.length, 'record(s),', roots.size, 'root(s) to scan,', rewritten, 'rewritten text node(s),', restored, 'badge(s) put back after the page removed them');
    for (const root of roots) if (root.isConnected) scan(root);
    attachSignControls();
  }, 400);
});

/**
 * Starts, or restarts, this copy of the script in this document. The worker
 * calls the restart through `__zorealMarkStart` when its probe finds no live
 * script in a frame; a restart keeps the badges already placed (the scan
 * adopts them) and picks up everything since.
 */
function start(): void {
  retired = false;
  // The two marks the worker probes for: present while this script is alive
  // in this document, cleared when it retires. The attribute is for a human
  // looking at the DOM; the global, in this isolated world, is what the probe
  // reads, since a page can strip an attribute off its own root and cannot
  // reach this global.
  document.documentElement.setAttribute('data-zoreal-mark-script', new Date().toISOString());
  (globalThis as unknown as { __zorealMarkAlive?: boolean }).__zorealMarkAlive = true;
  log('content script running in', window.top === window ? 'the top document' : 'a frame', location.href);
  scan();
  scanPageMark();
  attachSignControls();
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
}
(globalThis as unknown as { __zorealMarkStart?: () => void }).__zorealMarkStart = start;
start();
// A page restored from the back/forward cache comes back with this script
// intact; nothing changed while it was away, and a scan costs nothing.
window.addEventListener('pageshow', (e) => { if (e.persisted && !retired) { log('restored from the back/forward cache; rescanning'); scan(); } });
