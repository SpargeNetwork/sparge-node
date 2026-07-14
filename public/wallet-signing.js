(function initWalletSigning(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpargeWalletSigning = api;
}(typeof window !== 'undefined' ? window : globalThis, () => {
  class SigningRequestRejectedError extends Error {
    constructor() {
      super('Signing request rejected by user.');
      this.name = 'SigningRequestRejectedError';
      this.code = 'SIGNING_REJECTED';
    }
  }

  function normalizeRequest(input) {
    const request = input && typeof input === 'object' ? input : {};
    const kind = request.kind === 'message' ? 'message' : request.kind === 'transaction' ? 'transaction' : '';
    if (!kind) throw new Error('Signing request kind must be message or transaction.');
    if (typeof request.onConfirm !== 'function') throw new Error('Signing request requires an explicit confirmation callback.');
    const wallet = String(request.wallet || '').trim();
    if (!wallet.startsWith('spg_')) throw new Error('Signing request requires the selected wallet address.');
    const payload = Array.isArray(request.payload)
      ? request.payload.slice(0, 20).map((field) => ({
        label: String(field?.label || '').trim().slice(0, 80),
        value: String(field?.value ?? '').slice(0, 2048),
        mono: field?.mono === true
      })).filter((field) => field.label)
      : [];
    return {
      kind,
      type: String(request.type || kind).trim().slice(0, 80),
      title: String(request.title || (kind === 'message' ? 'Sign Message' : 'Sign Transaction')).trim().slice(0, 120),
      description: String(request.description || '').trim().slice(0, 1000),
      wallet,
      network: String(request.network || '').trim().slice(0, 120),
      fee: String(request.fee ?? (kind === 'message' ? 'No fee' : '')).trim().slice(0, 120),
      payload,
      rawMessage: String(request.rawMessage || ''),
      hash: String(request.hash || '').trim().slice(0, 256),
      danger: request.danger === true,
      consequence: String(request.consequence || '').trim().slice(0, 1000),
      confirmLabel: String(request.confirmLabel || (kind === 'message' ? 'Sign Message' : 'Sign & Broadcast')).trim().slice(0, 80),
      onConfirm: request.onConfirm,
      onReject: typeof request.onReject === 'function' ? request.onReject : null
    };
  }

  function createController(doc = document) {
    const dialog = doc.getElementById('signingConfirmationDialog');
    if (!dialog) return null;
    const elements = {
      icon: doc.getElementById('signingIcon'),
      eyebrow: doc.getElementById('signingEyebrow'),
      title: doc.getElementById('signingTitle'),
      description: doc.getElementById('signingDescription'),
      kind: doc.getElementById('signingKind'),
      wallet: doc.getElementById('signingWallet'),
      network: doc.getElementById('signingNetwork'),
      fee: doc.getElementById('signingFee'),
      payload: doc.getElementById('signingPayload'),
      messagePanel: doc.getElementById('signingMessagePanel'),
      message: doc.getElementById('signingMessage'),
      rawMessage: doc.getElementById('signingRawMessage'),
      hash: doc.getElementById('signingHash'),
      consequence: doc.getElementById('signingConsequence'),
      status: doc.getElementById('signingStatus'),
      reject: doc.getElementById('signingReject'),
      confirm: doc.getElementById('signingConfirm'),
      copyMessage: doc.getElementById('signingCopyMessage'),
      copyHash: doc.getElementById('signingCopyHash')
    };
    let active = null;

    function setStatus(message, error = false) {
      elements.status.textContent = message || '';
      elements.status.classList.toggle('error', error);
    }

    function addPayloadRow(label, value, mono = false) {
      const row = doc.createElement('div');
      row.className = 'signing-field';
      const key = doc.createElement('span');
      const content = doc.createElement('strong');
      key.textContent = label;
      content.textContent = value || '-';
      if (mono) content.classList.add('mono');
      row.append(key, content);
      elements.payload.appendChild(row);
    }

    function render(request) {
      dialog.classList.toggle('message-signing', request.kind === 'message' && !request.danger);
      dialog.classList.toggle('transaction-signing', request.kind === 'transaction' && !request.danger);
      dialog.classList.toggle('danger-signing', request.danger);
      elements.icon.src = request.kind === 'message' ? '/assets/loyal.png' : '/assets/tx.png';
      elements.eyebrow.textContent = request.kind === 'message' ? 'Message signature' : 'Transaction signature';
      elements.title.textContent = request.title;
      elements.description.textContent = request.description;
      elements.kind.textContent = request.kind === 'message' ? 'Signed message only' : 'Blockchain transaction';
      elements.wallet.textContent = request.wallet;
      elements.network.textContent = request.network || (request.kind === 'message' ? 'Off-chain' : '-');
      elements.fee.textContent = request.kind === 'message' ? '0 SPRG' : (request.fee || '-');
      elements.payload.replaceChildren();
      request.payload.forEach((field) => addPayloadRow(field.label, field.value, field.mono));
      elements.messagePanel.classList.toggle('hidden', request.kind !== 'message');
      elements.message.textContent = request.rawMessage;
      elements.rawMessage.textContent = request.rawMessage;
      elements.hash.textContent = request.hash || '-';
      elements.consequence.textContent = request.consequence || (request.kind === 'message'
        ? 'This proves wallet control only. It sends no funds, creates no transaction, exposes no private key, and costs no SPRG.'
        : 'This transaction will be broadcast to the Sparge network. Once confirmed in a block, it cannot be reversed.');
      elements.confirm.textContent = request.confirmLabel;
      elements.confirm.classList.toggle('danger', request.danger);
      elements.confirm.classList.toggle('primary', !request.danger);
      elements.reject.textContent = request.kind === 'message' ? 'Cancel' : 'Reject';
      setStatus('');
    }

    function finishRejected() {
      if (!active) return;
      const current = active;
      active = null;
      dialog.close();
      current.request.onReject?.();
      current.reject(new SigningRequestRejectedError());
    }

    async function confirm() {
      if (!active) return;
      elements.confirm.disabled = true;
      elements.reject.disabled = true;
      setStatus(active.request.kind === 'message' ? 'Signing message locally...' : 'Signing and broadcasting transaction...');
      try {
        const result = await active.request.onConfirm();
        const current = active;
        active = null;
        dialog.close();
        current.resolve(result);
      } catch (err) {
        setStatus(err?.message || 'Signing request failed.', true);
      } finally {
        elements.confirm.disabled = false;
        elements.reject.disabled = false;
      }
    }

    async function copy(value, button) {
      if (!value) return;
      try {
        await navigator.clipboard.writeText(value);
        const original = button.textContent;
        button.textContent = 'Copied';
        setTimeout(() => { button.textContent = original; }, 1200);
      } catch {
        setStatus('Unable to copy in this browser.', true);
      }
    }

    elements.reject.addEventListener('click', finishRejected);
    elements.confirm.addEventListener('click', confirm);
    elements.copyMessage.addEventListener('click', () => copy(active?.request.rawMessage, elements.copyMessage));
    elements.copyHash.addEventListener('click', () => copy(active?.request.hash, elements.copyHash));
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!elements.confirm.disabled) finishRejected();
    });

    function request(input) {
      if (active) return Promise.reject(new Error('Another signing request is already open.'));
      const normalized = normalizeRequest(input);
      render(normalized);
      dialog.showModal();
      elements.reject.focus();
      return new Promise((resolve, reject) => {
        active = { request: normalized, resolve, reject };
      });
    }

    return { request, isOpen: () => Boolean(active) };
  }

  return { SigningRequestRejectedError, normalizeRequest, createController };
}));
