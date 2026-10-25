import * as repo from "../../db/repository.js";
import { body, validationResult } from "express-validator";
import express from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import * as jalaali from "jalaali-js";
import bcrypt from "bcrypt";
import xlsx from "xlsx";
import { v4 as uuidv4 } from "uuid";
import { 
  roles, colleagues, organizations, collections, contents, settings, leaves, audit_logs, 
  recycle_bin, batch_operations, notifications, tokens, templatesData, 
  contentTemplates, templateSuggestions, expenses, invoices, mediaAssets, 
  smartEventsBank, clientSelections 
} from "../../store/state.js";
import { addDaysToJalali, toPersianDigits } from "../../utils/helpers.js";
import { getRoleInfoForUser, getPermissionCategories } from "../../utils/authUtils.js";
import { addAuditLog, logContentActivity, addNotification } from "../../utils/logger.js";
import { apiAuthGuard, checkPermission } from "../../middleware/auth.js";
import { saveDatabase } from "../../store/db.js"; // Assuming saveDatabase will be here, or we can just import it from server.js for now.

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

// We need to handle `__dirname` in ESM if used, but let's just dump the code first.
const subRouter = express.Router();

subRouter.get(
  "/manage_roles",
  checkPermission("manage_roles"),
  async (req, res) => {
    res.json({ status: "success", data: await repo.getAllRoles() });
  },
);

subRouter.post(
  "/manage_roles",
  checkPermission("manage_roles"),
  async (req, res) => {
    const { action, id, name, permissions } = req.body;
    if (action === "add") {
      const newRole = {
        id: roles.length > 0 ? Math.max(...roles.map((r) => r.id)) + 1 : 1,
        name,
        permissions: permissions || [],
      };
      roles.push(newRole);
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message:
          "نقش جدید اضافه شد",
      });
    } else if (action === "edit") {
      if (id == 1) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "نقش سیستمی مدیر کل قابل ویرایش نیست",
          });
      }
      const role = roles.find((r) => r.id == id);
      if (role) {
        role.name = name || role.name;
        if (permissions) role.permissions = permissions;
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "نقش به‌روزرسانی شد",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "نقش پیدا نشد",
          });
      }
    } else if (action === "archive") {
      const col = collections.find((c) => c.id === parseInt(id));
      if (col) {
        col.status = "archived";
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "مجموعه آرشیو شد",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "مجموعه یافت نشد",
          });
      }
    } else if (action === "restore") {
      const col = collections.find((c) => c.id === parseInt(id));
      if (col) {
        col.status = "active";
        saveDatabase().catch(console.error);
        res.json({
          status: "success",
          message:
            "مجموعه بازگردانی شد",
        });
      } else {
        res
          .status(404)
          .json({
            status: "error",
            message:
              "مجموعه یافت نشد",
          });
      }
    } else if (action === "delete") {
      if (id == 1) {
        return res
          .status(400)
          .json({
            status: "error",
            message:
              "شما نمی‌توانید نقش مدیر کل را حذف کنید",
          });
      }
      const idx = roles.findIndex(r => r.id == id); if (idx > -1) roles.splice(idx, 1);
      colleagues.forEach((c) => {
        if (c?.role_id == id) {
          if (c) c.role_id = 3;
        }
      });
      saveDatabase().catch(console.error);
      res.json({
        status: "success",
        message: "نقش حذف شد",
      });
    } else if (action === "reorder") {
      const { direction } = req.body;
      const index = roles.findIndex((r) => r.id == id);
      if (index !== -1) {
        let targetIndex = -1;
        if (direction === "up" && index > 0) targetIndex = index - 1;
        else if (direction === "down" && index < roles.length - 1)
          targetIndex = index + 1;
        if (targetIndex !== -1) {
          const temp = roles[index];
          roles[index] = roles[targetIndex];
          roles[targetIndex] = temp;
          saveDatabase().catch(console.error);
          return res.json({ status: "success" });
        }
      }
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "امکان جابجایی وجود ندارد",
        });
    } else {
      res
        .status(400)
        .json({
          status: "error",
          message:
            "عملیات نامعتبر",
        });
    }
  },
);

subRouter.get("/get_roles", async (req, res) => {
  const rolesList = await repo.getAllRoles();
    const mappedRoles = rolesList.map((r) => ({
    id: r.id,
    name: r.name,
    role_name: r.name,
    permissions: r.permissions,
  }));
  res.json({ status: "success", roles: mappedRoles, data: mappedRoles });
});

