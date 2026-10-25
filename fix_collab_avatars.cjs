const fs = require('fs');
let code = fs.readFileSync('views/partials/collab-hub.ejs', 'utf8');

const commentOld = `                        <div class="comment-item">
                            <div class="comment-header"><span>\${c.user}</span><span>\${new Date(c.timestamp).toLocaleString('fa-IR')}</span></div>
                            <div class="comment-text">\${c.text}</div>
                        </div>`;
const commentNew = `                        <div class="comment-item" style="display:flex; gap:12px; align-items:flex-start;">
                            <img src="\${c.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(c.user) + '&background=random'}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border: 1px solid var(--border-color);" alt="\${c.user}">
                            <div style="flex:1;">
                                <div class="comment-header"><span style="font-weight:bold; color:var(--text-dark);">\${c.user}</span><span style="font-size:0.75rem;">\${new Date(c.timestamp).toLocaleString('fa-IR')}</span></div>
                                <div class="comment-text" style="margin-top:4px;">\${c.text}</div>
                            </div>
                        </div>`;

const attachOld = `                        <div class="attachment-item">
                            <div class="comment-header"><span>\${a.uploader}</span><span>\${new Date(a.timestamp).toLocaleString('fa-IR')}</span></div>
                            <a href="\${a.url}" target="_blank" style="color:var(--primary-color); text-decoration:none;">🔗 \${a.name}</a>
                        </div>`;
const attachNew = `                        <div class="attachment-item" style="display:flex; gap:12px; align-items:flex-start;">
                            <img src="\${a.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(a.uploader) + '&background=random'}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border: 1px solid var(--border-color);" alt="\${a.uploader}">
                            <div style="flex:1;">
                                <div class="comment-header"><span style="font-weight:bold; color:var(--text-dark);">\${a.uploader}</span><span style="font-size:0.75rem;">\${new Date(a.timestamp).toLocaleString('fa-IR')}</span></div>
                                <a href="\${a.url}" target="_blank" style="color:var(--primary-color); text-decoration:none; display:inline-block; margin-top:4px;">🔗 \${a.name}</a>
                            </div>
                        </div>`;

const historyOld = `                        <div class="history-item">
                            <div class="comment-header"><span>\${h.user}</span><span>\${new Date(h.timestamp).toLocaleString('fa-IR')}</span></div>
                            <div class="comment-text">فیلد <b>\${h.field}</b> تغییر کرد.</div>
                            <div style="font-size:0.8rem; color:var(--text-gray); margin-top:4px;">قبلی: \${h.old_value || '-'}</div>
                            <div style="font-size:0.8rem; color:var(--text-gray);">جدید: \${h.new_value || '-'}</div>
                        </div>`;
const historyNew = `                        <div class="history-item" style="display:flex; gap:12px; align-items:flex-start;">
                            <img src="\${h.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(h.user) + '&background=random'}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border: 1px solid var(--border-color);" alt="\${h.user}">
                            <div style="flex:1;">
                                <div class="comment-header"><span style="font-weight:bold; color:var(--text-dark);">\${h.user}</span><span style="font-size:0.75rem;">\${new Date(h.timestamp).toLocaleString('fa-IR')}</span></div>
                                <div class="comment-text" style="margin-top:4px;">فیلد <b>\${h.field}</b> تغییر کرد.</div>
                                <div style="font-size:0.8rem; color:var(--text-gray); margin-top:4px;">قبلی: \${h.old_value || '-'}</div>
                                <div style="font-size:0.8rem; color:var(--text-gray);">جدید: \${h.new_value || '-'}</div>
                            </div>
                        </div>`;

code = code.replace(commentOld, commentNew);
code = code.replace(attachOld, attachNew);
code = code.replace(historyOld, historyNew);

fs.writeFileSync('views/partials/collab-hub.ejs', code);
