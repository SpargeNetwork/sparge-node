(function initWalletStore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SpargeWalletStore = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function walletStoreFactory() {
  const LEGACY_KEY = 'sparge_dev_wallet';
  const COLLECTION_KEY = 'sparge_wallets_v1';
  const SELECTED_KEY = 'sparge_selected_wallet_v1';
  const VERSION = 1;

  function cleanName(value, fallback = 'Wallet') {
    const name = String(value || '').trim().replace(/\s+/g, ' ');
    if (!name) return fallback;
    return name.slice(0, 40);
  }

  function normalizeWallet(value, fallbackName = 'Wallet') {
    if (!value || typeof value !== 'object') return null;
    const address = String(value.address || '');
    const publicKeyHex = String(value.publicKeyHex || '');
    const privateKeyHex = String(value.privateKeyHex || '');
    if (!address.startsWith('spg_') || publicKeyHex.length !== 64 || privateKeyHex.length !== 64) return null;
    return {
      id: address,
      name: cleanName(value.name, fallbackName),
      address,
      publicKeyHex,
      privateKeyHex,
      createdAt: value.createdAt || new Date().toISOString()
    };
  }

  function legacyPayload(wallet) {
    if (!wallet) return null;
    return {
      address: wallet.address,
      publicKeyHex: wallet.publicKeyHex,
      privateKeyHex: wallet.privateKeyHex,
      createdAt: wallet.createdAt
    };
  }

  function createRegistry(storage) {
    if (!storage) throw new Error('Wallet storage is unavailable.');
    let state = { version: VERSION, wallets: [], selectedId: '' };

    function persist() {
      storage.setItem(COLLECTION_KEY, JSON.stringify({ version: VERSION, wallets: state.wallets }));
      if (state.selectedId) storage.setItem(SELECTED_KEY, state.selectedId);
      else storage.removeItem(SELECTED_KEY);
      const selected = getSelected();
      if (selected) storage.setItem(LEGACY_KEY, JSON.stringify(legacyPayload(selected)));
      else storage.removeItem(LEGACY_KEY);
    }

    function initialize() {
      let collection = null;
      try {
        collection = JSON.parse(storage.getItem(COLLECTION_KEY) || 'null');
      } catch {
        collection = null;
      }

      const wallets = Array.isArray(collection?.wallets)
        ? collection.wallets
          .map((wallet, index) => normalizeWallet(wallet, `Wallet ${index + 1}`))
          .filter(Boolean)
          .filter((wallet, index, all) => all.findIndex((entry) => entry.id === wallet.id) === index)
        : [];

      if (!wallets.length) {
        try {
          const legacy = normalizeWallet(JSON.parse(storage.getItem(LEGACY_KEY) || 'null'), 'Wallet 1');
          if (legacy) wallets.push(legacy);
        } catch {
          // Invalid legacy data is ignored; no key material is modified.
        }
      }

      const requestedId = storage.getItem(SELECTED_KEY) || '';
      state = {
        version: VERSION,
        wallets,
        selectedId: wallets.some((wallet) => wallet.id === requestedId) ? requestedId : (wallets[0]?.id || '')
      };
      persist();
      return getSnapshot();
    }

    function getSnapshot() {
      return {
        version: state.version,
        selectedId: state.selectedId,
        wallets: state.wallets.map((wallet) => ({ ...wallet }))
      };
    }

    function list() {
      return state.wallets.map((wallet) => ({ ...wallet }));
    }

    function getSelected() {
      const wallet = state.wallets.find((entry) => entry.id === state.selectedId);
      return wallet ? { ...wallet } : null;
    }

    function add(wallet, name) {
      const normalized = normalizeWallet({ ...wallet, name }, `Wallet ${state.wallets.length + 1}`);
      if (!normalized) throw new Error('Invalid wallet backup.');
      if (state.wallets.some((entry) => entry.address === normalized.address)) {
        throw new Error('This wallet is already available.');
      }
      state.wallets.push(normalized);
      state.selectedId = normalized.id;
      persist();
      return { ...normalized };
    }

    function select(id) {
      if (!state.wallets.some((wallet) => wallet.id === id)) throw new Error('Wallet not found.');
      state.selectedId = id;
      persist();
      return getSelected();
    }

    function rename(id, name) {
      const wallet = state.wallets.find((entry) => entry.id === id);
      if (!wallet) throw new Error('Wallet not found.');
      wallet.name = cleanName(name, wallet.name);
      persist();
      return { ...wallet };
    }

    function remove(id) {
      const index = state.wallets.findIndex((entry) => entry.id === id);
      if (index < 0) throw new Error('Wallet not found.');
      const removed = state.wallets.splice(index, 1)[0];
      if (state.selectedId === id) {
        state.selectedId = state.wallets[Math.min(index, state.wallets.length - 1)]?.id || '';
      }
      persist();
      return { ...removed };
    }

    return { initialize, getSnapshot, list, getSelected, add, select, rename, remove };
  }

  return { LEGACY_KEY, COLLECTION_KEY, SELECTED_KEY, VERSION, createRegistry, normalizeWallet };
}));
