// "Pull from Gentu" bookmarklet.
//
// How it works (no Gentu API exists):
//  1. Clicked on a logged-in gentu.io tab, it opens a small omsref receiver window
//     (/gentu/receive — same login as omsref, so no keys live in the bookmark).
//  2. It watches for Gentu's own CSV export: blob downloads, fetch/XHR responses
//     and export links. Nothing is read from the page itself.
//  3. When the user exports the "Referral Report – Referrer Details" CSV, a copy is
//     posted to the receiver window, which previews totals and saves the quarter
//     through the existing /api/upload route after the user confirms.
//  The report is already aggregated per referrer — no patient-level data is involved.
//  Gentu's normal download still happens, so the file can be dropped into the
//  receiver by hand if the browser blocks the window-to-window message.

function source(omsOrigin: string, query: string): string {
  return `(() => {
  const OMS = ${JSON.stringify(omsOrigin)};
  const RX_URL = OMS + '/gentu/receive' + ${JSON.stringify(query)};
  if (!/(^|\\.)gentu\\.io$/.test(location.hostname)) {
    window.open(RX_URL + (${JSON.stringify(query)} ? '&' : '?') + 'hint=notgentu', 'omsref_gentu', 'width=560,height=720');
    return;
  }
  if (window.__omsrefPull) { window.__omsrefPull.reopen(); return; }

  let rx = window.open(RX_URL, 'omsref_gentu', 'width=560,height=720');
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;background:#1a1a18;color:#fff;font:13px/1.45 system-ui,sans-serif;padding:12px 14px;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.3);max-width:320px';
  const msg = document.createElement('div');
  const close = document.createElement('button');
  close.textContent = 'Stop';
  close.style.cssText = 'margin-top:8px;background:transparent;color:#bbb;border:1px solid #555;border-radius:6px;padding:2px 10px;cursor:pointer;font:12px system-ui';
  box.append(msg, close); document.body.appendChild(box);
  const say = t => { msg.innerHTML = '<b>omsref</b> — ' + t; };
  say('watching for the export. Run <b>Referral Report → Referrer Details</b> for one quarter and click <b>Export / CSV</b>.');

  let sent = 0;
  const looksRight = t => typeof t === 'string' && /referrer/i.test(t.split(/\\r?\\n/)[0] || '') && /referrals/i.test(t.split(/\\r?\\n/)[0] || '');
  const send = (text, how) => {
    if (!looksRight(text)) return false;
    if (!rx || rx.closed) rx = window.open(RX_URL, 'omsref_gentu', 'width=560,height=720');
    try {
      rx.postMessage({ type: 'omsref-gentu-csv', csv: text, how, at: Date.now() }, OMS);
      sent++;
      say('export captured and sent to the omsref window (' + (text.split(/\\r?\\n/).length - 1) + ' rows). Check the totals there and click Save.');
    } catch (e) {
      say('captured, but the browser blocked sending it. Drop the downloaded CSV into the omsref window instead.');
    }
    return true;
  };

  // 1. Blob downloads (URL.createObjectURL)
  const origCOU = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    try { if (obj instanceof Blob && obj.size < 20e6) obj.text().then(t => send(t, 'blob')).catch(() => {}); } catch (e) {}
    return origCOU.apply(this, arguments);
  };
  // 2. fetch responses
  const origFetch = window.fetch;
  window.fetch = function () {
    return origFetch.apply(this, arguments).then(res => {
      try {
        const ct = res.headers.get('content-type') || '';
        if (/csv|text\\/plain|octet-stream/i.test(ct)) res.clone().text().then(t => send(t, 'fetch')).catch(() => {});
      } catch (e) {}
      return res;
    });
  };
  // 3. XHR responses
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function () {
    this.addEventListener('load', function () {
      try {
        const ct = this.getResponseHeader('content-type') || '';
        if (/csv|text\\/plain|octet-stream/i.test(ct) && (this.responseType === '' || this.responseType === 'text')) send(this.responseText, 'xhr');
        else if (this.responseType === 'blob' && this.response instanceof Blob) this.response.text().then(t => send(t, 'xhr-blob')).catch(() => {});
      } catch (e) {}
    });
    return origOpen.apply(this, arguments);
  };
  // 4. Export links that trigger a normal download
  const onClick = ev => {
    const a = ev.target && ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    const href = a.href;
    if (!href || /^(blob:|javascript:|data:)/.test(href)) return;
    if (a.hasAttribute('download') || /csv|export/i.test(href)) {
      origFetch(href, { credentials: 'include' }).then(r => r.text()).then(t => send(t, 'link')).catch(() => {});
    }
  };
  document.addEventListener('click', onClick, true);

  const stop = () => {
    URL.createObjectURL = origCOU; window.fetch = origFetch; XMLHttpRequest.prototype.open = origOpen;
    document.removeEventListener('click', onClick, true); box.remove(); delete window.__omsrefPull;
  };
  close.onclick = stop;
  window.__omsrefPull = { reopen: () => { rx = window.open(RX_URL, 'omsref_gentu', 'width=560,height=720'); }, stop };
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

/** Message shape posted from Gentu to the receiver window. */
export interface GentuCsvMessage { type: 'omsref-gentu-csv'; csv: string; how: string; at: number }

export const GENTU_ORIGIN = /^https:\/\/([a-z0-9-]+\.)*gentu\.io$/i
