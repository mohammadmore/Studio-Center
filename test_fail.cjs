const http = require('http');

const data = JSON.stringify({
  user_id: 1,
  substitute_id: 2,
  start_date: "1402/01/01",
  end_date: "1402/01/02"
});

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  const cookie = res.headers['set-cookie'];
  const req2 = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/save_leave',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      'Content-Length': data.length
    }
  }, (res2) => {
    console.log(`STATUS: ${res2.statusCode}`);
    res2.setEncoding('utf8');
    res2.on('data', (chunk) => {
      console.log(`BODY: ${chunk}`);
    });
  });
  req2.write(data);
  req2.end();
});

req.write(JSON.stringify({ username: 'admin', password: 'password' }));
req.end();
