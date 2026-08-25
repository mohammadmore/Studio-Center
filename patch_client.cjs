const fs = require('fs');
let content = fs.readFileSync('views/client-events.ejs', 'utf8');

content = content.replace(
  /<div style="display: flex; align-items: center; gap: 15px; flex-grow: 1;">\s*<input type="checkbox" value="\$\{ev\.title\}" data-day="\$\{ev\.publish_day\}" style="transform: scale\(1\.3\); margin: 0;" \$\{isChecked\} \$\{isDisabled\}>\s*<div class="event-date">\$\{toPersianDigits\(ev\.publish_day\)\} \$\{monthNames\[month-1\]\}<\/div>\s*<div class="event-title">\$\{ev\.title\}<\/div>\s*<\/div>/,
  `<div style="display: flex; flex-direction: column; flex-grow: 1; justify-content: center;">
                                    <div style="display: flex; align-items: center; gap: 15px;">
                                        <input type="checkbox" value="\${ev.title}" data-day="\${ev.publish_day}" style="transform: scale(1.3); margin: 0;" \${isChecked} \${isDisabled}>
                                        <div class="event-date" style="min-width: 80px;">\${toPersianDigits(ev.publish_day)} \${monthNames[month-1]}</div>
                                        <div class="event-title">\${ev.title}</div>
                                    </div>
                                    \${ev.description ? \`<div style="font-size: 0.9rem; color: var(--text-gray); margin-top: 6px; margin-right: 110px; opacity: 0.75; line-height: 1.5; white-space: pre-wrap;">\${ev.description}</div>\` : ''}
                                </div>`
);

fs.writeFileSync('views/client-events.ejs', content);