subRouter.get("/manage_users", checkPermission("add-user"), async (req, res) => {
  const includeInactive =
    req.query.include_inactive === "1" || req.query.all === "1";
  const allColleagues = await repo.getAllUsers();
  const allRoles = await repo.getAllRoles();
  const mapped = allColleagues
    .filter((c) => (includeInactive ? true : c.is_active !== 0))
    .map((c) => {
      const role = allRoles.find((r) => r.id === c?.role_id);
      const role_name = role
        ? role.name
        : "کارشناس";
      return { ...c, role_name };
    });
  res.json({ status: "success", data: mapped, users: mapped });
});

subRouter.post("/manage_users", checkPermission("add-user"), async (req, res) => {
  const {
    action,
    id,
    full_name,
    fullName,
    role_id,
    avatar_url,
    phone,
    email,
    portfolio,
    workType,
    work_type,
    capacity,
    startDate,
    start_date,
    shaba,
    username,
    password,
  } = req.body;
  if (action === "restore" || action === "activate") {
    const idx = colleagues.findIndex((c) => c.id == id);
    if (idx !== -1) {
      colleagues[idx].is_active = 1;
      colleagues[idx].status = "active";
      
      return res.json({
        status: "success",
        message:
          "حساب همکار با موفقیت فعال گردید",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "کاربر یافت نشد",
      });
  }
  if (action === "delete") {
    if (id == 1) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "حساب مدیر کل قابل حذف نیست",
        });
    }
    if (req.session.user && req.session.user.id == id) {
      return res
        .status(400)
        .json({
          status: "error",
          message:
            "شما نمی‌توانید حساب کاربری خود را غیرفعال کنید",
        });
    }
    const idx = colleagues.findIndex((c) => c.id == id);
    if (idx !== -1) {
      colleagues[idx].is_active = 0;
      colleagues[idx].status = "inactive";
      
      return res.json({
        status: "success",
        message:
          "کاربر غیرفعال شد",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "کاربر یافت نشد",
      });
  }
  if (action === "edit") {
    const idx = colleagues.findIndex((c) => c.id == id);
    if (idx !== -1) {
      if (id == 1 && req.session.user && req.session.user.id != 1) {
        return res
          .status(403)
          .json({
            status: "error",
            message:
              "شما مجاز به ویرایش اطلاعات مدیر کل نیستید",
          });
      }
      colleagues[idx].full_name =
        full_name || fullName || colleagues[idx].full_name;
      if (username) colleagues[idx].username = username;
      if (password) {
        if (password.length < 6)
          return res
            .status(400)
            .json({
              status: "error",
              message:
                "رمز عبور باید حداقل ۶ کاراکتر باشد.",
            });
        colleagues[idx].passwordHash = bcrypt.hashSync(password, 10);
      }
      if (role_id) {
        if (
          req.session.user &&
          req.session.user.id === id &&
          parseInt(role_id) !== colleagues[idx]?.role_id
        ) {
          return res
            .status(400)
            .json({
              status: "error",
              message:
                "شما نمی‌توانید نقش خود را تغییر دهید",
            });
        }
        if (colleagues[idx]) colleagues[idx].role_id = parseInt(role_id);
      }
      if (avatar_url) colleagues[idx].avatar_url = avatar_url;
      if (phone !== void 0) colleagues[idx].phone = phone;
      if (email !== void 0) colleagues[idx].email = email;
      if (portfolio !== void 0) colleagues[idx].portfolio = portfolio;
      if (workType !== void 0 || work_type !== void 0)
        colleagues[idx].work_type = workType || work_type;
      if (capacity !== void 0) colleagues[idx].capacity = capacity;
      if (startDate !== void 0 || start_date !== void 0)
        colleagues[idx].start_date = startDate || start_date;
      if (shaba !== void 0) colleagues[idx].shaba = shaba;
      
      return res.json({
        status: "success",
        message:
          "اطلاعات با موفقیت به‌روزرسانی شد",
      });
    }
    return res
      .status(404)
      .json({
        status: "error",
        message:
          "کاربر یافت نشد",
      });
  }
  if (action === "reorder") {
    const { direction } = req.body;
    const activeColleagues = colleagues.filter(
      (c) => c.is_active === 1 || c.status === "active",
    );
    const activeIndex = activeColleagues.findIndex((c) => c.id == id);
    if (activeIndex !== -1) {
      let targetActiveIndex = -1;
      if (direction === "up" && activeIndex > 0)
        targetActiveIndex = activeIndex - 1;
      else if (
        direction === "down" &&
        activeIndex < activeColleagues.length - 1
      )
        targetActiveIndex = activeIndex + 1;
      if (targetActiveIndex !== -1) {
        const targetId = activeColleagues[targetActiveIndex].id;
        const realIndex = colleagues.findIndex((c) => c.id == id);
        const targetRealIndex = colleagues.findIndex((c) => c.id == targetId);
        const temp = colleagues[realIndex];
        colleagues[realIndex] = colleagues[targetRealIndex];
        colleagues[targetRealIndex] = temp;
        
        return res.json({
          status: "success",
          message:
            "ترتیب تغییر کرد",
        });
      }
    }
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "امکان جابجایی وجود ندارد",
      });
  }
  if (password && password.length < 6) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "رمز عبور باید حداقل ۶ کاراکتر باشد.",
      });
  }
  const newUser = {
    id:
      colleagues.length > 0 ? Math.max(...colleagues.map((c) => c.id)) + 1 : 1,
    username: username || email || "user_" + Date.now(),
    passwordHash: password ? bcrypt.hashSync(password, 10) : "",
    full_name:
      full_name ||
      fullName ||
      "همکار جدید",
    role_id: role_id ? parseInt(role_id) : 3,
    phone: phone || "",
    email: email || "",
    portfolio: portfolio || "",
    work_type:
      workType ||
      work_type ||
      "تماموقت (حضوری)",
    capacity: capacity || "",
    start_date: startDate || start_date || "",
    shaba: shaba || "",
    is_active: 1,
    avatar_url:
      avatar_url ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    status: "active",
  };
  colleagues.push(newUser);
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "حساب کاربری با موفقیت ساخته شد",
  });
});

