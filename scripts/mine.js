const http = require('http');

const command = (process.argv[2] || 'status').toLowerCase();
const port = process.env.PORT || 3051;

const actionMap = {
  start: 'start',
  stop: 'stop',
  status: 'status'
};

const action = actionMap[command];
if (!action) {
  console.error('Usage: npm run mine:start | mine:stop | mine:status');
  process.exit(1);
}

const path = `/api/mining/${action}`;
const method = action === 'status' ? 'GET' : 'POST';

const req = http.request(
  {
    hostname: 'localhost',
    port,
    path,
    method,
    headers: { 'Content-Type': 'application/json' }
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        console.log(json);
      } catch {
        console.log(data);
      }
    });
  }
);

req.on('error', (err) => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});

req.end();
