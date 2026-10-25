const fs = require('fs');
let code = fs.readFileSync('views/depot.ejs', 'utf8');

const targetStr = `;const originalOpenContentDetails = window.openContentDetails;
    ;
            window.openContentDetails = function(id, editMode = false) {
        originalOpenContentDetails(id, editMode);
        if (editMode) {
            setTimeout(() => {
                if (window.handleManagerChange) window.handleManagerChange();
            }, 50);
        }
    };`;
    
const replaceStr = `;
setTimeout(() => {
    if (window.openContentDetails && !window._depotIntercepted2) {
        window._depotIntercepted2 = true;
        const orig = window.openContentDetails;
        window.openContentDetails = function(id, editMode = false) {
            orig(id, editMode);
            if (editMode) {
                setTimeout(() => {
                    if (window.handleManagerChange) window.handleManagerChange();
                }, 50);
            }
        };
    }
}, 500);
`;

const index = code.indexOf('const originalOpenContentDetails = window.openContentDetails;');
if (index > -1) {
  const end = code.indexOf('};', index) + 2;
  code = code.substring(0, index - 1) + replaceStr + code.substring(end);
  fs.writeFileSync('views/depot.ejs', code);
  console.log("Fixed by slicing.");
} else {
  console.log("String not found.");
}
