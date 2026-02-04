const logEl = document.getElementById('smokeLog');
const statusEl = document.getElementById('smokeStatus');

function log(message) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.innerHTML = `<span>*</span><span>${message}</span>`;
  logEl.appendChild(row);
}

function updateStatus(label, value) {
  const row = document.createElement('div');
  row.className = 'detail-row';
  row.innerHTML = `<span>${label}</span><span>${value}</span>`;
  statusEl.appendChild(row);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function base64UrlToBytes(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + '='.repeat(padLen);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64Url(bytes) {
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Encode(bytes) {
  if (!bytes.length) return '';
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros += 1;
  const digits = [];
  for (let i = zeros; i < bytes.length; i += 1) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j += 1) {
      const val = digits[j] * 256 + carry;
      digits[j] = val % 58;
      carry = Math.floor(val / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let result = '1'.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    result += BASE58_ALPHABET[digits[i]];
  }
  return result;
}

async function sha256Bytes(data) {
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(buffer);
}

async function deriveAddress(publicKeyHex) {
  const pubKeyBytes = hexToBytes(publicKeyHex);
  const hash = await sha256Bytes(pubKeyBytes);
  const addressBytes = hash.slice(0, 20);
  return `spg_${base58Encode(addressBytes)}`;
}

async function createWallet() {
  const keyPair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const publicKeyHex = bytesToHex(base64UrlToBytes(publicJwk.x));
  const privateKeyHex = bytesToHex(base64UrlToBytes(privateJwk.d));
  const address = await deriveAddress(publicKeyHex);
  return { address, publicKeyHex, privateKeyHex };
}

function buildMessage(tx) {
  const base = [
    tx.type,
    tx.chainId,
    tx.from,
    tx.to,
    tx.amountMicro,
    tx.feeMicro,
    tx.nonce,
    tx.publicKeyHex,
    tx.sponsor || '',
    tx.participant || ''
  ].join('|');
  if (tx.memo) return `${base}|${tx.memo}`;
  return base;
}

async function signMessage(message, wallet) {
  const digest = await sha256Bytes(new TextEncoder().encode(message));
  const jwk = {
    kty: 'OKP',
    crv: 'Ed25519',
    x: bytesToBase64Url(hexToBytes(wallet.publicKeyHex)),
    d: bytesToBase64Url(hexToBytes(wallet.privateKeyHex))
  };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'Ed25519' }, false, ['sign']);
  const signature = await crypto.subtle.sign('Ed25519', key, digest);
  return bytesToHex(new Uint8Array(signature));
}

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  return { res, data };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { res, data };
}

async function registerParticipant(wallet, feeMicro, chainId) {
  const nonceRes = await fetchJson(`/api/nonce/${wallet.address}`);
  const nonce = String(nonceRes.data.nonce ?? '0');
  const tx = {
    type: 'register_participant',
    chainId,
    from: wallet.address,
    to: '',
    amountMicro: '0',
    feeMicro,
    nonce,
    publicKeyHex: wallet.publicKeyHex,
    sponsor: wallet.address,
    participant: wallet.address,
    memo: ''
  };
  const message = buildMessage(tx);
  const signatureHex = await signMessage(message, wallet);
  return postJson('/api/tx', { ...tx, signatureHex });
}

async function heartbeat(wallet, feeMicro, chainId) {
  const nonceRes = await fetchJson(`/api/nonce/${wallet.address}`);
  const nonce = String(nonceRes.data.nonce ?? '0');
  const tx = {
    type: 'heartbeat',
    chainId,
    from: wallet.address,
    to: '',
    amountMicro: '0',
    feeMicro,
    nonce,
    publicKeyHex: wallet.publicKeyHex,
    sponsor: '',
    participant: '',
    memo: ''
  };
  const message = buildMessage(tx);
  const signatureHex = await signMessage(message, wallet);
  return postJson('/api/tx', { ...tx, signatureHex });
}

async function run() {
  log('Creating wallet A...');
  const walletA = await createWallet();
  log(`Wallet A: ${walletA.address}`);
  log('Creating wallet B...');
  const walletB = await createWallet();
  log(`Wallet B: ${walletB.address}`);

  const status = await fetchJson('/api/status');
  const chainId = status.data.chainId;
  const minFeeMicro = BigInt(status.data.minFeeMicro || '0');
  updateStatus('Chain ID', chainId);
  updateStatus('Min Fee (micro)', minFeeMicro.toString());

  log('Waiting for funding (bond + fee) on Wallet A...');
  const bondMicro = 50_000n * 1_000_000n;
  const required = bondMicro + minFeeMicro;
  let balanceA = 0n;
  let attempts = 0;
  while (balanceA < required && attempts < 30) {
    const bal = await fetchJson(`/api/balance/${walletA.address}`);
    balanceA = BigInt(bal.data.balanceMicro || '0');
    updateStatus('Wallet A balance', balanceA.toString());
    await new Promise((r) => setTimeout(r, 4000));
    attempts += 1;
  }
  if (balanceA < required) {
    log('Wallet A not funded. Transfer funds from a funded wallet, then reload.');
    return;
  }

  log('Registering Wallet A as participant...');
  const regA = await registerParticipant(walletA, minFeeMicro.toString(), chainId);
  log(`Register A: ${regA.res.status} ${JSON.stringify(regA.data)}`);

  log('Registering Wallet B as participant (requires funds).');
  log('If Wallet B lacks funds, transfer from Wallet A and reload.');
  const balB = await fetchJson(`/api/balance/${walletB.address}`);
  const balanceB = BigInt(balB.data.balanceMicro || '0');
  if (balanceB >= required) {
    const regB = await registerParticipant(walletB, minFeeMicro.toString(), chainId);
    log(`Register B: ${regB.res.status} ${JSON.stringify(regB.data)}`);
  } else {
    log('Wallet B not funded; skipping registration.');
  }

  log('Waiting for a few blocks...');
  await new Promise((r) => setTimeout(r, 15000));
  const addrA = await fetchJson(`/api/address/${walletA.address}`);
  const addrB = await fetchJson(`/api/address/${walletB.address}`);
  updateStatus('Wallet A participant status', addrA.data.participant?.status || 'unregistered');
  updateStatus('Wallet B participant status', addrB.data.participant?.status || 'unregistered');
  const preBalanceA = BigInt(addrA.data.balanceMicro || '0');
  const preSeenA = addrA.data.participant?.lastSeenHeight || '0';

  log('Sending heartbeat from Wallet A...');
  const hb = await heartbeat(walletA, minFeeMicro.toString(), chainId);
  log(`Heartbeat: ${hb.res.status} ${JSON.stringify(hb.data)}`);
  await new Promise((r) => setTimeout(r, 6000));
  const addrA2 = await fetchJson(`/api/address/${walletA.address}`);
  const postSeenA = addrA2.data.participant?.lastSeenHeight || '0';
  const postBalanceA = BigInt(addrA2.data.balanceMicro || '0');
  updateStatus('Wallet A lastSeen', `${preSeenA} -> ${postSeenA}`);
  updateStatus('Wallet A balance', `${preBalanceA.toString()} -> ${postBalanceA.toString()}`);
  const pass = addrA2.data.participant?.status === 'active' && BigInt(postSeenA) >= BigInt(preSeenA);
  log(pass ? 'PASS: participant active + heartbeat updated' : 'FAIL: heartbeat or status not updated');
  updateStatus('Result', pass ? 'PASS' : 'FAIL');
  log('Smoke test complete.');
}

run().catch((err) => {
  log(`Error: ${err.message || err}`);
});
