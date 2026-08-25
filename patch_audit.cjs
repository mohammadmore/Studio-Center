const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `  res.on("finish", () => {
    if (req.method === "POST") {
      if (req.path.startsWith("/api/") && !req.path.includes("auth")) {
        const action = req.body?.action || req.query?.action || "POST";
        let endpoint = req.path.replace("/api/", "").replace("", "");
        const epNames = {
          manage_team:
            "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u06A9\\u0627\\u0631\\u0628\\u0631\\u0627\\u0646/\\u0647\\u0645\\u06A9\\u0627\\u0631\\u0627\\u0646",
          manage_organizations:
            "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0633\\u0627\\u0632\\u0645\\u0627\\u0646\\u200C\\u0647\\u0627",
          manage_contents:
            "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u062F\\u067E\\u0648\\u06CC \\u0645\\u062D\\u062A\\u0648\\u0627",
          manage_smart_events:
            "\\u062A\\u0642\\u0648\\u06CC\\u0645 \\u0648 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627",
          manage_leaves:
            "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0645\\u0631\\u062E\\u0635\\u06CC\\u200C\\u0647\\u0627",
          manage_roles:
            "\\u0645\\u062F\\u06CC\\u0631\\u06CC\\u062A \\u0646\\u0642\\u0634\\u200C\\u0647\\u0627",
          upload_excel:
            "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u0645\\u062D\\u062A\\u0648\\u0627",
          upload_smart_events:
            "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u0645\\u0646\\u0627\\u0633\\u0628\\u062A\\u200C\\u0647\\u0627",
          upload_users:
            "\\u0622\\u067E\\u0644\\u0648\\u062F \\u0627\\u06A9\\u0633\\u0644 \\u06A9\\u0627\\u0631\\u0628\\u0631\\u0627\\u0646",
          save_settings:
            "\\u062A\\u0646\\u0638\\u06CC\\u0645\\u0627\\u062A \\u0633\\u06CC\\u0633\\u062A\\u0645",
          client_action:
            "\\u0627\\u0642\\u062F\\u0627\\u0645\\u0627\\u062A \\u06A9\\u0627\\u0631\\u0641\\u0631\\u0645\\u0627",
          add_comment: "\\u062B\\u0628\\u062A \\u06A9\\u0627\\u0645\\u0646\\u062A",
          update_profile:
            "\\u0648\\u06CC\\u0631\\u0627\\u06CC\\u0634 \\u067E\\u0631\\u0648\\u0641\\u0627\\u06CC\\u0644",
        };
        let userDesc =
          req.session && req.session.user && req.session.user
            ? req.session.user
            : "\\u0646\\u0627\\u0634\\u0646\\u0627\\u0633/\\u0633\\u06CC\\u0633\\u062A\\u0645";
        let actionFa = action;
        if (action === "add") actionFa = "\\u0627\\u0641\\u0632\\u0648\\u062F\\u0646";
        if (action === "edit" || action === "update")
          actionFa = "\\u0648\\u06CC\\u0631\\u0627\\u06CC\\u0634";
        if (action === "delete") actionFa = "\\u062D\\u0630\\u0641";
        if (action === "batch_delete")
          actionFa = "\\u062D\\u0630\\u0641 \\u06AF\\u0631\\u0648\\u0647\\u06CC";
        if (action === "update_status")
          actionFa =
            "\\u062A\\u063A\\u06CC\\u06CC\\u0631 \\u0648\\u0636\\u0639\\u06CC\\u062A";
        if (action === "approve") actionFa = "\\u062A\\u0627\\u06CC\\u06CC\\u062F";
        if (action === "reject") actionFa = "\\u0631\\u062F";
        if (action === "POST")
          actionFa =
            "\\u0630\\u062E\\u06CC\\u0631\\u0647/\\u0622\\u067E\\u0644\\u0648\\u062F";
        let epFa = epNames[endpoint] || endpoint;
        let finalDesc = \`\${actionFa} \\u062F\\u0631 \${epFa}\`;
        if (res.statusCode >= 200 && res.statusCode < 300) {
          addAuditLog(
            userDesc,
            finalDesc + " (\\u0645\\u0648\\u0641\\u0642)",
            req.ip || "127.0.0.1",
          );
        } else {
          addAuditLog(
            userDesc,
            finalDesc +
              " (\\u062E\\u0637\\u0627/\\u0646\\u0627\\u0645\\u0648\\u0641\\u0642)",
            req.ip || "127.0.0.1",
          );
        }
      }
      saveDatabase();
    }
  });`;

