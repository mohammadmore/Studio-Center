const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const oldFunc = `apiRouter.post("/save_leave", (req, res, next) => { console.log("SAVE LEAVE REACHED", req.body); next(); }, checkPermission("leaves"), (req, res) => {
  const { user_id: leave_user, substitute_id: substitute_user, start_date, end_date } = req.body;
  const session2 = req.session;
  let user_id = parseInt(leave_user);
  const roleInfo = getRoleInfoForUser(session2.user);
  if (
    user_id != session2.user.id &&
    !roleInfo.permissions.includes("admin") &&
    !roleInfo.permissions.includes("all")
  ) {
    return res
      .status(403)
      .json({
        status: "error",
        message:
          "\\u0634\\u0645\\u0627 \\u0641\\u0642\\u0637 \\u0645\\u06CC\\u200C\\u062A\\u0648\\u0627\\u0646\\u06CC\\u062F \\u0628\\u0631\\u0627\\u06CC \\u062E\\u0648\\u062F \\u0645\\u0631\\u062E\\u0635\\u06CC \\u062B\\u0628\\u062A \\u06A9\\u0646\\u06CC\\u062F",
      });
  }
  const sub_id = substitute_user ? parseInt(substitute_user) : void 0;
  const colleague = colleagues.find((c) => c.id === user_id);
  const sub = colleagues.find((c) => c.id === sub_id);
  if (colleague) {
    colleague.status = "on_leave";
  }
  if (sub_id && sub && colleague) {
    const oldName = colleague.full_name;
    const newName = sub.full_name;
    contents.forEach((c) => {
      if (c.project_manager === oldName || c.project_manager == user_id) {
        c.project_manager = newName;
      }
      if (c.assigned_colleagues && Array.isArray(c.assigned_colleagues)) {
        const idx = c.assigned_colleagues.findIndex(
          (name) => name === oldName || parseInt(name) === user_id,
        );
        if (idx !== -1) {
          c.assigned_colleagues[idx] = newName;
        }
      }
    });
  }
  const newLeave = {
    id: leaves.length > 0 ? Math.max(...leaves.map((x) => x.id)) + 1 : 1,
    user_id,
    substitute_id: sub_id || 0,
    start_date:
      start_date ||
      new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
    end_date:
      end_date ||
      new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
    status: "approved",
  };
  leaves.push(newLeave);
  saveDatabase();
  res.json({
    status: "success",
    message:
      "\\u0645\\u0631\\u062E\\u0635\\u06CC \\u0628\\u0627 \\u0645\\u0648\\u0641\\u0642\\u06CC\\u062A \\u062B\\u0628\\u062A \\u0648 \\u062A\\u0633\\u06A9\\u200C\\u0647\\u0627 \\u0645\\u0646\\u062A\\u0642\\u0644 \\u0634\\u062F",
  });
});`;

const newFunc = `apiRouter.post("/save_leave", checkPermission("leaves"), (req, res) => {
  try {
    const { user_id: leave_user, substitute_id: substitute_user, start_date, end_date } = req.body;
    const session2 = req.session;
    let user_id = parseInt(leave_user);
    const roleInfo = getRoleInfoForUser(session2.user);
    if (
      user_id != session2.user.id &&
      !roleInfo.permissions.includes("admin") &&
      !roleInfo.permissions.includes("all")
    ) {
      return res
        .status(403)
        .json({
          status: "error",
          message:
            "\\u0634\\u0645\\u0627 \\u0641\\u0642\\u0637 \\u0645\\u06CC\\u200C\\u062A\\u0648\\u0627\\u0646\\u06CC\\u062F \\u0628\\u0631\\u0627\\u06CC \\u062E\\u0648\\u062F \\u0645\\u0631\\u062E\\u0635\\u06CC \\u062B\\u0628\\u062A \\u06A9\\u0646\\u06CC\\u062F",
        });
    }
    const sub_id = substitute_user ? parseInt(substitute_user) : void 0;
    
    if (!Array.isArray(colleagues)) colleagues = [];
    if (!Array.isArray(leaves)) leaves = [];
    if (!Array.isArray(contents)) contents = [];

    const colleague = colleagues.find((c) => c.id === user_id);
    const sub = colleagues.find((c) => c.id === sub_id);
    if (colleague) {
      colleague.status = "on_leave";
    }
    if (sub_id && sub && colleague) {
      const oldName = colleague.full_name;
      const newName = sub.full_name;
      contents.forEach((c) => {
        if (c.project_manager === oldName || c.project_manager == user_id) {
          c.project_manager = newName;
        }
        if (c.assigned_colleagues && Array.isArray(c.assigned_colleagues)) {
          const idx = c.assigned_colleagues.findIndex(
            (name) => name === oldName || parseInt(name) === user_id,
          );
          if (idx !== -1) {
            c.assigned_colleagues[idx] = newName;
          }
        }
      });
    }
    
    const maxId = leaves.length > 0 ? Math.max(...leaves.map(x => x.id || 0)) : 0;
    const newLeave = {
      id: isNaN(maxId) ? 1 : maxId + 1,
      user_id,
      substitute_id: sub_id || 0,
      start_date:
        start_date ||
        new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
      end_date:
        end_date ||
        new Date().toLocaleDateString("fa-IR", { numberingSystem: "latn" }),
      status: "approved",
    };
    leaves.push(newLeave);
    saveDatabase();
    res.json({
      status: "success",
      message:
        "\\u0645\\u0631\\u062E\\u0635\\u06CC \\u0628\\u0627 \\u0645\\u0648\\u0641\\u0642\\u06CC\\u062A \\u062B\\u0628\\u062A \\u0648 \\u062A\\u0633\\u06A9\\u200C\\u0647\\u0627 \\u0645\\u0646\\u062A\\u0642\\u0644 \\u0634\\u062F",
    });
  } catch (err) {
    console.error(err);
    res.json({ status: "error", message: err.message });
  }
});`;

code = code.replace(oldFunc, newFunc);
fs.writeFileSync('server.ts', code);
