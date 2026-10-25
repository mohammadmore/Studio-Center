const fs = require('fs');
let code = fs.readFileSync('views/partials/collab-hub.ejs', 'utf8');

// Replace loadDepotData with loadDepot and add local state update
const socketOnCommentRegex = /socket\.on\("new_comment"[\s\S]*?showNotification\("کامنت جدید"[\s\S]*?\n\s*\}\);/;
const socketOnCommentReplacement = `
    socket.on("new_comment", (data) => {
        // Update local state immediately
        if (window.allDepotItems) {
            const item = window.allDepotItems.find(i => i.id == data.contentId);
            if (item) {
                if (!item.comments) item.comments = [];
                // Prevent duplicate if already added
                if (!item.comments.find(c => c.id == data.comment.id)) {
                    item.comments.push(data.comment);
                }
            }
        }

        if (window.currentEditingContentId == data.contentId) {
            renderCollabHub(data.contentId);
        }
        showNotification("کامنت جدید", { body: \`\${data.comment.user}: \${data.comment.text}\` });
    });
`;

code = code.replace(socketOnCommentRegex, socketOnCommentReplacement);

const socketOnAttachRegex = /socket\.on\("new_attachment"[\s\S]*?showNotification\("فایل جدید ضمیمه شد"[\s\S]*?\n\s*\}\);/;
const socketOnAttachReplacement = `
    socket.on("new_attachment", (data) => {
        // Update local state immediately
        if (window.allDepotItems) {
            const item = window.allDepotItems.find(i => i.id == data.contentId);
            if (item) {
                if (!item.attachments) item.attachments = [];
                if (!item.attachments.find(a => a.id == data.attachment.id)) {
                    item.attachments.push(data.attachment);
                }
            }
        }

        if (window.currentEditingContentId == data.contentId) {
            renderCollabHub(data.contentId);
        }
        showNotification("فایل جدید ضمیمه شد", { body: \`فایل \${data.attachment.name} افزوده شد.\` });
    });
`;

code = code.replace(socketOnAttachRegex, socketOnAttachReplacement);

const socketOnUpdateRegex = /socket\.on\("content_updated"[\s\S]*?showNotification\("محتوا بروز شد"[\s\S]*?\n\s*\}\);/;
const socketOnUpdateReplacement = `
    socket.on("content_updated", (data) => {
        if (typeof loadDepot === "function") {
            if (window.currentEditingContentId != data.contentId) {
                loadDepot(true); // silent refresh
            }
        }
        showNotification("محتوا بروز شد", { body: \`محتوای \${data.card?.title || 'بدون عنوان'} تغییر کرد.\` });
    });
`;
code = code.replace(socketOnUpdateRegex, socketOnUpdateReplacement);

fs.writeFileSync('views/partials/collab-hub.ejs', code);