const replacement = `  res.on("finish", () => {
    if (req.method === "POST" && req.path.startsWith("/api/") && !req.path.includes("auth")) {
        saveDatabase();
    }

    if (req.session && req.session.user && req.path !== "/api/auth/status") {
      const isStatic = req.path.startsWith('/assets') || req.path.startsWith('/fonts') || req.path.match(/\\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i);
      const isPolling = req.method === 'GET' && (req.path === '/api/get_notifications' || req.path === '/api/get_leaves' || req.path === '/api/get_logs' || req.path === '/api/get_colleagues' || req.path === '/api/get_recent_contents');
      
      if (!isStatic && !isPolling) {
        let finalDesc = "";
        let userDesc = req.session.user;

        if (req.path.startsWith("/api/")) {
            if (!req.path.includes("auth")) {
                const action = req.body?.action || req.query?.action || req.method;
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
                finalDesc = \`\${actionFa} \\u062F\\u0631 \${epFa}\`;
            }
        } else {
            const viewNames = {
                "/": "\\u062F\\u0627\\u0634\\u0628\\u0648\\u0631\\u062F",
                "/dashboard": "\\u062F\\u0627\\u0634\\u0628\\u0648\\u0631\\u062F",
                "/archive": "\\u0622\\u0631\\u0634\\u06CC\\u0648 \\u0645\\u062D\\u062A\\u0648\\u0627",
                "/smart-events": "\\u062A\\u0642\\u0648\\u06CC\\u0645 \\u0647\\u0648\\u0634\\u0645\\u0646\\u062F",
                "/team": "\\u062A\\u06CC\\u0645 \\u0648 \\u0647\\u0645\\u06A9\\u0627\\u0631\\u0627\\u0646",
                "/organizations": "\\u0633\\u0627\\u0632\\u0645\\u0627\\u0646\\u200C\\u0647\\u0627",
                "/leaves": "\\u0645\\u0631\\u062E\\u0635\\u06CC\\u200C\\u0647\\u0627",
                "/reports": "\\u06AF\\u0632\\u0627\\u0631\\u0634\\u0627\\u062A",
                "/settings": "\\u062A\\u0646\\u0638\\u06CC\\u0645\\u0627\\u062A",
                "/audit": "\\u062A\\u0627\\u0631\\u06CC\\u062E\\u0686\\u0647 \\u0641\\u0639\\u0627\\u0644\\u06CC\\u062A\\u200C\\u0647\\u0627",
                "/recycle_bin": "\\u0633\\u0637\\u0644 \\u0632\\u0628\\u0627\\u0644\\u0647",
                "/finance": "\\u0627\\u0645\\u0648\\u0631 \\u0645\\u0627\\u0644\\u06CC"
            };
            if (req.method === "GET") {
                let vName = viewNames[req.path];
                if (vName) {
                    finalDesc = \`\\u0628\\u0627\\u0632\\u062F\\u06CC\\u062F \\u0627\\u0632 \\u0635\\u0641\\u062D\\u0647 \${vName}\`;
                } else {
                    finalDesc = \`\\u0628\\u0627\\u0632\\u062F\\u06CC\\u062F \\u0627\\u0632 \${req.path}\`;
                }
            } else {
                finalDesc = \`\\u062F\\u0631\\u062E\\u0648\\u0627\\u0633\\u062A \${req.method} \\u0628\\u0647 \${req.path}\`;
            }
        }

        if (finalDesc) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              addAuditLog(userDesc, finalDesc + " (\\u0645\\u0648\\u0641\\u0642)", req.ip || "127.0.0.1");
            } else {
              addAuditLog(userDesc, finalDesc + \` (\\u062E\\u0637\\u0627 \${res.statusCode})\`, req.ip || "127.0.0.1");
            }
        }
      }
    }
  });`;

if (code.includes(target)) {
    code = code.replace(target, replacement);
    fs.writeFileSync('server.ts', code);
    console.log("Success");
} else {
    console.log("Target not found");
}
