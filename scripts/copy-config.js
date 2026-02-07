const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'config', 'config.yml');
const dest = path.join(__dirname, '..', 'dist', 'config.yml');

if (!fs.existsSync(src)) {
  console.error(`Missing config at ${src}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.copyFileSync(src, dest);
console.log(`Copied config to ${dest}`);
