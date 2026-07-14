const http = require('http');

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function parseLoopbackUrl(value) {
  const parsed = new URL(String(value || ''));
  if (parsed.protocol !== 'http:' || !LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('Observer desktop URLs must use a loopback HTTP address');
  }
  return parsed;
}

function requestJson(url, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: 'GET', timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 64 * 1024) req.destroy(new Error('Local endpoint response is too large'));
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`Local endpoint returned HTTP ${res.statusCode}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error('Local endpoint returned invalid JSON'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Local endpoint request timed out')));
    req.end();
  });
}

async function verifyObserverUrl(value, timeoutMs) {
  const parsed = parseLoopbackUrl(value);
  const status = await requestJson(new URL('/api/status', parsed), timeoutMs);
  if (status?.nodeMode !== 'observer') {
    throw new Error('Local endpoint is not a Sparge observer');
  }
  return new URL('/', parsed).toString();
}

async function verifySetupUrl(value, timeoutMs) {
  const parsed = parseLoopbackUrl(value);
  const defaults = await requestJson(new URL('/setup/defaults', parsed), timeoutMs);
  if (typeof defaults?.producerUrl !== 'string' || !Number.isInteger(Number(defaults?.port))) {
    throw new Error('Local endpoint is not the Sparge observer setup service');
  }
  return new URL('/setup', parsed).toString();
}

module.exports = {
  parseLoopbackUrl,
  requestJson,
  verifyObserverUrl,
  verifySetupUrl
};
