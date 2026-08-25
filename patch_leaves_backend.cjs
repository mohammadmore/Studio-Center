const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Replace the entire /save_leave block
const saveLeaveStart = `apiRouter.post("/save_leave", checkPermission("leaves"), async (req, res) => {`;
const saveLeaveEndIndex = code.indexOf(`});`, code.indexOf(`console.error("Error in /save_leave:", err);`)) + 3;

const newLeaveApis = `
apiRouter.get("/get_leaves", checkPermission("leaves"), (req, res) => {
  const sessionUser = req.session.user;
  const roleInfo = getRoleInfoForUser(sessionUser);
  const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all");
  
  if (!Array.isArray(leaves)) leaves = [];
  if (!Array.isArray(colleagues)) colleagues = [];

  let userLeaves = leaves;
  if (!isAdmin && sessionUser.username !== "admin") {
    userLeaves = leaves.filter(l => l.user_id === sessionUser.id);
  }

  const enrichedLeaves = userLeaves.map(l => {
    const user = colleagues.find(c => c.id === l.user_id);
    const sub = colleagues.find(c => c.id === l.substitute_id);
    return {
      ...l,
      user_name: user ? user.full_name : "نامشخص",
      substitute_name: sub ? sub.full_name : "بدون جانشین"
    };
  });
  
  res.json({ status: "success", data: enrichedLeaves, isAdmin: isAdmin || sessionUser.username === "admin" });
});

apiRouter.post("/update_leave", checkPermission("leaves"), (req, res) => {
  const { id, status } = req.body;
  const sessionUser = req.session.user;
  const roleInfo = getRoleInfoForUser(sessionUser);
  const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all") || sessionUser.username === "admin";

  if (!isAdmin) {
    return res.status(403).json({ status: "error", message: "فقط مدیر می‌تواند وضعیت مرخصی را تغییر دهد." });
  }

  if (!Array.isArray(leaves)) leaves = [];
  const leave = leaves.find(l => l.id === parseInt(id));
  if (!leave) {
    return res.status(404).json({ status: "error", message: "مرخصی یافت نشد." });
  }

  leave.status = status; 

  if (status === "approved") {
    const colleague = colleagues.find((c) => c.id === leave.user_id);
    if (colleague) {
      colleague.status = "on_leave";
      if (leave.substitute_id) {
        const sub = colleagues.find((c) => c.id === leave.substitute_id);
        if (sub) {
          const oldName = colleague.full_name;
          const newName = sub.full_name;
          if (Array.isArray(contents)) {
            contents.forEach((c) => {
              if (c.project_manager === oldName || c.project_manager == leave.user_id) {
                c.project_manager = newName;
              }
              if (c.assigned_colleagues && Array.isArray(c.assigned_colleagues)) {
                const idx = c.assigned_colleagues.findIndex(
                  (name) => name === oldName || name == leave.user_id,
                );
                if (idx !== -1) {
                  c.assigned_colleagues[idx] = newName;
                }
              }
            });
          }
        }
      }
    }
  }

  saveDatabase();
  res.json({ status: "success", message: "وضعیت مرخصی بروزرسانی شد." });
});

apiRouter.post("/delete_leave", checkPermission("leaves"), (req, res) => {
  const { id } = req.body;
  const sessionUser = req.session.user;
  const roleInfo = getRoleInfoForUser(sessionUser);
  const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all") || sessionUser.username === "admin";
  
  if (!Array.isArray(leaves)) leaves = [];
  const leave = leaves.find(l => l.id === parseInt(id));
  if(!leave) {
    return res.status(404).json({ status: "error", message: "یافت نشد" });
  }

  if (!isAdmin && leave.user_id !== sessionUser.id) {
    return res.status(403).json({ status: "error", message: "دسترسی ندارید" });
  }

  const idx = leaves.findIndex(l => l.id === parseInt(id));
  if(idx > -1) leaves.splice(idx, 1);

  saveDatabase();
  res.json({ status: "success", message: "مرخصی با موفقیت حذف شد." });
});

apiRouter.post("/save_leave", checkPermission("leaves"), async (req, res) => {
  try {
    const { user_id: leave_user, substitute_id: substitute_user, start_date, end_date } = req.body;
    const session2 = req.session;
    if (!session2 || !session2.user) {
      return res.status(401).json({ status: "error", message: "لطفا وارد شوید." });
    }
    
    let user_id = parseInt(leave_user);
    if (isNaN(user_id)) {
      return res.status(400).json({ status: "error", message: "همکار متقاضی نامعتبر است." });
    }

    const roleInfo = getRoleInfoForUser(session2.user);
    const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all") || session2.user.username === "admin";

    if (user_id !== session2.user.id && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "شما فقط می‌توانید برای خود مرخصی ثبت کنید",
      });
    }

    let sub_id = null;
    if (substitute_user && String(substitute_user).trim() !== "") {
      sub_id = parseInt(substitute_user);
      if (isNaN(sub_id)) sub_id = null;
    }
    
    if (!Array.isArray(colleagues)) colleagues = [];
    if (!Array.isArray(leaves)) leaves = [];
    
    const maxId = leaves.length > 0 ? Math.max(...leaves.map(x => x.id || 0)) : 0;
    const newLeave = {
      id: isNaN(maxId) ? 1 : maxId + 1,
      user_id,
      substitute_id: sub_id || 0,
      start_date: start_date || new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
      end_date: end_date || new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
      status: "pending",
      created_at: new Date().toISOString()
    };
    
    leaves.push(newLeave);
    
    saveDatabase();
    
    return res.json({
      status: "success",
      message: "درخواست مرخصی شما با موفقیت ثبت شد و در انتظار تایید مدیریت است.",
    });
  } catch (err) {
    console.error("Error in /save_leave:", err);
    return res.status(500).json({ status: "error", message: "خطای داخلی سرور هنگام ثبت مرخصی." });
  }
});
`;

let startIndex = code.indexOf(saveLeaveStart);
let before = code.substring(0, startIndex);
let after = code.substring(saveLeaveEndIndex);
fs.writeFileSync('server.ts', before + newLeaveApis + after);
console.log("Patched server.ts");
