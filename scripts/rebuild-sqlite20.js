const { spawnSync } = require('child_process');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'node_modules', 'better-sqlite3');
const cmd = process.platform === 'win32' ? 'cmd.exe' : 'sh';
const args = process.platform === 'win32'
  ? ['/d', '/s', '/c', 'npx prebuild-install --runtime=node --target=20.20.0 --platform=win32 --arch=x64']
  : ['-c', 'npx prebuild-install --runtime=node --target=20.20.0 --platform=win32 --arch=x64'];

const result = spawnSync(cmd, args, { stdio: 'inherit', cwd: baseDir, env: process.env });
process.exit(result.status || 0);
