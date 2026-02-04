const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { deriveAddress, base64UrlToBuffer, sha256Hex } = require('../server/lib/tx');

const walletPath = path.join(__dirname, '..', 'server', 'data', 'wallet.json');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function loadWallet() {
  if (!fs.existsSync(walletPath)) return null;
  const raw = fs.readFileSync(walletPath, 'utf8');
  if (!raw.trim()) return null;
  return JSON.parse(raw);
}

function saveWallet(wallet) {
  ensureDir(walletPath);
  const tmpPath = `${walletPath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(wallet, null, 2), 'utf8');
  fs.renameSync(tmpPath, walletPath);
}

function createWallet(force = false) {
  if (fs.existsSync(walletPath) && !force) {
    console.error('Wallet already exists. Use --force to overwrite.');
    process.exit(1);
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicJwk = publicKey.export({ format: 'jwk' });
  const privateJwk = privateKey.export({ format: 'jwk' });
  const publicKeyHex = base64UrlToBuffer(publicJwk.x).toString('hex');
  const privateKeyHex = base64UrlToBuffer(privateJwk.d).toString('hex');
  const address = deriveAddress(publicKeyHex);

  const wallet = {
    createdAt: new Date().toISOString(),
    address,
    publicKeyHex: publicKeyHex.toLowerCase(),
    privateKeyHex: privateKeyHex.toLowerCase(),
    checksum: sha256Hex(Buffer.from(address, 'utf8'))
  };

  saveWallet(wallet);
  console.log('Wallet created.');
  console.log(`Address: ${address}`);
}

function showWallet(showPrivate = false) {
  const wallet = loadWallet();
  if (!wallet) {
    console.error('No wallet found. Run: node scripts/wallet.js create');
    process.exit(1);
  }
  console.log(`Address: ${wallet.address}`);
  console.log(`Public Key: ${wallet.publicKeyHex}`);
  if (showPrivate) {
    console.log(`Private Key: ${wallet.privateKeyHex}`);
  }
}

function printHelp() {
  console.log('Usage: node scripts/wallet.js <create|show> [--force] [--full]');
}

const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  printHelp();
  process.exit(1);
}

if (command === 'create') {
  createWallet(args.includes('--force'));
} else if (command === 'show') {
  showWallet(args.includes('--full'));
} else {
  printHelp();
  process.exit(1);
}
