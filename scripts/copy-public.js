const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..', 'public');
const destDir = path.join(__dirname, '..', 'dist', 'public');

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
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

copyRecursive(srcDir, destDir);
console.log(`Copied public assets to ${destDir}`);
