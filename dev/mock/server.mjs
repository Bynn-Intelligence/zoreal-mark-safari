/**
 * A local record server over the verifier's conformance fixtures, for
 * developing the extension before the real record service exists.
 *
 *   GET  /mark/<id>                       the fixture record, JSON
 *   GET  /pki/dev-anchors                 the fixture trust anchors (localhost only, see the options page)
 *   GET  /demo                            a page with one Mark per fixture case and a text box to sign
 *   POST /v1/zoreal/mark/orders           creates a pretend sign order
 *   GET  /v1/zoreal/mark/orders/<order>   walks through the hints, then completes with the fixture whose
 *                                         text hash matches the order, or fails: this mock holds no keys
 *   POST /v1/zoreal/mark/sightings        204
 *
 * Port 4820. Nothing here signs anything.
 */
import { createServer } from 'node:http';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve('@zoreal/mark-verify/package.json'));
const fixtures = join(pkgDir, 'fixtures');
if (!existsSync(join(fixtures, 'index.json'))) {
  console.error(`no fixtures at ${fixtures}: run "npm run fixtures" in the verifier package`);
  process.exit(1);
}
const cases = JSON.parse(readFileSync(join(fixtures, 'index.json'), 'utf8'));
const anchors = JSON.parse(readFileSync(join(fixtures, 'anchors.json'), 'utf8'));
const records = new Map(readdirSync(join(fixtures, 'records')).map((f) => [f.replace(/\.json$/, ''), JSON.parse(readFileSync(join(fixtures, 'records', f), 'utf8'))]));
const orders = new Map();
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => CROCKFORD[b % 32]).join('');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Accept', 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function demoPage(host) {
  const okPage = cases.find((c) => c.name === 'ok-page');
  const items = cases.filter((c) => c.pageUrl !== undefined).map((c) => {
    const open = c.marker === 'delegated' ? '::ZOREAL-DELEGATED::' : '::ZOREAL-MARK::';
    return `<li><div class="name">${esc(c.name)} <span class="exp">expects ${esc(c.expect.verdict)}${c.expect.failedStep ? ` at step ${c.expect.failedStep}` : ''}</span></div><p>${esc(open)} ${esc(c.text)} ::ZOREAL-SIGNATURE:${esc(c.id)}::</p></li>`;
  }).join('\n');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ZOREAL Mark demo</title>
