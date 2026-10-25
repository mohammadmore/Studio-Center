const fs = require('fs');
const code = fs.readFileSync('src/routes/api.ts', 'utf8');

const routes = [];
let currentIndex = 0;

while (true) {
  const methodMatch = code.slice(currentIndex).match(/apiRouter\.(get|post|put|delete)\(\s*["']([^"']+)["']/);
  if (!methodMatch) break;
  
  const startIdx = currentIndex + methodMatch.index;
  const path = methodMatch[2];
  const method = methodMatch[1];
  
  // Find the matching closing parenthesis for this apiRouter call
  let openCount = 0;
  let closeIdx = -1;
  let foundFirstOpen = false;
  
  for (let i = startIdx; i < code.length; i++) {
    if (code[i] === '(') {
      openCount++;
      foundFirstOpen = true;
    } else if (code[i] === ')') {
      openCount--;
      if (foundFirstOpen && openCount === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  
  if (closeIdx !== -1) {
    // Also include the trailing semicolon if present
    if (code[closeIdx + 1] === ';') {
      closeIdx++;
    }
    const routeCode = code.slice(startIdx, closeIdx + 1);
    routes.push({ method, path, code: routeCode, startIdx, endIdx: closeIdx });
    currentIndex = closeIdx + 1;
  } else {
    break;
  }
}

console.log(`Found ${routes.length} routes.`);
// Let's print out the paths found to see if we missed anything
console.log(routes.map(r => r.path).join(', '));
