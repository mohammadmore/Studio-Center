const fs = require('fs');
let code = fs.readFileSync('views/partials/content-identity.ejs', 'utf8');

code = code.replace(
    /{ id: 'approved_by_client', name: \`تایید کارفرما <svg[\s\S]*?<\/svg>\` },/,
    `{ id: 'approved_by_client', name: \`تایید کارفرما <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='vertical-align: middle; margin-left: 4px;'><path d='M20 6 9 17l-5-5'/></svg>\`, plainName: 'تایید کارفرما' },`
);

code = code.replace(
    /{ id: 'ready_to_publish', name: \`آماده انتشار <svg[\s\S]*?<\/svg>\` },/,
    `{ id: 'ready_to_publish', name: \`آماده انتشار <svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round' style='vertical-align: middle; margin-left: 4px;'><path d='M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z'/><path d='m12 15-3-3a22 22 0 0 1 3.82-13 1.5 1.5 0 0 0-2.18 2.06c2.81 3.2 4.09 7.42 4.09 11.75v1.07'/><path d='m9 18 3 3a22 22 0 0 0 13-3.82 1.5 1.5 0 0 0-2.06-2.18c-3.2 2.81-7.42 4.09-11.75 4.09h-1.07'/></svg>\`, plainName: 'آماده انتشار' },`
);

// Update confirmStageTransition calls to use plainName || name
code = code.replace(
  /'\$\{prevStatus \? \(prevStatus\.name \|\| ''\)\.replace\(\/'\/g, "\\\\'"\) : ''\}'/g,
  `'\$\{prevStatus ? (prevStatus.plainName || prevStatus.name || '').replace(/'/g, "\\\\'") : ''}'`
);

code = code.replace(
  /'\$\{nextStatus \? \(nextStatus\.name \|\| ''\)\.replace\(\/'\/g, "\\\\'"\) : ''\}'/g,
  `'\$\{nextStatus ? (nextStatus.plainName || nextStatus.name || '').replace(/'/g, "\\\\'") : ''}'`
);


fs.writeFileSync('views/partials/content-identity.ejs', code);
