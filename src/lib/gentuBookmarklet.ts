// "Pull from Gentu" bookmarklet.
//
// How it works (no Gentu API exists):
//  1. Clicked on a logged-in gentu.io tab, it opens a small omsref receiver window
//     (/gentu/receive — same login as omsref, so no keys live in the bookmark).
//  2. It watches for Gentu's own CSV export of the "Referral Report – Referrer Details"
//     (blob downloads, fetch/XHR responses, export links). Nothing is read from the page.
//  3. The captured CSV is posted to the receiver window, which previews and saves it.
//  4. Full rebuild: when the export came from a server request (not a browser-generated
//     file), the bookmarklet remembers that request, swaps in each quarter's start/end
//     dates and re-requests it — one Referrer Details CSV per quarter from Gentu's
//     start (Sept 2022) to the last complete quarter. The receiver then replaces every
//     quarter in one go. Same report, same columns, just re-run per quarter.
//  The report is already aggregated per referrer — no patient-level data is involved.

export const GENTU_FIRST_QUARTER = '2022Q3' // Gentu data begins 19/09/2022

function source(omsOrigin: string, query: string): string {
  return `(() => {
  const OMS = ${JSON.stringify(omsOrigin)};
  const Q = ${JSON.stringify(query)};
  const RX_URL = OMS + '/gentu/receive' + Q;
  const FIRST = ${JSON.stringify(GENTU_FIRST_QUARTER)};
  if (!/(^|\\.)gentu\\.io$/.test(location.hostname)) {
    window.open(RX_URL + (Q ? '&' : '?') + 'hint=notgentu', 'omsref_gentu', 'width=600,height=760');
    return;
  }
  if (window.__omsrefPull) { window.__omsrefPull.reopen(); return; }

  let rx = window.open(RX_URL, 'omsref_gentu', 'width=600,height=760');
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1a1a18;color:#fff;font:13px/1.45 system-ui,sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:340px';
  const msg = document.createElement('div');
  const btns = document.createElement('div');
  btns.style.cssText = 'margin-top:8px;display:flex;gap:6px;flex-wrap:wrap';
  const mk = (t, primary) => { const b = document.createElement('button'); b.textContent = t; b.style.cssText = 'border-radius:6px;padding:3px 10px;cursor:pointer;font:12px system-ui;' + (primary ? 'background:#2e8b57;color:#fff;border:none' : 'background:transparent;color:#bbb;border:1px solid #555'); return b; };
  const allBtn = mk('Pull every quarter', true); allBtn.style.display = 'none';
  const close = mk('Stop', false);
  btns.append(allBtn, close); box.append(msg, btns); document.body.appendChild(box);
  const say = t => { msg.innerHTML = '<b>omsref</b> — ' + t; };
  say('watching for the export. Run <b>Referral Report → Referrer Details</b> (any date range) and click <b>Export / CSV</b>.');

  // ── Date handling for replaying the export per quarter ──
  const pad = n => String(n).padStart(2, '0');
  const DATE_RX = /(\\d{4})-(\\d{2})-(\\d{2})|(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})/g;
  const findDates = s => { const out = []; let m; DATE_RX.lastIndex = 0; while ((m = DATE_RX.exec(s))) { out.push(m[1] ? { raw: m[0], d: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])), iso: true } : { raw: m[0], d: new Date(Date.UTC(+m[6], +m[5] - 1, +m[4])), iso: false, padded: m[4].length === 2 }); } return out; };
  const fmtLike = (tok, d) => tok.iso ? d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate())
    : (tok.padded ? pad(d.getUTCDate()) + '/' + pad(d.getUTCMonth() + 1) : d.getUTCDate() + '/' + (d.getUTCMonth() + 1)) + '/' + d.getUTCFullYear();
  const qOf = d => d.getUTCFullYear() + 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
  const qBounds = q => { const y = +q.slice(0, 4), i = +q.slice(5) - 1; return [new Date(Date.UTC(y, i * 3, 1)), new Date(Date.UTC(y, i * 3 + 3, 0))]; };
  const quartersTo = last => { const out = []; let y = +FIRST.slice(0, 4), i = +FIRST.slice(5); while (y + 'Q' + i <= last) { out.push(y + 'Q' + i); i++; if (i > 4) { i = 1; y++; } } return out; };
  const lastComplete = () => { const n = new Date(); const i = Math.floor(n.getMonth() / 3); return i === 0 ? (n.getFullYear() - 1) + 'Q4' : n.getFullYear() + 'Q' + i; };
  const rangeInfo = req => {
    if (!req) return null;
    const text = decodeURIComponent(req.url) + ' ' + (typeof req.body === 'string' ? decodeURIComponent(req.body) : '');
    const uniq = []; for (const t of findDates(text)) if (!uniq.some(u => u.raw === t.raw)) uniq.push(t);
    if (uniq.length === 1) return { start: uniq[0], end: uniq[0] };
    if (uniq.length !== 2) return null;
    return uniq[0].d <= uniq[1].d ? { start: uniq[0], end: uniq[1] } : { start: uniq[1], end: uniq[0] };
  };
  const swap = (s, from, to) => s.split(from).join(to).split(encodeURIComponent(from)).join(encodeURIComponent(to));
  const periodFor = info => {
    if (!info) return null;
    const [a, b] = qBounds(qOf(info.start.d));
    return info.start.d.getTime() === a.getTime() && info.end.d.getTime() === b.getTime() ? qOf(info.start.d) : null;
  };

  let template = null;
  const looksRight = t => typeof t === 'string' && /referrer/i.test(t.split(/\\r?\\n/)[0] || '') && /referrals/i.test(t.split(/\\r?\\n/)[0] || '');
  const post = data => {
    if (!rx || rx.closed) rx = window.open(RX_URL, 'omsref_gentu', 'width=600,height=760');
    rx.postMessage(Object.assign({ type: 'omsref-gentu-csv', at: Date.now() }, data), OMS);
  };
  const send = (text, how, req) => {
    if (!looksRight(text)) return false;
    const info = rangeInfo(req);
    if (req && info) { template = req; allBtn.style.display = ''; }
    try {
      post({ csv: text, how, period: periodFor(info), range: info ? [info.start.raw, info.end.raw] : null });
      say('export captured and sent to the omsref window (' + (text.split(/\\r?\\n/).length - 1) + ' rows).' +
        (template ? ' To rebuild everything, click <b>Pull every quarter</b>.' : (how === 'blob' ? ' This export is built inside the browser, so other quarters can’t be re-run automatically — export each quarter in turn.' : '')));
    } catch (e) {
      say('captured, but the browser blocked sending it. Drop the downloaded CSV into the omsref window instead.');
    }
    return true;
  };

  // ── Re-run the export once per quarter ──
  let running = false;
  allBtn.onclick = async () => {
    if (!template || running) return;
    const info = rangeInfo(template); if (!info) return;
    const qs = quartersTo(lastComplete());
    running = true; allBtn.disabled = true;
    post({ batchStart: qs.length });
    let ok = 0, empty = 0, fail = 0;
    for (let k = 0; k < qs.length; k++) {
      const q = qs[k], [a, b] = qBounds(q);
      let url = template.url, body = template.body;
      // replace end first in case start and end share a substring
      url = swap(swap(url, info.end.raw, '\\u0001END'), info.start.raw, fmtLike(info.start, a)).split('\\u0001END').join(fmtLike(info.end, b)).split(encodeURIComponent('\\u0001END')).join(encodeURIComponent(fmtLike(info.end, b)));
      if (typeof body === 'string') body = swap(swap(body, info.end.raw, '\\u0001END'), info.start.raw, fmtLike(info.start, a)).split('\\u0001END').join(fmtLike(info.end, b)).split(encodeURIComponent('\\u0001END')).join(encodeURIComponent(fmtLike(info.end, b)));
      say('pulling ' + q + ' (' + (k + 1) + ' of ' + qs.length + ')…');
      try {
        const r = await origFetch(url, { method: template.method || 'GET', body: body || undefined, headers: template.headers || undefined, credentials: 'include' });
        const t = await r.text();
        if (!r.ok) { fail++; post({ batchItem: q, error: 'HTTP ' + r.status }); }
        else if (!looksRight(t)) { fail++; post({ batchItem: q, error: 'not a Referrer Details CSV' }); }
        else { post({ batchItem: q, csv: t }); t.split(/\\r?\\n/).filter(Boolean).length > 1 ? ok++ : empty++; }
      } catch (e) { fail++; post({ batchItem: q, error: String(e).slice(0, 120) }); }
      await new Promise(r => setTimeout(r, 400));
    }
    post({ batchDone: true });
    running = false; allBtn.disabled = false;
    say('done: ' + ok + ' quarters pulled' + (empty ? ', ' + empty + ' empty' : '') + (fail ? ', ' + fail + ' failed' : '') + '. Review them in the omsref window and click <b>Save all</b>.');
  };

  // ── Capture hooks ──
  const origCOU = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    try { if (obj instanceof Blob && obj.size < 20e6) obj.text().then(t => send(t, 'blob', null)).catch(() => {}); } catch (e) {}
    return origCOU.apply(this, arguments);
  };
  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const req = { url: new URL(url, location.href).href, method: (init && init.method) || (input && input.method) || 'GET', body: init && typeof init.body === 'string' ? init.body : null, headers: init && init.headers && !(init.headers instanceof Headers) ? init.headers : null };
    return origFetch.apply(this, arguments).then(res => {
      try {
        const ct = res.headers.get('content-type') || '';
        if (/csv|text\\/plain|octet-stream/i.test(ct)) res.clone().text().then(t => send(t, 'fetch', req)).catch(() => {});
      } catch (e) {}
      return res;
    });
  };
  const origOpen = XMLHttpRequest.prototype.open, origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__oms = { url: new URL(url, location.href).href, method: method || 'GET', body: null, headers: null };
    this.addEventListener('load', function () {
      try {
        const ct = this.getResponseHeader('content-type') || '';
        if (/csv|text\\/plain|octet-stream/i.test(ct) && (this.responseType === '' || this.responseType === 'text')) send(this.responseText, 'xhr', this.__oms);
        else if (this.responseType === 'blob' && this.response instanceof Blob) this.response.text().then(t => send(t, 'xhr', this.__oms)).catch(() => {});
      } catch (e) {}
    });
    return origOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    if (this.__oms && typeof body === 'string') this.__oms.body = body;
    return origSend.apply(this, arguments);
  };
  const onClick = ev => {
    const a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    const href = a.href;
    if (!href || /^(blob:|javascript:|data:)/.test(href)) return;
    if (a.hasAttribute('download') || /csv|export/i.test(href)) {
      origFetch(href, { credentials: 'include' }).then(r => r.text()).then(t => send(t, 'link', { url: href, method: 'GET', body: null, headers: null })).catch(() => {});
    }
  };
  document.addEventListener('click', onClick, true);

  const stop = () => {
    URL.createObjectURL = origCOU; window.fetch = origFetch;
    XMLHttpRequest.prototype.open = origOpen; XMLHttpRequest.prototype.send = origSend;
    document.removeEventListener('click', onClick, true); box.remove(); delete window.__omsrefPull;
  };
  close.onclick = stop;
  window.__omsrefPull = { reopen: () => { rx = window.open(RX_URL, 'omsref_gentu', 'width=600,height=760'); }, stop };
})();`
}

/** javascript: URL for dragging to the bookmarks bar. */
export function buildBookmarklet(omsOrigin: string, query = ''): string {
  const code = source(omsOrigin, query)
    .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('//')).join(' ')
  return 'javascript:' + encodeURIComponent(code)
}

/** Same script for pasting into the DevTools console (if bookmarklets are blocked). */
export function consoleScript(omsOrigin: string, query = ''): string {
  return source(omsOrigin, query)
}

/** Messages posted from the Gentu tab to the receiver window. */
export interface GentuCsvMessage {
  type: 'omsref-gentu-csv'
  at: number
  // single export
  csv?: string
  how?: string
  period?: string | null
  range?: [string, string] | null
  // full rebuild
  batchStart?: number
  batchItem?: string
  error?: string
  batchDone?: boolean
}

export const GENTU_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*gentu\.io$/i
