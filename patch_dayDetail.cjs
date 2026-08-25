const fs = require('fs');
let content = fs.readFileSync('views/smart-events.ejs', 'utf8');

// Replace dayDetailList item HTML
content = content.replace(
  /<div style="background: rgba\(128, 128, 128, 0\.05\); padding: 10px; border-radius: 8px; border: 1px solid var\(--border-color\); display: flex; justify-content: space-between; align-items: center;">/,
  '<div title="${ev.description ? ev.description.replace(/\"/g, \'&quot;\') : \'\'}" onclick="if(!event.target.closest(\'button\')) showEventInfoModal(\'${encodeURIComponent(JSON.stringify(ev)).replace(/\'/g, \'%27\')}\')" style="background: rgba(128, 128, 128, 0.05); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background=\'rgba(128,128,128,0.1)\'" onmouseout="this.style.background=\'rgba(128,128,128,0.05)\'">'
);

// Add eventInfoModal and its js functions before </body> or somewhere at the end
const modalHtml = `
    <div class="modal-overlay" id="eventInfoModal" style="display: none; z-index: 9999999;">
        <div class="modal-box" style="text-align: right; width: 100%; max-width: 400px; box-sizing: border-box;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 id="infoModalTitle" style="color: var(--primary-color); margin: 0; font-size: 1.2rem;"></h3>
                <button onclick="document.getElementById('eventInfoModal').style.display='none'" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #94a3b8;">&times;</button>
            </div>
            <div id="infoModalDesc" style="color: var(--text-gray); line-height: 1.6; white-space: pre-wrap; font-size: 0.95rem; background: rgba(128,128,128,0.05); padding: 15px; border-radius: 8px;">
            </div>
        </div>
    </div>
    
    <script>
    function showEventInfoModal(evStr) {
        const ev = JSON.parse(decodeURIComponent(evStr));
        if (!ev.description) return;
        document.getElementById('infoModalTitle').innerText = ev.title;
        document.getElementById('infoModalDesc').innerText = ev.description;
        document.getElementById('eventInfoModal').style.display = 'flex';
    }
    </script>
`;

if (!content.includes('eventInfoModal')) {
    content = content.replace('</body>', modalHtml + '\n</body>');
}

fs.writeFileSync('views/smart-events.ejs', content);
