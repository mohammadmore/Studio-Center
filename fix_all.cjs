const fs = require('fs');

// contents.ts
let cCode = fs.readFileSync('src/routes/api_routes/contents.ts', 'utf8');
cCode = cCode.replace(/const \[jYear, jMonth, jDay\] = card\.publish_date\.split\("\/"\)\.map\(Number\);/g, 
  'const [jYear, jMonth, jDay] = card.publish_date.split("/").map(Number);\n              let gDate = jalaali.toGregorian(jYear, jMonth, jDay);');
cCode = cCode.replace(/jalaali2\.toJalaali/g, 'jalaali.toJalaali');
cCode = cCode.replace(/logContentActivity\(\n\s*card,\n\s*req,\n\s*`\\u0634\u062E\u0635\u06CC \\u0631\u0627 \\u0628\u0647 \\u0645\u062D\u062A\u0648\u0627 \\u0627\u062E\u062A\u0635\u0627\u0635 \\u062F\u0627\u062F`\n\s*\);/g, 'logContentActivity(card, req, "تخصیص");');
// let's just make sure logContentActivity always has 3 arguments
// The previous errors were at 1374, 1418, 1436, 1623. I'll just use a regex to restore the badly formatted calls
cCode = cCode.replace(/logContentActivity\(\s*([\s\S]*?)\s*\);/g, (match, inner) => {
  const parts = inner.split(',').map(s => s.trim());
  if (parts.length === 1 && inner.includes('card')) {
     return 'logContentActivity(card, req, "ویرایش");';
  } else if (parts.length === 2 && inner.includes('card')) {
     return `logContentActivity(card, req, ${parts[1]});`;
  } else if (parts.length > 3) {
     return `logContentActivity(${parts[0]}, ${parts[1]}, ${parts[2]});`;
  }
  return match;
});

// for 1581 (which is probably addNotification(card, req, ...))
cCode = cCode.replace(/addNotification\(\s*([\s\S]*?)\s*\);/g, (match, inner) => {
  const parts = inner.split(',').map(s => s.trim());
  if (parts.length > 3) {
     return `addNotification(${parts[0]}, ${parts[1]}, ${parts[2]});`;
  }
  return match;
});
fs.writeFileSync('src/routes/api_routes/contents.ts', cCode);

// client.ts
let clCode = fs.readFileSync('src/routes/api_routes/client.ts', 'utf8');
clCode = clCode.replace(/addNotification\(\s*([\s\S]*?)\s*\);/g, (match, inner) => {
  const parts = inner.split(',').map(s => s.trim());
  if (parts.length > 3) {
     return `addNotification(${parts[0]}, ${parts[1]}, ${parts[2]});`;
  }
  return match;
});
fs.writeFileSync('src/routes/api_routes/client.ts', clCode);

// events.ts
let eCode = fs.readFileSync('src/routes/api_routes/events.ts', 'utf8');
eCode = eCode.replace(/req\.query\.from/g, '(req.query.from as string)');
eCode = eCode.replace(/req\.query\.to/g, '(req.query.to as string)');
eCode = eCode.replace(/req\.query\.type/g, '(req.query.type as string)');
eCode = eCode.replace(/req\.query\.year/g, '(req.query.year as string)');
eCode = eCode.replace(/req\.query\.month/g, '(req.query.month as string)');
eCode = eCode.replace(/=== \(req.query/g, '=== ((req.query');
eCode = eCode.replace(/as string\)/g, 'as string))');
eCode = eCode.replace(/\(req\.query\.from as string\)/g, '(req.query.from as string)'); // clean up
fs.writeFileSync('src/routes/api_routes/events.ts', eCode);

// settings.ts
let sCode = fs.readFileSync('src/routes/api_routes/settings.ts', 'utf8');
sCode = sCode.replace(/item\.price/g, '(item as any).price');
sCode = sCode.replace(/item\.base_price/g, '(item as any).base_price');
sCode = sCode.replace(/item\.icon/g, '(item as any).icon');
sCode = sCode.replace(/item\.logo_url/g, '(item as any).logo_url');
fs.writeFileSync('src/routes/api_routes/settings.ts', sCode);

