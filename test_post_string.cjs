const http = require('http');
const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/save_leave',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log("Response:", res.statusCode, data));
});
req.write(JSON.stringify({ user_id: "1", substitute_id: "2", start_date: "1402", end_date: "1402" }));
req.end();
