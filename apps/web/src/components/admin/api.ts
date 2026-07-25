export const ADMIN_STORAGE_KEY = 'sinapsis.admin.session';

export const getAdminToken = () => {
  try {
    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return String(parsed?.token || '');
  } catch {
    return '';
  }
};

export const setAdminToken = (token: string) => {
  localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify({ token }));
};

export const clearAdminToken = () => {
  localStorage.removeItem(ADMIN_STORAGE_KEY);
};

export const adminFetch = (path: string, init?: RequestInit) => {
  const token = getAdminToken();
  const headers = new Headers(init?.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!headers.has('Content-Type') && init?.body && !(init.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(path, { ...(init || {}), headers });
};
