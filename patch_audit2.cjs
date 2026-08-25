const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `                const action = req.body?.action || req.query?.action || req.method;
                let endpoint = req.path.replace("/api/", "").replace("", "");
                const epNames = {
                  manage_team: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u06A9\\u0627\\u0631\\u0628\\u0631\\u0627\\u0646/\\u0647\\u0645\\u06A9\\u0627\\u0631\\u0627\\u0646",
                  manage_organizations: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0633\\u0627\\u0632\\u0645\\u0627\\u0646\\u200C\\u0647\\u0627",
                  manage_contents: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u062F\\u067E\\u0648\\u06CC \\u0645\\u062D\\u062A\\u0648\\u0627",
                  manage_smart_events: "\\u062A\\u0642\\u0648\\u06CC\\u0645 \\u0648 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627",
                  manage_leaves: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0645\\u0631\\u062E\\u0635\\u06CC\\u200C\\u0647\\u0627",
                  manage_roles: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0646\\u0642\\u0634\\u200C\\u0647\\u0627",
                  upload_excel: "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u0645\\u062D\\u062A\\u0648\\u0627",
                  upload_smart_events: "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627",
                  upload_users: "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u06A9\\u0627\\u0631\\u0628\\u0631\\u0627\\u0646",
                  save_settings: "\\u062A\\u0646\\u0638\\u06CC\\u0645\\u0627\\u062A \\u0633\\u06CC\\u0633\\u062A\\u0645",
                  client_action: "\\u0627\\u0642\\u062F\\u0627\\u0645\\u0627\\u062A \\u06A9\\u0627\\u0631\\u0641\\u0631\\u0645\\u0627",
                  add_comment: "\\u062B\\u0628\\u062A \\u06A9\\u0627\\u0645\\u0646\\u062A",
                  update_profile: "\\u0648\\u06CC\\u0631\\u0627\\u06CC\\u0634 \\u067E\\u0631\\u0648\\u0641\\u0627\\u06CC\\u0644"
                };
                let actionFa = action;
                if (action === "add") actionFa = "\\u0627\\u0641\\u0632\\u0648\\u062F\\u0646";
                if (action === "edit" || action === "update") actionFa = "\\u0648\\u06CC\\u0631\\u0627\\u06CC\\u0634";
                if (action === "delete") actionFa = "\\u062D\\u0630\\u0641";
                if (action === "batch_delete") actionFa = "\\u062D\\u0630\\u0641 \\u06AF\\u0631\\u0648\\u0647\\u06CC";
                if (action === "update_status") actionFa = "\\u062A\\u063A\\u06CC\\u06CC\\u0631 \\u0648\\u0636\\u0639\\u06CC\\u062A";
                if (action === "approve") actionFa = "\\u062A\\u0627\\u06CC\\u06CC\\u062F";
                if (action === "reject") actionFa = "\\u0631\\u062F";
                if (action === "POST") actionFa = "\\u0630\\u062E\\u06CC\\u0631\\u0647/\\u0622\\u067E\\u0644\\u0648\\u062F";
                
                let epFa = epNames[endpoint] || endpoint;
                finalDesc = \`\${actionFa} \\u062F\\u0631 \${epFa}\`;`;

