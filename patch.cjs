const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const target = `apiRouter.get("/get_leaves", checkPermission("leaves"), (req, res) => {
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
});`;

const replacement = `apiRouter.get("/get_leaves", checkPermission("leaves"), (req, res) => {
  const sessionUser = req.session.user;
  const roleInfo = getRoleInfoForUser(sessionUser);
  const isAdmin = roleInfo.permissions.includes("admin") || roleInfo.permissions.includes("all");
  
  if (!Array.isArray(leaves)) leaves = [];
  if (!Array.isArray(colleagues)) colleagues = [];

  let userLeaves = leaves;
  if (!isAdmin && sessionUser.username !== "admin") {
    userLeaves = leaves.filter(l => l.user_id === sessionUser.id);
  }

  const jalaaliDate = new Intl.DateTimeFormat("fa-IR-u-nu-latn", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const isHistory = req.query.type === 'history';

  let filteredLeaves = userLeaves;
  if (isHistory) {
    filteredLeaves = userLeaves.filter(l => l.start_date < jalaaliDate);
  } else {
    filteredLeaves = userLeaves.filter(l => l.start_date >= jalaaliDate);
  }

  filteredLeaves.sort((a, b) => b.start_date.localeCompare(a.start_date));

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const total = filteredLeaves.length;

  if (isHistory) {
    const startIdx = (page - 1) * limit;
    filteredLeaves = filteredLeaves.slice(startIdx, startIdx + limit);
  }

  const enrichedLeaves = filteredLeaves.map(l => {
    const user = colleagues.find(c => c.id === l.user_id);
    const sub = colleagues.find(c => c.id === l.substitute_id);
    return {
      ...l,
      user_name: user ? user.full_name : "نامشخص",
      substitute_name: sub ? sub.full_name : "بدون جانشین"
    };
  });
  
  res.json({ 
    status: "success", 
    data: enrichedLeaves, 
    isAdmin: isAdmin || sessionUser.username === "admin",
    total: total,
    page: page,
    limit: limit
  });
});`;

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync('server.ts', code);
  console.log("Success");
} else {
  console.log("Target not found");
}
