import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, getStoredUser, setStoredUser, type SessionUser } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  registerTenant: (data: { familyName: string; firstName: string; lastName: string; email: string; password: string }) => Promise<void>;
  // Confirma una sesión ya obtenida (ej. tras onboarding post-invitación) sin volver a pegarle al backend.
  applySession: (token: string, user: SessionUser) => void;
  logout: () => void;
  patchUser: (partial: Partial<SessionUser>) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(getStoredUser());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get<{ user: SessionUser }>('/auth/session')
      .then((res) => {
        setUser(res.user);
        setStoredUser(res.user);
      })
      .catch(() => {
        setToken(null);
        setStoredUser(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // Si cualquier request devuelve 401 (sesión vencida), volvemos al login.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener('organihogar:unauthorized', onUnauthorized);
    return () => window.removeEventListener('organihogar:unauthorized', onUnauthorized);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: SessionUser }>('/auth/login', { email, password });
    setToken(res.token);
    setStoredUser(res.user);
    setUser(res.user);
  };

  // Alta autoservicio: crea un tenant (familia) nuevo y deja al usuario como su admin.
  const registerTenant = async (data: { familyName: string; firstName: string; lastName: string; email: string; password: string }) => {
    const res = await api.post<{ token: string; user: SessionUser }>('/auth/register-tenant', data);
    setToken(res.token);
    setStoredUser(res.user);
    setUser(res.user);
  };

  const applySession = (token: string, sessionUser: SessionUser) => {
    setToken(token);
    setStoredUser(sessionUser);
    setUser(sessionUser);
  };

  const logout = () => {
    api.post('/auth/logout').catch(() => {});
    setToken(null);
    setStoredUser(null);
    setUser(null);
  };

  const patchUser = (partial: Partial<SessionUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      setStoredUser(next);
      return next;
    });
  };

  return <AuthContext.Provider value={{ user, loading, login, registerTenant, applySession, logout, patchUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