subRouter.get("/get_colleagues", async (req, res) => {
  const allColleagues = await repo.getAllUsers();
  const allRoles = await repo.getAllRoles();
  const mapped = allColleagues
    .filter((c) => c.is_active !== 0)
    .map((c) => {
      const role = allRoles.find((r) => r.id === c?.role_id);
      const role_name = role
        ? role.name
        : "کارشناس";
      const { passwordHash, ...safeC } = c;
      return { ...safeC, role_name };
    });
  res.json({ status: "success", users: mapped, data: mapped });
});

subRouter.post("/save_user", checkPermission("add-user"), async (req, res) => {
  const {
    full_name,
    role_id,
    username,
    password,
    fullName,
    phone,
    email,
    portfolio,
    workType,
    work_type,
    capacity,
    startDate,
    start_date,
    shaba,
    avatar_url,
  } = req.body;
  const targetUsername = username || email || "user_" + Date.now();
  if (
    colleagues.find((c) => c.username === targetUsername) ||
    organizations.find((o) => o.username === targetUsername)
  ) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "این نام کاربری قبلا ثبت شده است.",
      });
  }
  if (password && password.length < 6) {
    return res
      .status(400)
      .json({
        status: "error",
        message:
          "رمز عبور باید حداقل ۶ کاراکتر باشد.",
      });
  }
  const newUser = {
    id:
      colleagues.length > 0 ? Math.max(...colleagues.map((c) => c.id)) + 1 : 1,
    username: targetUsername,
    passwordHash: password ? bcrypt.hashSync(password, 10) : "",
    full_name:
      full_name ||
      fullName ||
      "همکار جدید",
    role_id: role_id ? parseInt(role_id) : 3,
    phone: phone || "",
    email: email || "",
    portfolio: portfolio || "",
    work_type:
      workType ||
      work_type ||
      "تماموقت (حضوری)",
    capacity: capacity || "",
    start_date: startDate || start_date || "",
    shaba: shaba || "",
    is_active: 1,
    avatar_url:
      avatar_url ||
      "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
    status: "active",
  };
  colleagues.push(newUser);
  saveDatabase().catch(console.error);
  res.json({
    status: "success",
    message:
      "حساب کاربری با موفقیت ساخته شد",
  });
});

subRouter.get("/get_all_roles", async (req, res) => res.json(await repo.getAllRoles()));

subRouter.get("/get_all_users", async (req, res) => res.json(await repo.getAllUsers()));

export default subRouter;
