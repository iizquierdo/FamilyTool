import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, getToken, setToken, getStoredUser, setStoredUser, type SessionUser } from './api';

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
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
    window.addEventListener('familytool:unauthorized', onUnauthorized);
    return () => window.removeEventListener('familytool:unauthorized', onUnauthorized);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: SessionUser }>('/auth/login', { email, password });
    setToken(res.token);
    setStoredUser(res.user);
    setUser(res.user);
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

  return <AuthContext.Provider value={{ user, loading, login, logout, patchUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
