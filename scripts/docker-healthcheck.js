const http = require('http');

const port = Number(process.env.PORT || 3051);
const timeoutMs = Number(process.env.HEALTHCHECK_TIMEOUT_MS || 4000);

const req = http.get({
  hostname: '127.0.0.1',
  port,
  path: '/api/status',
  timeout: timeoutMs
}, (res) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    if (res.statusCode !== 200) {
      process.exit(1);
      return;
    }
    let status;
    try {
      status = JSON.parse(body);
    } catch {
      process.exit(1);
      return;
    }
    if (!status || status.healthy === false || status.chainHealthy === false || status.storageHealthy === false) {
      process.exit(1);
      return;
    }
    if (status.nodeMode === 'observer' && status.syncState === 'error') {
      process.exit(1);
      return;
    }
    process.exit(0);
  });
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.on('error', () => {
  process.exit(1);
});
