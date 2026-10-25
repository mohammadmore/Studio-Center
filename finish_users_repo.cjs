const fs = require('fs');
let code = fs.readFileSync('src/routes/api_routes/users_wip.ts', 'utf8');

// Replace roles with await repo.getAllRoles()
code = code.replace(/res\.json\(\{ status: "success", data: roles \}\);/g, 'res.json({ status: "success", data: await repo.getAllRoles() });');

// Re-write the /manage_roles POST handler logic to use the repo
code = code.replace(/if \(action === "create"\) \{[\s\S]*?\} else if \(action === "delete"\) \{[\s\S]*?\} else if \(action === "update_order"\) \{[\s\S]*?\} else if \(action === "edit"\) \{[\s\S]*?\}/g, 
`if (action === "create") {
      await repo.createRole({ name, permissions: permissions || {} });
      res.json({ status: "success" });
    } else if (action === "delete") {
      await repo.deleteRole(id);
      res.json({ status: "success" });
    } else if (action === "update_order") {
      // In a real DB this would be handled differently, 
      // but we mapped the repo function to handle it exactly how it was
      const rolesList = await repo.getAllRoles();
      const index = rolesList.findIndex((r) => r.id == id);
      const targetIndex = req.body.direction === "up" ? index - 1 : index + 1;
      if (index > -1 && targetIndex >= 0 && targetIndex < rolesList.length) {
        const temp = rolesList[index];
        rolesList[index] = rolesList[targetIndex];
        rolesList[targetIndex] = temp;
        await repo.updateRoleOrder(rolesList);
      }
      res.json({ status: "success" });
    } else if (action === "edit") {
      await repo.updateRole(id, name, permissions || {});
      res.json({ status: "success" });
    }`);

// Fix get_roles to be async mapping
code = code.replace(/const mappedRoles = roles\.map\(\(r\) => \(\{/g, 'const rolesList = await repo.getAllRoles();\n    const mappedRoles = rolesList.map((r) => ({');

// Re-write get_colleagues
code = code.replace(/const mapped = colleagues/g, 'const allColleagues = await repo.getAllUsers();\n  const allRoles = await repo.getAllRoles();\n  const mapped = allColleagues');
code = code.replace(/const role = roles\.find\(\(r\) => r\.id === c\?\.role_id\);/g, 'const role = allRoles.find((r) => r.id === c?.role_id);');

// Clean up direct saveDatabase calls since repo does it
code = code.replace(/saveDatabase\(\);/g, '');

fs.writeFileSync('src/routes/api_routes/users.ts', code);
