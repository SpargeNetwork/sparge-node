(function initExplorerTx(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpargeExplorerTx = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function explorerTxFactory() {
  const TXID_RE = /^[0-9a-f]{64}$/;

  function normalizeTxid(value) {
    const txid = String(value ?? '').trim();
    return TXID_RE.test(txid) ? txid : null;
  }

  function txHref(value) {
    const txid = normalizeTxid(value);
    return txid ? `/tx/${encodeURIComponent(txid)}` : null;
  }

  function apiPath(value) {
    const txid = normalizeTxid(value);
    return txid ? `/api/tx/${encodeURIComponent(txid)}` : null;
  }

  function parseTxPath(pathname) {
    const match = String(pathname || '').match(/^\/tx\/([^/]+)\/?$/);
    if (!match) return null;
    try {
      return normalizeTxid(decodeURIComponent(match[1]));
    } catch {
      return null;
    }
  }

  function reference(value, shorten) {
    const raw = String(value ?? '').trim();
    const txid = normalizeTxid(raw);
    return {
      txid,
      href: txid ? txHref(txid) : null,
      display: typeof shorten === 'function' ? shorten(raw) : raw,
      copyValue: txid
    };
  }

  return { TXID_RE, normalizeTxid, txHref, apiPath, parseTxPath, reference };
}));
