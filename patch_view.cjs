const fs = require('fs');
let content = fs.readFileSync('views/smart-events.ejs', 'utf8');
content = content.replace(
  '<input type="text" id="newEventTitle" placeholder="مثال: روز جهانی عکاسی" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">\n            </div>',
  '<input type="text" id="newEventTitle" placeholder="مثال: روز جهانی عکاسی" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box;">\n            </div>\n            \n            <div style="margin-bottom: 15px;">\n                <label style="display: block; margin-bottom: 5px; color: var(--text-gray); font-weight: bold;">توضیحات (اختیاری)</label>\n                <textarea id="newEventDescription" rows="3" placeholder="توضیحات مناسبت..." style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; resize: vertical; font-family: inherit;"></textarea>\n            </div>'
);
fs.writeFileSync('views/smart-events.ejs', content);
