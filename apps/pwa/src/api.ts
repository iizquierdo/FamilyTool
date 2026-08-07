// Cliente HTTP de la PWA.
// - En dev: VITE_API_BASE_URL vacío → usa /api (Vite proxea al API en 4099).
// - En prod (Railway): VITE_API_BASE_URL = URL pública del API (ej: https://organihogar-api.up.railway.app).
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'organihogar.token';
const USER_KEY = 'organihogar.user';

export interface SessionUser {
  id: string;
  email: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  avatar?: string | null;
  companyId: string;
  role?: string;
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};
export const getStoredUser = (): SessionUser | null => {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? (JSON.parse(raw) as SessionUser) : null;
};
export const setStoredUser = (u: SessionUser | null) => {
  if (u) localStorage.setItem(USER_KEY, JSON.stringify(u));
  else localStorage.removeItem(USER_KEY);
};

class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) {
    super(body?.error || body?.message || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${API_BASE}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    // Sesión vencida/invalidada: si había token, se limpia y se avisa a la app.
    if (res.status === 401 && token) {
      setToken(null);
      setStoredUser(null);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('organihogar:unauthorized'));
    }
    throw new ApiError(res.status, data);
  }
  return data as T;
}

async function upload<T>(path: string, form: FormData): Promise<T> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  // Sin Content-Type: el navegador arma el multipart/form-data boundary solo.

  const res = await fetch(`${API_BASE}/api${path}`, { method: 'POST', headers, body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      setStoredUser(null);
      if (typeof window !== 'undefined') window.dispatchEvent(new Event('organihogar:unauthorized'));
    }
    throw new ApiError(res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  upload,
  ApiError
};

export { ApiError };
