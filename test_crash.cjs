const http = require('http');

// Authenticate and save leave to see if server crashes
const loginReq = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/api/login',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' }
}, (res) => {
  const cookie = res.headers['set-cookie'];
  
  const leaveData = JSON.stringify({
    user_id: 1,
    substitute_id: 2,
    start_date: "1402/01/01",
    end_date: "1402/01/02"
  });

  const leaveReq = http.request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/save_leave',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
      'Content-Length': leaveData.length
    }
  }, (res2) => {
    console.log(`STATUS: ${res2.statusCode}`);
    res2.setEncoding('utf8');
    res2.on('data', (chunk) => console.log(chunk));
  });
  
  leaveReq.on('error', (e) => console.error(e));
  leaveReq.write(leaveData);
  leaveReq.end();
});

loginReq.write(JSON.stringify({ username: 'admin', password: '123' }));
loginReq.end();
