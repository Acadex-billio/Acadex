export const normalizeRole = (role) => String(role || '').trim().toLowerCase();

export const isAdminUser = (user) => {
  const role = normalizeRole(user?.role);
  return user?.is_admin === true || role === 'admin' || role === 'developer';
};

export const isDeveloperUser = (user) => normalizeRole(user?.role) === 'developer';

export const isLecturerUser = (user) => normalizeRole(user?.role) === 'lecturer';