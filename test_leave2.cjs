const http = require('http');
const data = JSON.stringify({
  user_id: 1,
  substitute_id: 2,
  start_date: "1405/05/31",
  end_date: "1405/05/31"
});

const req = http.request({
  hostname: '127.0.0.1',
  port: 3000,
  path: '/api/save_leave',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    'Cookie': 'connect.sid=s%3AceOM4nlpR0vTs0HX3yxlevlnFPjTFnv7.ceOM4nlpR0vTs0HX3yxlevlnFPjTFnv7' 
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('Response:', res.statusCode, body));
});

req.on('error', console.error);
req.write(data);
req.end();