const replacement = `                let action = req.body?.action || req.query?.action || req.method;
                let endpoint = req.path.replace("/api/", "").replace("", "");
                
                if (endpoint === 'toggle_stage') action = 'update_stage';
                
                const epNames = {
                  manage_team: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u06A9\\u0627\\u0631\\u0628\\u0631\\u0627\\u0646/\\u0647\\u0645\\u06A9\\u0627\\u0631\\u0627\\u0646",
                  manage_organizations: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0633\\u0627\\u0632\\u0645\\u0627\\u0646\\u200C\\u0647\\u0627",
                  manage_contents: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u062F\\u067E\\u0648\\u06CC \\u0645\\u062D\\u062A\\u0648\\u0627",
                  manage_smart_events: "\\u062A\\u0642\\u0648\\u06CC\\u0645 \\u0648 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627",
                  manage_leaves: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0645\\u0631\\u062E\\u0635\\u06CC\\u200C\\u0647\\u0627",
                  manage_roles: "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0646\\u0642\\u0634\\u200C\\u0647\\u0627",
                  upload_excel: "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u0645\\u062D\\u062A\\u0648\\u0627",
                  upload_smart_events: "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627",
                  upload_users: "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u06A9\\u0627\\u0631\\u0628\\u0631\\u0627\\u0646",
                  save_settings: "\\u062A\\u0646\\u0638\\u06CC\\u0645\\u0627\\u062A \\u0633\\u06CC\\u0633\\u062A\\u0645",
                  client_action: "\\u0627\\u0642\\u062F\\u0627\\u0645\\u0627\\u062A \\u06A9\\u0627\\u0631\\u0641\\u0631\\u0645\\u0627",
                  add_comment: "\\u062B\\u0628\\u062A \\u06A9\\u0627\\u0645\\u0646\\u062A",
                  update_profile: "\\u0648\\u06CC\\u0631\\u0627\\u06CC\\u0634 \\u067E\\u0631\\u0648\\u0641\\u0627\\u06CC\\u0644",
                  add_content: "\\u0645\\u062D\\u062A\\u0648\\u0627",
                  batch_edit_contents: "\\u0645\\u062D\\u062A\\u0648\\u0627 (\\u06AF\\u0631\\u0648\\u0647\\u06CC)",
                  update_leave: "\\u0648\\u0636\\u0639\\u06CC\\u062A \\u0645\\u0631\\u062E\\u0635\\u06CC",
                  delete_leave: "\\u062D\\u0630\\u0641 \\u0645\\u0631\\u062E\\u0635\\u06CC",
                  save_leave: "\\u062F\\u0631\\u062E\\u0648\\u0627\\u0633\\u062A \\u0645\\u0631\\u062E\\u0635\\u06CC",
                  save_user: "\\u06A9\\u0627\\u0631\\u0628\\u0631",
                  upload_image: "\\u0622\\u067E\\u0644\\u0648\\u062F \\u062A\\u0635\\u0648\\u06CC\\u0631",
                  upload_file: "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0641\\u0627\\u06CC\\u0644",
                  save_token: "\\u062A\\u0648\\u06A9\\u0646",
                  save_media: "\\u0631\\u0633\\u0627\\u0646\\u0647",
                  save_onboarding: "\\u0622\\u0646\\u0628\\u0648\\u0631\\u062F\\u06CC\\u0646\\u06AF",
                  save_expense: "\\u0645\\u0627\\u0644\\u06CC/\\u0647\\u0632\\u06CC\\u0646\\u0647",
                  client_review: "\\u0628\\u0631\\u0631\\u0633\\u06CC \\u06A9\\u0627\\u0631\\u0641\\u0631\\u0645\\u0627",
                  confirm_events: "\\u062A\\u0627\\u06CC\\u06CC\\u062F \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627",
                  toggle_stage: "\\u0645\\u0631\\u0627\\u062D\\u0644 \\u0645\\u062D\\u062A\\u0648\\u0627",
                  rename_font: "\\u0641\\u0648\\u0646\\u062A",
                  invoices: "\\u0641\\u0627\\u06A9\\u062A\\u0648\\u0631",
                  undo_batch_operation: "\\u0644\\u063A\\u0648 \\u0639\\u0645\\u0644\\u06CC\\u0627\\u062A",
                  apply_template: "\\u0642\\u0627\\u0644\\u0628",
                  dismiss_template_suggestion: "\\u0631\\u062F \\u067E\\u06CC\\u0634\\u0646\\u0647\\u0627\\u062F \\u0642\\u0627\\u0644\\u0628",
                  fulfill_template_suggestion: "\\u062A\\u0627\\u06CC\\u06CC\\u062F \\u067E\\u06CC\\u0634\\u0646\\u0647\\u0627\\u062F \\u0642\\u0627\\u0644\\u0628",
                  unlock_events: "\\u0628\\u0627\\u0632 \\u06A9\\u0631\\u062F\\u0646 \\u0642\\u0641\\u0644 \\u062A\\u0642\\u0648\\u06CC\\u0645"
                };
                let actionFa = action;
                if (action === "add") actionFa = "\\u0627\\u0641\\u0632\\u0648\\u062F\\u0646";
                else if (action === "edit" || action === "update") actionFa = "\\u0648\\u06CC\\u0631\\u0627\\u06CC\\u0634";
                else if (action === "delete") actionFa = "\\u062D\\u0630\\u0641";
                else if (action === "batch_delete") actionFa = "\\u062D\\u0630\\u0641 \\u06AF\\u0631\\u0648\\u0647\\u06CC";
                else if (action === "update_status") actionFa = "\\u062A\\u063A\\u06CC\\u06CC\\u0631 \\u0648\\u0636\\u0639\\u06CC\\u062A";
                else if (action === "approve") actionFa = "\\u062A\\u0627\\u06CC\\u06CC\\u062F";
                else if (action === "reject") actionFa = "\\u0631\\u062F";
                else if (action === "archive") actionFa = "\\u0622\\u0631\\u0634\\u06CC\\u0648";
                else if (action === "update_stage") actionFa = "\\u062A\\u063A\\u06CC\\u06CC\\u0631 \\u0645\\u0631\\u062D\\u0644\\u0647";
                else if (action === "POST") actionFa = "\\u0630\\u062E\\u06CC\\u0631\\u0647/\\u062B\\u0628\\u062A";
                
                let epFa = epNames[endpoint] || endpoint;
                
                let extraInfo = "";
                const titleStr = req.body?.title || req.body?.item_title || req.body?.name || req.body?.org_name || req.body?.full_name;
                if (titleStr && typeof titleStr === 'string' && titleStr.length < 50) {
                    extraInfo = \` ("\${titleStr}")\`;
                }
                
                finalDesc = \`\${actionFa} \${epFa}\${extraInfo}\`;`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('server.ts', code);
    console.log("Success");
} else {
    console.log("Target not found");
}