<meta name="zoreal-mark" content="${esc(okPage.id)}">
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#0E104F;line-height:1.5}li{margin:0 0 18px;list-style:none}.name{font-weight:600}.exp{font-weight:400;color:#697386;font-size:13px}p{background:#F6F9FC;padding:10px 12px;border-radius:12px}textarea{width:100%;min-height:90px;font:inherit;padding:10px;border:1px solid #C9D3DF;border-radius:12px}code{background:#F6F9FC;padding:1px 4px;border-radius:4px}</style></head><body>
<h1>ZOREAL Mark demo</h1>
<p>Fixture records served from <code>${esc(host)}</code>. Set the extension's record host to this origin plus <code>/mark</code> and its API to this origin in its settings. This page's <code>zoreal-mark</code> meta tag names the <code>ok-page</code> record, and the article below is its text, so the toolbar shows a page-level verdict too.</p>
<article data-zoreal-mark>${esc(okPage.text)}</article>
<h2>Sign a text</h2>
<p>The mock cannot sign: it has no keys. Type exactly the text below and the pretend order completes with the fixture record that carries that hash; anything else fails with a reason.</p>
<pre>${esc(okPage.text)}</pre>
<textarea id="demo-box" placeholder="Write here, then use the sign control or the toolbar"></textarea>
${process.env.REAL_MARK ? `<h2>A real record</h2><p>Served by a record service other than this mock (set REAL_MARK="id|text" and point the extension at that service): the block form, verified against a real record.</p><div id="real"><p>::ZOREAL-MARK::</p><p>${esc(process.env.REAL_MARK.split('|').slice(1).join('|'))}</p><p>::ZOREAL-SIGNATURE:${esc(process.env.REAL_MARK.split('|')[0])}::</p></div>` : ''}
${(() => { const here = cases.find((c) => c.name === 'ok-demo-here'); return here ? `<h2>Signed for this very page</h2><p>Bound to this page's own address, so it verifies strongly here and nowhere else. A strong verdict hides the markers and leaves the words and the badge.</p><div id="here"><p>::ZOREAL-MARK::</p><p>${esc(here.text)}</p><p>::ZOREAL-SIGNATURE:${esc(here.id)}::</p></div>` : ''; })()}
<h2>Posted over several lines</h2>
<p>The same record as the first case, posted the way a platform renders blank lines: three paragraphs. It verifies the same, because surrounding spaces and line breaks are not part of the text.</p>
<div id="multiline"><p>${esc(cases[0].marker === 'delegated' ? '::ZOREAL-DELEGATED::' : '::ZOREAL-MARK::')}</p><p></p><p>${esc(cases[0].text)}</p><p></p><p>::ZOREAL-SIGNATURE:${esc(cases[0].id)}::</p></div>
<h2>Every conformance case</h2>
<ul>${items}</ul>
</body></html>`;
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'OPTIONS') return json(res, 204, {});
  let m;
  if (req.method === 'GET' && (m = url.pathname.match(/^\/mark\/([0-9A-Z]{24})$/))) {
    const r = records.get(m[1]);
    if (!r) return json(res, 404, { error: 'unknown record' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': r.timestamp?.status === 'confirmed' ? 'public, max-age=31536000, immutable' : 'public, max-age=60' });
    return res.end(JSON.stringify(r));
  }
  if (req.method === 'GET' && (url.pathname === '/pki/dev-anchors' || url.pathname === '/dev/anchors')) return json(res, 200, anchors);
  // A realistic comment thread, for screenshots: one comment signed for this
  // very page, one signed for another page, one plain. Nothing here is a
  // real site; the names are invented.
  if (req.method === 'GET' && url.pathname === '/showcase') {
    const here = cases.find((c) => c.name === 'ok-showcase-here');
    const other = cases.find((c) => c.name === 'ok-page');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Council vote on the harbour plan passes 7 to 4</title>
<style>
  body { margin: 0; font-family: -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1a1a1a; background: #fff; }
  .top { border-bottom: 1px solid #e5e5e5; padding: 14px 0; }
  .wrap { width: 720px; margin: 0 auto; }
  .masthead { font-weight: 800; font-size: 20px; letter-spacing: -0.02em; }
  h1 { font-size: 30px; line-height: 1.15; margin: 28px 0 8px; letter-spacing: -0.02em; }
  .byline { color: #666; font-size: 14px; margin-bottom: 24px; }
  p.lede { font-size: 17px; line-height: 1.55; color: #333; }
  h2 { font-size: 18px; margin: 36px 0 14px; }
  .comment { display: grid; grid-template-columns: 40px 1fr; gap: 12px; padding: 16px 0; border-top: 1px solid #eee; }
  .avatar { width: 40px; height: 40px; border-radius: 50%; background: #d9dee5; }
  .who { font-weight: 600; font-size: 14px; } .when { color: #888; font-size: 12px; margin-left: 8px; }
  .comment p { margin: 6px 0; font-size: 15px; line-height: 1.5; }
</style></head><body>
<div class="top"><div class="wrap masthead">The Harbour Gazette</div></div>
<div class="wrap">
<h1>Council vote on the harbour plan passes 7 to 4</h1>
<div class="byline">By staff reporter &middot; 9 September 2026</div>
<p class="lede">The redevelopment plan for the eastern harbour passed its final reading on Tuesday evening after three hours of debate, with the mayor casting the deciding vote after a tie on the amended budget.</p>
<h2>14 comments</h2>
<div class="comment"><div class="avatar"></div><div><span class="who">M. Lindqvist</span><span class="when">2 hours ago</span>
<p>::ZOREAL-MARK::</p><p>${esc(here.text)}</p><p>::ZOREAL-SIGNATURE:${esc(here.id)}::</p></div></div>
<div class="comment"><div class="avatar"></div><div><span class="who">harbourwatch</span><span class="when">1 hour ago</span>
<p>Seven to four is not what the minutes will say. Wait for the minutes.</p></div></div>
<div class="comment"><div class="avatar"></div><div><span class="who">A. Reyes</span><span class="when">40 minutes ago</span>
<p>::ZOREAL-MARK:: ${esc(other.text)} ::ZOREAL-SIGNATURE:${esc(other.id)}::</p></div></div>
</div></body></html>`);
    return;
  }
  // The demo inside an iframe, the way a dashboard embeds an editor: the
  // extension must find the Marks and the box in the frame, not the page.
  if (req.method === 'GET' && url.pathname === '/demo-frame') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>Framed demo</title><h1>The demo, framed</h1><p>The text box and every Mark below live inside an iframe.</p><iframe id="frame" src="/demo" style="width:100%;height:80vh;border:1px solid #ccc"></iframe>');
    return;
  }
  if (req.method === 'GET' && (url.pathname === '/demo' || url.pathname === '/')) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(demoPage(`http://${req.headers.host}`));
  }
  if (req.method === 'POST' && url.pathname === '/v1/zoreal/mark/orders') {
    let body = '';
    for await (const chunk of req) body += chunk;
    let parsed;
    try { parsed = JSON.parse(body); } catch { return json(res, 400, { error: 'body is not JSON' }); }
    for (const f of ['kind', 'binding', 'site', 'identity', 'hash', 'visible_sealed']) if (!(f in parsed)) return json(res, 422, { error: `missing ${f}` });
    const order = newId();
    orders.set(order, { created: Date.now(), polls: 0, hash: parsed.hash });
    return json(res, 201, { order, qr_token: newId(), qr_secret: newId(), start_token: newId(), expires_in: 120 });
  }
  if (req.method === 'GET' && (m = url.pathname.match(/^\/v1\/zoreal\/mark\/orders\/([0-9A-Z]{24})$/))) {
    const o = orders.get(m[1]);
    if (!o) return json(res, 404, { error: 'unknown order' });
    o.polls += 1;
    const hints = ['waiting_for_scan', 'waiting_for_scan', 'claimed', 'signing'];
    if (o.polls <= hints.length) return json(res, 200, { status: 'pending', hint: hints[o.polls - 1] });
    const match = [...records.values()].find((r) => r.payload?.data?.hash === o.hash && r.withdrawn === null && !r.delegation && r.payload.data.co_signs === undefined);
    if (match) return json(res, 200, { status: 'complete', id: match.id });
    return json(res, 200, { status: 'failed', reason: 'the mock has no signing keys; only the fixture text completes' });
  }
  if (req.method === 'POST' && url.pathname === '/v1/zoreal/mark/sightings') return json(res, 204, {});
  json(res, 404, { error: 'not found' });
}).listen(4820, () => console.log('mock record service on http://localhost:4820 (demo at /demo)'));
