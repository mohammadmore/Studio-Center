const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, res => {
  const cookie = res.headers['set-cookie'];
  if (!cookie) {
    console.log('Login failed');
    return;
  }
  
  const req2 = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/save_leave',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cookie': cookie[0] }
  }, res2 => {
    let data = '';
    res2.on('data', c => data += c);
    res2.on('end', () => console.log("Response:", res2.statusCode, data));
  });
  req2.write(JSON.stringify({ user_id: "1", substitute_id: "2", start_date: "1402", end_date: "1402" }));
  req2.end();
});
req.write(JSON.stringify({ username: "admin", password: "password" }));
req.end();
