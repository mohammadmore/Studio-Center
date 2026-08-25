const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

const importReplacement = `import fs from 'fs';
import 'dotenv/config';
import * as admin from 'firebase-admin';

let db: admin.firestore.Firestore | null = null;
try {
  const serviceAccount = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  db = admin.firestore();
  console.log("Firebase initialized");
} catch (err) {
  console.error("Failed to init Firebase", err);
}
`;
code = code.replace("import fs from 'fs';", importReplacement);


const loadDatabaseReplacement = `const DB_FILE = path.join(process.cwd(), 'database.json');

async function loadDatabase() {
    if (db) {
        try {
            const doc = await db.collection('database').doc('main').get();
            if (doc.exists) {
                const data = doc.data() as any;
                if (data.roles) roles = data.roles;
                if (data.colleagues) colleagues = data.colleagues;
                if (data.organizations) organizations = data.organizations;
                if (data.collections) collections = data.collections;
                if (data.smartEventsBank) smartEventsBank = data.smartEventsBank;
                if (data.clientSelections) clientSelections = data.clientSelections;
                if (data.contents) contents = data.contents;
                if (data.settings) settings = data.settings;
                if (data.leaves) leaves = data.leaves;
                if (data.audit_logs) audit_logs = data.audit_logs;
                if (data.notifications) notifications = data.notifications;
                if (data.tokens) tokens = data.tokens;
                if (data.templatesData) templatesData = data.templatesData;
                if (data.contentTemplates) contentTemplates = data.contentTemplates;
                if (data.templateSuggestions) templateSuggestions = data.templateSuggestions;
                if (data.expenses) expenses = data.expenses;
                if (data.invoices) invoices = data.invoices;
                if (data.mediaAssets) mediaAssets = data.mediaAssets;
                console.log("Loaded DB from Firestore");
            } else if (fs.existsSync(DB_FILE)) {
                console.log("Firestore doc not found, migrating from database.json");
                const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
                if (data.roles) roles = data.roles;
                if (data.colleagues) colleagues = data.colleagues;
                if (data.organizations) organizations = data.organizations;
                if (data.collections) collections = data.collections;
                if (data.smartEventsBank) smartEventsBank = data.smartEventsBank;
                if (data.clientSelections) clientSelections = data.clientSelections;
                if (data.contents) contents = data.contents;
                if (data.settings) settings = data.settings;
                if (data.leaves) leaves = data.leaves;
                if (data.audit_logs) audit_logs = data.audit_logs;
                if (data.notifications) notifications = data.notifications;
                if (data.tokens) tokens = data.tokens;
                if (data.templatesData) templatesData = data.templatesData;
                if (data.contentTemplates) contentTemplates = data.contentTemplates;
                if (data.templateSuggestions) templateSuggestions = data.templateSuggestions;
                if (data.expenses) expenses = data.expenses;
                if (data.invoices) invoices = data.invoices;
                if (data.mediaAssets) mediaAssets = data.mediaAssets;
                saveDatabase();
            } else {
                saveDatabase();
            }
        } catch (e) {
            console.error('Error loading DB from Firestore:', e);
        }
    } else {
        if (fs.existsSync(DB_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
                if (data.roles) roles = data.roles;
                if (data.colleagues) colleagues = data.colleagues;
                if (data.organizations) organizations = data.organizations;
                if (data.collections) collections = data.collections;
                if (data.smartEventsBank) smartEventsBank = data.smartEventsBank;
                if (data.clientSelections) clientSelections = data.clientSelections;
                if (data.contents) contents = data.contents;
                if (data.settings) settings = data.settings;
                if (data.leaves) leaves = data.leaves;
                if (data.audit_logs) audit_logs = data.audit_logs;
                if (data.notifications) notifications = data.notifications;
                if (data.tokens) tokens = data.tokens;
                if (data.templatesData) templatesData = data.templatesData;
                if (data.contentTemplates) contentTemplates = data.contentTemplates;
                if (data.templateSuggestions) templateSuggestions = data.templateSuggestions;
                if (data.expenses) expenses = data.expenses;
                if (data.invoices) invoices = data.invoices;
                if (data.mediaAssets) mediaAssets = data.mediaAssets;
            } catch (e) {
                console.error('Error loading database:', e);
            }
        } else {
            saveDatabase();
        }
    }
}

let saveTimeout: NodeJS.Timeout | null = null;
function saveDatabase() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(async () => {
        try {
            const data = {
                roles, colleagues, organizations, contents, settings, leaves, audit_logs, notifications, tokens, templatesData, expenses, invoices, mediaAssets, contentTemplates, templateSuggestions, collections, smartEventsBank, clientSelections
            };
            // Use synchronous write to guarantee it writes completely in this tick, but debounced to avoid IO overload
            fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
            if (db) {
                await db.collection('database').doc('main').set(data);
            }
        } catch(e) {
            console.error('Error saving DB:', e);
        }
    }, 500);
}`;

const loadDbRegex = /const DB_FILE = path\.join\(process\.cwd\(\), 'database\.json'\);\s*function loadDatabase\(\) \{[\s\S]*?\}, 500\);\n\}/;

if (!loadDbRegex.test(code)) {
    console.log("Could not find loadDatabase pattern");
    process.exit(1);
}
code = code.replace(loadDbRegex, loadDatabaseReplacement);

// remove `// Load DB on startup\nloadDatabase();`
code = code.replace(/\/\/ Load DB on startup\nloadDatabase\(\);/, '');

// Wrap app.listen
const appListenRegex = /app\.listen\(PORT, '0\.0\.0\.0', \(\) => \{\s*console\.log\(`Server running on http:\/\/localhost:\$\{PORT\}`\);\s*\}\);/;
const appListenReplacement = `loadDatabase().then(() => {
app.listen(PORT, '0.0.0.0', () => {
  console.log(\`Server running on http://localhost:\${PORT}\`);
});
});`;
code = code.replace(appListenRegex, appListenReplacement);

fs.writeFileSync('server.ts', code, 'utf8');
console.log("Done patching server.ts");
