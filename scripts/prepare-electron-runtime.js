const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'dist');
const runtimeDir = path.join(root, 'electron', 'runtime');

const required = ['SpargeObserver.exe', 'better_sqlite3.node', 'config.yml', 'public'];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

if (!fs.existsSync(srcDir)) {
  console.error(`Missing source runtime directory: ${srcDir}`);
  process.exit(1);
}

fs.rmSync(runtimeDir, { recursive: true, force: true });
fs.mkdirSync(runtimeDir, { recursive: true });

for (const item of required) {
  const src = path.join(srcDir, item);
  if (!fs.existsSync(src)) {
    console.error(`Missing required runtime asset: ${src}`);
    process.exit(1);
  }
  const mappedName = item === 'SpargeObserver.exe' ? 'SpargeObserver.bin' : item;
  const dest = path.join(runtimeDir, mappedName);
  copyRecursive(src, dest);
}

console.log(`Prepared Electron runtime at ${runtimeDir}`);
