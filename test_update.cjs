const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/update_leave',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log("update_leave response:", res.statusCode, data); });
});
req.write(JSON.stringify({ id: 1, status: "approved" }));
req.end();
