export const ROLE_DISPLAY_NAMES: Record<string, string> = {
  super_admin: 'Super Admin',
  owner: 'Owner',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
  developer: 'Developers',
  approver: 'Approver',
  user: 'Regular user',
};

export function getRoleDisplayName(role: string): string {
  return ROLE_DISPLAY_NAMES[role] || role;
}
