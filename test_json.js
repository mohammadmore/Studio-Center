fetch('http://localhost:3000/api/save_leave', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ user_id: 1, substitute_id: 2, start_date: "1402/01/01", end_date: "1402/01/02" })
}).then(res => res.text()).then(text => {
  console.log('RAW TEXT:', text);
  try {
    const json = JSON.parse(text);
    console.log('JSON OK:', json);
  } catch(e) {
    console.error('JSON ERROR:', e);
  }
}).catch(console.error);
