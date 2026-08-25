const fs = require('fs');
const path = require('path');

const bugs = [];

function checkFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Check EJS files
    if (filePath.endsWith('.ejs')) {
        if (!content.includes('<meta name="viewport"')) {
            if (content.includes('</head>')) {
                bugs.push(`[UI/UX] ${filePath}: Missing <meta name="viewport" content="width=device-width, initial-scale=1.0"> which causes bad mobile scaling.`);
            }
        }
        
        // Find raw width>400px or width: 100vw
        const widthMatches = content.match(/width:\s*([4-9]\d{2,}px|100vw)/gi);
        if (widthMatches) {
            bugs.push(`[UI/Responsive] ${filePath}: Uses hardcoded widths or 100vw which often causes overflow on mobile (${widthMatches.join(', ')}).`);
        }
        
        // Find missing alt tags
        if (/<img(?![^>]*alt=)/gi.test(content)) {
            bugs.push(`[Accessibility] ${filePath}: Found <img> tags missing 'alt' attributes.`);
        }
        
        // Unescaped EJS outputs that might be XSS vulnerabilities
        // Look for <%- ... %> except when it's include or obvious trusted HTML
        const unescaped = content.match(/<%- (?!(include))[^>]+%>/g);
        if (unescaped) {
            bugs.push(`[Security] ${filePath}: Uses unescaped EJS output (<%- %>). Ensure these variables are sanitized against XSS.`);
        }
    }
    
    // Check JS files
    if (filePath.endsWith('.js') || filePath.endsWith('.ts')) {
        // Look for raw fetch without try/catch or response.ok check (heuristics)
        if (content.includes('fetch(') && !content.includes('response.ok') && !content.includes('.catch(')) {
            bugs.push(`[Logic/Stability] ${filePath}: Found fetch() calls that might not properly check response.ok or catch network errors.`);
        }
        
        // Look for alert()
        if (content.match(/[^a-zA-Z0-9_]alert\(/g)) {
            bugs.push(`[UI/UX] ${filePath}: Uses native alert() which blocks the thread and looks unprofessional. Consider custom modals/toasts.`);
        }

        // Hardcoded API keys or secrets
        if (content.match(/(sk-[a-zA-Z0-9]{30,}|AIzaSy[a-zA-Z0-9_-]{33})/g)) {
            bugs.push(`[Security] ${filePath}: Potentially hardcoded API keys found.`);
        }
    }
    
    // Check CSS
    if (filePath.endsWith('.css')) {
        if (content.includes('width: 100vw')) {
            bugs.push(`[UI/Responsive] ${filePath}: Uses 'width: 100vw' which ignores scrollbars and causes horizontal scrolling.`);
        }
    }
}

function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    for (const file of files) {
        if (file === 'node_modules' || file === '.git' || file === 'dist') continue;
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walkDir(fullPath);
        } else {
            if (fullPath.endsWith('.ejs') || fullPath.endsWith('.js') || fullPath.endsWith('.ts') || fullPath.endsWith('.css')) {
                checkFile(fullPath);
            }
        }
    }
}

walkDir('./views');
walkDir('./center/assets');
checkFile('./server.ts');

console.log(bugs.join('\n'));
