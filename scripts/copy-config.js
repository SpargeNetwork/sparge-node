const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const src = path.join(__dirname, '..', 'config', 'config.yml');
const dest = path.join(__dirname, '..', 'dist', 'config.yml');

if (!fs.existsSync(src)) {
  console.error(`Missing config at ${src}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dest), { recursive: true });
const config = YAML.parse(fs.readFileSync(src, 'utf8')) || {};
config.observerDownloads = {
  enabled: false,
  version: '',
  releaseDate: '',
  windowsInstaller: {
    url: '',
    fileName: '',
    fileSizeBytes: 0,
    checksumSha256: ''
  }
};
fs.writeFileSync(dest, YAML.stringify(config), 'utf8');
console.log(`Copied config to ${dest}`);
