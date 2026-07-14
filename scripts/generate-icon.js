const fs = require('fs');
const path = require('path');
const pngToIco = require('png-to-ico');

async function main() {
  const src = path.join(__dirname, '..', 'public', 'assets', 'observer-node.png');
  const outDir = path.join(__dirname, '..', 'build');
  const dest = path.join(outDir, 'icon.ico');

  if (!fs.existsSync(src)) {
    throw new Error(`Missing source icon: ${src}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const ico = await pngToIco(src);
  fs.writeFileSync(dest, ico);
  console.log(`Generated icon: ${dest}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
