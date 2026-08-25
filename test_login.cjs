const http = require('http');

const loginOptions = {
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
};

const req = http.request(loginOptions, (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => { 
    console.log("login:", res.statusCode, data); 
    const cookie = res.headers['set-cookie'] ? res.headers['set-cookie'][0] : null;
    if (cookie) {
        console.log("Got cookie:", cookie);
    }
  });
});
req.write(JSON.stringify({ username: 'admin', password: 'password' })); // replace with real login if needed
req.end();
