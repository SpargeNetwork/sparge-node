const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { toBaseUnits } = require('../server/lib/units');
const {
  deriveAddress,
  buildMessage,
  createTxId,
  signMessage
} = require('../server/lib/tx');

const defaultWalletPath = path.join(__dirname, '..', 'server', 'data', 'wallet.json');

function parseArgs(args) {
  const parsed = { _: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = args[i + 1];
      parsed[key] = value;
      i += 1;
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

function loadWallet(walletPath) {
  const raw = fs.readFileSync(walletPath, 'utf8');
  return JSON.parse(raw);
}

function ensureDecimalInput(value, label, decimals) {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) {
    throw new Error(`${label} must be a decimal string`);
  }
  const parts = value.split('.');
  const fraction = parts[1] || '';
  if (fraction.length > decimals) {
    throw new Error(`${label} has too many decimal places`);
  }
}

function tokensToMicro(value, decimals, label) {
  ensureDecimalInput(value, label, decimals);
  return toBaseUnits(value, decimals).toString();
}

function requestJson(url, options = {}) {
  const target = new URL(url);
  const isHttps = target.protocol === 'https:';
  const client = isHttps ? https : http;
  const payload = options.body ? Buffer.from(JSON.stringify(options.body)) : null;

  const requestOptions = {
    method: options.method || 'GET',
    hostname: target.hostname,
    port: target.port || (isHttps ? 443 : 80),
    path: `${target.pathname}${target.search}`,
    headers: options.headers || {}
  };

  if (payload) {
    requestOptions.headers['Content-Type'] = 'application/json';
    requestOptions.headers['Content-Length'] = payload.length;
  }

  return new Promise((resolve, reject) => {
    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data || '{}');
          resolve({ status: res.statusCode || 0, data: parsed });
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function sendTx(parsed) {
  const to = parsed.to;
  const amount = parsed.amount;
  const fee = parsed.fee;
  const memo = parsed.memo;
  if (!to || !amount || !fee) {
    throw new Error('Usage: npm run tx send --to <address> --amount <tokens> --fee <tokens> [--memo "..."]');
  }

  const node = parsed.node || 'http://localhost:3051';
  const walletPath = parsed.wallet || defaultWalletPath;
  const wallet = loadWallet(walletPath);

  const statusRes = await requestJson(`${node}/api/status`);
  if (statusRes.status !== 200) {
    throw new Error(`Failed to fetch status: ${statusRes.status}`);
  }
  const chainId = statusRes.data.chainId;
  const decimals = Number(statusRes.data.decimals ?? 6);
  const minFeeMicro = statusRes.data.minFeeMicro ?? statusRes.data.baseFeeMicro ?? '0';

  const from = wallet.address;
  const derived = deriveAddress(wallet.publicKeyHex);
  if (derived !== from) {
    throw new Error('Wallet address does not match public key');
  }

  const nonceRes = await requestJson(`${node}/api/nonce/${from}`);
  if (nonceRes.status !== 200) {
    throw new Error(`Failed to fetch nonce: ${nonceRes.status}`);
  }
  const nonce = String(nonceRes.data.nonce ?? '0');

  const amountMicro = tokensToMicro(amount, decimals, 'amount');
  const feeMicro = tokensToMicro(fee, decimals, 'fee');

  if (BigInt(feeMicro) < BigInt(minFeeMicro || '0')) {
    console.warn(`Warning: feeMicro ${feeMicro} is below minFeeMicro ${minFeeMicro}`);
  }

  if (memo && memo.length > 128) {
    throw new Error('memo must be <= 128 chars');
  }

  const tx = {
    type: 'transfer',
    chainId,
    from,
    to,
    amountMicro,
    feeMicro,
    nonce,
    publicKeyHex: wallet.publicKeyHex,
    sponsor: '',
    participant: '',
    memo: memo || ''
  };

  const message = buildMessage(tx);
  const txid = createTxId(tx);
  const signatureHex = signMessage(tx, wallet.privateKeyHex);

  const submit = await requestJson(`${node}/api/tx`, {
    method: 'POST',
    body: {
      ...tx,
      signatureHex,
      txid
    }
  });

  console.log(`Message: ${message}`);
  console.log(`TxID: ${txid}`);
  console.log(`Response (${submit.status}):`, submit.data);
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed._[0];

  if (!command || command === 'help') {
    console.log('Usage: npm run tx send --to <address> --amount <tokens> --fee <tokens> [--memo "..."]');
    return;
  }

  if (command === 'send') {
    await sendTx(parsed);
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
