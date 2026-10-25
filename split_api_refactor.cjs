const fs = require('fs');
const code = fs.readFileSync('src/routes/api.ts', 'utf8');

// Match the header part of the file up to `apiRouter.use(apiAuthGuard);`
const headerEndStr = "apiRouter.use(apiAuthGuard);";
const headerEndIdx = code.indexOf(headerEndStr) + headerEndStr.length;

let headerCode = code.slice(0, headerEndIdx);
// Replace `const apiRouter = express.Router();` with an exportable subRouter in the header for the subfiles
let subHeaderCode = headerCode.replace(/const apiRouter = express\.Router\(\);[\s\S]*$/, `
const subRouter = express.Router();
export default subRouter;
`);

const routes = [];
let currentIndex = headerEndIdx;

while (true) {
  const methodMatch = code.slice(currentIndex).match(/apiRouter\.(get|post|put|delete)\(\s*["']([^"']+)["']/);
  if (!methodMatch) break;
  
  const startIdx = currentIndex + methodMatch.index;
  const path = methodMatch[2];
  const method = methodMatch[1];
  
  // Find matching closing parenthesis
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
    if (code[closeIdx + 1] === ';') {
      closeIdx++;
    }
    const routeCode = code.slice(startIdx, closeIdx + 1).replace(/apiRouter\./g, 'subRouter.');
    routes.push({ method, path, code: routeCode, startIdx, endIdx: closeIdx });
    currentIndex = closeIdx + 1;
  } else {
    break;
  }
}

const groupMapping = {
  auth: ['/login', '/logout', '/check_auth'],
  users: ['/manage_roles', '/get_roles', '/get_all_roles', '/manage_users', '/save_user', '/get_colleagues', '/get_all_users'],
  collections: ['/get_collections', '/manage_collections', '/get_orgs', '/manage_orgs', '/get_orgs_public', '/get_org_report'],
  contents: ['/get_depot_contents', '/get_my_projects', '/get_org_contents', '/bulk_schedule_contents', '/schedule_content', '/add_content', '/download_content_excel_template', '/bulk_import_contents', '/manage_content_template', '/get_content_templates', '/apply_content_template', '/dismiss_template_suggestion', '/fulfill_template_suggestion', '/apply_template', '/get_templates', '/update_platform_metrics', '/toggle_platform_published', '/toggle_stage', '/batch_edit_contents', '/update_content_details', '/get_batch_operations', '/undo_batch_operation', '/recycle_bin'],
  events: ['/upload_smart_events', '/manage_smart_events', '/add_client_events', '/get_smart_events_monthly', '/get_events', '/unlock_events', '/confirm_events'],
  settings: ['/manage_settings', '/save_token', '/get_tokens', '/get_fonts', '/reorder_fonts', '/upload_font', '/set_active_font', '/rename_font', '/delete_font', '/get_studio_info', '/save_studio_info'],
  leaves: ['/get_leaves', '/update_leave', '/delete_leave', '/save_leave'],
  media: ['/save_media', '/get_media', '/upload_image', '/upload_file'],
  notifications: ['/get_logs', '/get_notifications', '/read_notifications'],
  dashboard: ['/get_dashboard_stats', '/fetch_live_stats', '/get_counts', '/global_search'],
  finances: ['/get_finance_report', '/save_expense', '/invoices', '/generate_invoice'],
  client: ['/get_client_data', '/client_review', '/save_onboarding']
};

const routeGroups = {};
for (const r of routes) {
  let matchedGroup = 'other';
  for (const [group, paths] of Object.entries(groupMapping)) {
    if (paths.includes(r.path)) {
      matchedGroup = group;
      break;
    }
  }
  if (!routeGroups[matchedGroup]) routeGroups[matchedGroup] = [];
  routeGroups[matchedGroup].push(r);
}

// Create dir
if (!fs.existsSync('src/routes/api_routes')) {
  fs.mkdirSync('src/routes/api_routes');
}

let newApiTsImports = `
import express from "express";
import { apiAuthGuard } from "../middleware/auth.js";
const apiRouter = express.Router();
apiRouter.use(apiAuthGuard);
`;
let newApiTsMounts = ``;

for (const [group, groupRoutes] of Object.entries(routeGroups)) {
  const fileName = `${group}.ts`;
  let fileContent = headerCode.replace(/const apiRouter = express\.Router\(\);[\s\S]*$/, `const subRouter = express.Router();\n`);
  
  // We don't want the apiRouter.use(apiAuthGuard) inside every subfile if it's applied in api.ts
  fileContent = fileContent.replace('apiRouter.use(apiAuthGuard);', '');
  
  for (const r of groupRoutes) {
    fileContent += '\n' + r.code + '\n';
  }
  fileContent += `\nexport default subRouter;\n`;
  
  fs.writeFileSync(`src/routes/api_routes/${fileName}`, fileContent);
  
  newApiTsImports += `import ${group}Router from "./api_routes/${group}.js";\n`;
  newApiTsMounts += `apiRouter.use("/", ${group}Router);\n`;
}

const finalApiTs = newApiTsImports + '\n' + newApiTsMounts + '\nexport default apiRouter;\n';
fs.writeFileSync('src/routes/api.ts', finalApiTs);

console.log("Refactoring complete.");
