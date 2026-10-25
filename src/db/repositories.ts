import { FirebaseRepository } from "./FirebaseRepository.js";

// Export the instances of your repositories.
// When migrating to PostgreSQL, you just replace `FirebaseRepository` 
// with `PostgresRepository` in this single file.

export const UserRepository = new FirebaseRepository<any>("users");
export const LeaveRepository = new FirebaseRepository<any>("leaves");
export const AuditLogRepository = new FirebaseRepository<any>("audit_logs");
export const OrganizationRepository = new FirebaseRepository<any>("organizations");
export const RoleRepository = new FirebaseRepository<any>("roles");
export const SettingsRepository = new FirebaseRepository<any>("settings");

// You can add more repositories here as we break down server.ts
