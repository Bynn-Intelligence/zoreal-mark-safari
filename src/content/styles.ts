/**
 * Styles for the inline badge and the hover card, injected into a closed
 * shadow root so the page's CSS cannot reach them and ours cannot reach the
 * page. Tokens duplicated from src/ui/tokens.css on purpose: a content script
 * cannot load a stylesheet URL into a closed root without a round trip, and the
 * palette is small.
 */
export const BADGE_CSS = `
:host { all: initial; display: inline-block; vertical-align: baseline; margin-left: 0.35em; position: relative; font-family: 'Space Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1; }
:host, :host * { box-sizing: border-box; }
.badge { display: inline-flex; align-items: center; gap: 0.3em; padding: 0.15em 0.55em 0.15em 0.4em; border-radius: 999px; font-size: 12px; font-weight: 500; cursor: default; border: 1px solid #E6EBF1; color: #425466; background: #F6F9FC; white-space: nowrap; transition: background 200ms cubic-bezier(0.23,1,0.32,1); }
.badge svg { width: 13px; height: 13px; stroke-width: 2; flex: none; }
.badge.strong { color: #00758D; background: #EAF8FD; border-color: rgb(0 180 217 / 0.25); }
.badge.secondary { color: #425466; background: #F6F9FC; }
.badge.delegated { color: #8A5A00; background: #FFF6E5; border-color: transparent; }
.badge.failed { color: #D93036; background: #FBECEC; border-color: transparent; }
.badge.neutral { color: #697386; background: #F6F9FC; }
.badge.checking { color: #697386; background: #F6F9FC; }
.badge.checking svg { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.card { position: fixed; z-index: 2147483647; left: 0; top: 0; width: 320px; max-width: 90vw; background: #FFFFFF; color: #0E104F; border: 1px solid #E6EBF1; border-radius: 20px; padding: 14px 16px; box-shadow: 0 2px 4px rgb(14 16 79 / 0.06), 0 20px 48px rgb(14 16 79 / 0.16); font-size: 13px; line-height: 1.45; opacity: 0; transform: scale(0.96) translateY(-4px); transform-origin: top left; transition: opacity 180ms cubic-bezier(0.23,1,0.32,1), transform 180ms cubic-bezier(0.23,1,0.32,1); pointer-events: none; }
.card.right { transform-origin: top right; }
.card.above { transform-origin: bottom left; }
.card.above.right { transform-origin: bottom right; }
.card.shown { opacity: 1; transform: none; pointer-events: auto; }
.card .verdict { display: flex; align-items: center; gap: 0.5em; font-weight: 600; font-size: 14px; letter-spacing: -0.01em; }
.card .verdict svg { width: 18px; height: 18px; stroke-width: 1.75; }
.card .verdict.strong { color: #00758D; } .card .verdict.failed { color: #D93036; } .card .verdict.delegated { color: #8A5A00; } .card .verdict.secondary, .card .verdict.neutral { color: #425466; }
.card .row { margin-top: 8px; color: #425466; }
.card .row b { color: #0E104F; font-weight: 500; }
.card .mrz { font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #697386; margin-top: 12px; }
.card .hairline { border-top: 1px solid #E6EBF1; margin: 10px 0; }
.card a { color: #00758D; text-decoration: none; }
.card a:hover { text-decoration: underline; }
.card .note { color: #697386; font-size: 12px; }
@media (prefers-color-scheme: dark) {
  .badge { border-color: #262B4A; color: #B9C0DC; background: #0B0E20; }
  .badge.strong { color: #5FD8F5; background: #0E2A3F; }
  .badge.failed { color: #FF6B6B; background: #3A1518; }
  .badge.delegated { color: #F2C46D; background: #3A2A0E; }
  .card { background: #12162C; color: #F5F7FF; border-color: #262B4A; box-shadow: 0 2px 4px rgb(0 0 0 / 0.3), 0 20px 48px rgb(0 0 0 / 0.5); }
  .card .row { color: #B9C0DC; } .card .row b { color: #F5F7FF; } .card .hairline { border-color: #262B4A; }
  .card .verdict.strong { color: #5FD8F5; } .card a { color: #5FD8F5; }
}
`;

export const SIGN_CONTROL_CSS = `
:host { all: initial; position: fixed; z-index: 2147483645; font-family: 'Space Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; }
:host, :host * { box-sizing: border-box; }
button { display: inline-flex; align-items: center; gap: 0.4em; font: inherit; font-size: 12px; font-weight: 500; color: #0E104F; background: #FFFFFF; border: 1px solid #E6EBF1; border-radius: 999px; padding: 0 12px 0 8px; height: 30px; cursor: pointer; box-shadow: 0 1px 2px rgb(14 16 79 / 0.06), 0 8px 24px rgb(14 16 79 / 0.10); transition: transform 260ms cubic-bezier(0.23,1,0.32,1), background 200ms cubic-bezier(0.23,1,0.32,1); }
button:hover { background: #EAF8FD; }
button:active { transform: scale(0.98); }
button svg { width: 14px; height: 14px; stroke-width: 2; color: #00758D; }
.hint { position: absolute; right: 0; bottom: calc(100% + 6px); width: 260px; background: #FFFFFF; color: #425466; border: 1px solid #E6EBF1; border-radius: 14px; padding: 10px 12px; font-size: 12px; box-shadow: 0 2px 4px rgb(14 16 79 / 0.06), 0 20px 48px rgb(14 16 79 / 0.16); }
@media (prefers-color-scheme: dark) { button { background: #12162C; color: #F5F7FF; border-color: #262B4A; } button:hover { background: #0E2A3F; } .hint { background: #12162C; color: #B9C0DC; border-color: #262B4A; } }
`;

/**
 * The layer that holds the ONE hover card, appended to the document root
 * rather than to the badge. A card positioned inside a post is clipped by
 * the first ancestor with overflow hidden and buried under the next card's
 * shadow; one at the root, fixed from the badge's rectangle, sits above
 * everything on the page. The badge styles ride along for the card's rules.
 */
export const CARD_LAYER_CSS = `
:host { all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; overflow: visible; font-family: 'Space Grotesk', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1; }
:host, :host * { box-sizing: border-box; }
` + BADGE_CSS;
