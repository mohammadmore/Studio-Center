const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/get_leaves',
  method: 'GET',
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { console.log("get_leaves:", res.statusCode, data); });
});
req.end();
