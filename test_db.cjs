const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/save_leave',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  console.log("Status Code:", res.statusCode);
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => console.log("Response:", data));
});
req.write(JSON.stringify({ user_id: "1", substitute_id: "2", start_date: "1402", end_date: "1402" }));
req.end();
