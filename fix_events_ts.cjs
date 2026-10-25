const fs = require('fs');
let code = fs.readFileSync('src/routes/api_routes/events.ts', 'utf8');

if (!code.includes('import momentHijri')) {
  code = 'import momentHijri from "moment-hijri";\n' + code;
}

// Convert req.query type errors to cast as string
code = code.replace(/date === (req\.query\.\w+)/g, 'date === ($1 as string)');
code = code.replace(/req\.query\.\w+\.split/g, '(req.query.date as string).split');
code = code.replace(/momentHijri\((req\.query\.date)/g, 'momentHijri($1 as string');
code = code.replace(/Number\((req\.query\.\w+)\)/g, 'Number($1 as string)');
code = code.replace(/month === (req\.query\.\w+)/g, 'month === ($1 as string)');
code = code.replace(/parseInt\((req\.query\.\w+)/g, 'parseInt($1 as string');
code = code.replace(/d === (req\.query\.\w+)/g, 'd === ($1 as string)');

fs.writeFileSync('src/routes/api_routes/events.ts', code);
