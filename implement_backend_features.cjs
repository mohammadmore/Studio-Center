const fs = require('fs');
let code = fs.readFileSync('src/routes/api_routes/contents.ts', 'utf8');

// 1. Add Version History logging to caption
const versionHistoryRegex = /if \(caption !== void 0\) card\.caption = caption;/;
const versionHistoryReplacement = `
      if (caption !== void 0 && caption !== card.caption) {
        if (!card.version_history) card.version_history = [];
        card.version_history.push({
          id: Date.now() + Math.random(),
          field: "caption",
          old_value: card.caption,
          new_value: caption,
          user: req.session?.user?.username || "unknown",
          timestamp: new Date().toISOString()
        });
        card.caption = caption;
      }
`;
code = code.replace(versionHistoryRegex, versionHistoryReplacement);

// 2. We need to import getIO
if (!code.includes('getIO')) {
  code = 'import { getIO } from "../../utils/socket.js";\n' + code;
}

// 3. Emit content_updated at the end of the edit_content block
const returnSuccessRegex = /return res\.json\(\{\n\s*status:\s*"success"\n\s*\}\);/;
// Wait, we can't just blindly replace. Let's find the end of edit_content.
// Actually, it's easier to just add new endpoints to the bottom of the file (before export default subRouter).
const newEndpoints = `

// --- NEW COLLABORATION ENDPOINTS ---

subRouter.post("/:id/comments", checkPermission("depot"), (req, res) => {
  const { id } = req.params;
  const { text, mentions } = req.body;
  const card = contents.find((c) => c.id == id);
  if (!card) return res.status(404).json({ status: "error", message: "Not found" });
  
  if (!card.comments) card.comments = [];
  const comment = {
    id: Date.now() + Math.random(),
    user: req.session?.user?.username || "unknown",
    text,
    mentions: mentions || [],
    timestamp: new Date().toISOString()
  };
  card.comments.push(comment);
  saveDatabase();
  
  const io = getIO();
  if (io) io.emit("new_comment", { contentId: id, comment });
  
  res.json({ status: "success", comment });
});

subRouter.post("/:id/attachments", checkPermission("depot"), (req, res) => {
  const { id } = req.params;
  const { name, url } = req.body;
  const card = contents.find((c) => c.id == id);
  if (!card) return res.status(404).json({ status: "error", message: "Not found" });
  
  if (!card.attachments) card.attachments = [];
  const attachment = {
    id: Date.now() + Math.random(),
    name,
    url,
    uploader: req.session?.user?.username || "unknown",
    timestamp: new Date().toISOString()
  };
  card.attachments.push(attachment);
  saveDatabase();
  
  const io = getIO();
  if (io) io.emit("new_attachment", { contentId: id, attachment });
  
  res.json({ status: "success", attachment });
});

export default subRouter;
`;

code = code.replace(/export default subRouter;\s*$/, newEndpoints);

fs.writeFileSync('src/routes/api_routes/contents.ts', code);
