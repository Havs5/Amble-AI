/**
 * Role-Based Access Control (RBAC) — single source of truth.
 *
 * Three tiers: Super Admin (full clearance) › Manager › Staff.
 *
 * Backward compatibility: legacy stored roles still work —
 *   'admin' → super admin, 'user' → staff. So existing users keep their access
 *   without a data migration; new users are assigned the new role values.
 *
 * Every role check in the app should go through this module (never compare
 * `user.role === 'admin'` directly).
 */

export type UserRole = 'superadmin' | 'manager' | 'staff';

export const ROLES: UserRole[] = ['superadmin', 'manager', 'staff'];

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: 'Super Admin',
  manager: 'Manager',
  staff: 'Staff',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  superadmin: 'Full clearance — manages everyone (including Managers) and all settings.',
  manager: 'Manages Staff, news, the time clock, knowledge base and reports.',
  staff: 'Standard member with assigned feature access.',
};

const RANK: Record<UserRole, number> = { staff: 1, manager: 2, superadmin: 3 };

/** Map any stored/legacy role string to a canonical UserRole. */
export function normalizeRole(role?: string | null): UserRole {
  switch (role) {
    case 'superadmin':
    case 'admin': // legacy
      return 'superadmin';
    case 'manager':
      return 'manager';
    case 'staff':
    case 'user': // legacy
    default:
      return 'staff';
  }
}

export function roleLabel(role?: string | null): string {
  return ROLE_LABELS[normalizeRole(role)];
}

export function roleRank(role?: string | null): number {
  return RANK[normalizeRole(role)];
}

export function isSuperAdmin(role?: string | null): boolean {
  return normalizeRole(role) === 'superadmin';
}

export function isManagerOrAbove(role?: string | null): boolean {
  return roleRank(role) >= RANK.manager;
}

// ── Capability matrix ───────────────────────────────────────────────────────
// What each role is allowed to do. Keep all gating decisions here.
export type RoleCapability =
  | 'manageUsers'      // create / edit users
  | 'manageManagers'   // create / edit Managers + Super Admins (super admin only)
  | 'manageNews'       // company news CRUD
  | 'manageTimeclock'  // time-clock "Manage" tab (adjust anyone's entries)
  | 'manageKnowledge'  // knowledge base admin
  | 'viewReports';     // usage / reports

const MATRIX: Record<RoleCapability, UserRole[]> = {
  manageUsers: ['superadmin', 'manager'],
  manageManagers: ['superadmin'],
  manageNews: ['superadmin', 'manager'],
  manageTimeclock: ['superadmin', 'manager'],
  manageKnowledge: ['superadmin', 'manager'],
  viewReports: ['superadmin', 'manager'],
};

/** Can a role perform a capability? */
export function can(role: string | null | undefined, capability: RoleCapability): boolean {
  return MATRIX[capability].includes(normalizeRole(role));
}

/**
 * Which roles a given actor is allowed to ASSIGN to others.
 * Super Admin can assign any role; a Manager can only create/manage Staff.
 */
export function assignableRoles(actorRole?: string | null): UserRole[] {
  if (isSuperAdmin(actorRole)) return ['superadmin', 'manager', 'staff'];
  if (isManagerOrAbove(actorRole)) return ['staff'];
  return [];
}

/** Can `actor` edit a user who currently has role `target`? */
export function canManageRole(actorRole?: string | null, targetRole?: string | null): boolean {
  if (isSuperAdmin(actorRole)) return true; // super admin manages everyone
  // Managers can only manage Staff (not other Managers or Super Admins)
  if (isManagerOrAbove(actorRole)) return normalizeRole(targetRole) === 'staff';
  return false;
}
