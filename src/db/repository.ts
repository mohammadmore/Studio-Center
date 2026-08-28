/**
 * Repository Layer - Async Data Access
 * 
 * This layer abstracts the database implementation.
 * Currently, it uses the existing in-memory state and Firebase for persistence.
 * 
 * MIGRATION TO POSTGRESQL:
 * When you migrate to your own host with PostgreSQL, you ONLY need to change the 
 * implementation of these functions (e.g. using Drizzle ORM `db.select()...`).
 * Your API controllers will not need any changes because they will already be using
 * these async functions.
 */

import { roles, colleagues, organizations } from "../store/state.js";
import { saveDatabase } from "../store/db.js";

// --- ROLES REPOSITORY ---
export async function getAllRoles() {
  // Simulate async DB call
  return Promise.resolve([...roles]);
}

export async function getRoleById(id: number) {
  return Promise.resolve(roles.find(r => r.id === id));
}

// --- USERS REPOSITORY ---
export async function getAllUsers() {
  return Promise.resolve([...colleagues]);
}

export async function getUserById(id: number) {
  return Promise.resolve(colleagues.find(c => c.id === id));
}

export async function getUserByUsername(username: string) {
  return Promise.resolve(colleagues.find(c => c.username === username));
}

// --- ORGANIZATIONS REPOSITORY ---
export async function getAllOrganizations() {
  return Promise.resolve([...organizations]);
}

// --- MUTATION METHODS (To be implemented with Drizzle in the future) ---

export async function createRole(roleData: any) {
  const id = roles.length > 0 ? Math.max(...roles.map((r) => r.id)) + 1 : 1;
  const newRole = { id, ...roleData };
  roles.push(newRole);
  saveDatabase();
  return newRole;
}

export async function updateRole(id: number, name: string, permissions: any) {
  const role = roles.find((r) => r.id == id);
  if (role) {
    role.name = name;
    role.permissions = permissions;
    saveDatabase();
    return true;
  }
  return false;
}

export async function deleteRole(id: number) {
  const idx = roles.findIndex(r => r.id == id);
  if (idx > -1) {
    roles.splice(idx, 1);
    // Also remove from colleagues
    colleagues.forEach((c) => {
      if (c.role_id == id) c.role_id = 0;
    });
    saveDatabase();
    return true;
  }
  return false;
}

export async function updateRoleOrder(rolesList: any[]) {
  // Clear and update the array in place
  roles.length = 0;
  roles.push(...rolesList);
  saveDatabase();
  return true;
}

export async function createUser(userData: any) {
  const id = colleagues.length > 0 ? Math.max(...colleagues.map((c) => c.id)) + 1 : 1;
  const newUser = { id, ...userData };
  colleagues.push(newUser);
  saveDatabase();
  return newUser;
}

export async function updateUser(id: number, updateData: any) {
  const idx = colleagues.findIndex((c) => c.id == id);
  if (idx > -1) {
    Object.assign(colleagues[idx], updateData);
    saveDatabase();
    return colleagues[idx];
  }
  return null;
}

export async function updateColleaguesOrder(colleaguesList: any[]) {
  colleagues.length = 0;
  colleagues.push(...colleaguesList);
  saveDatabase();
  return true;
}
