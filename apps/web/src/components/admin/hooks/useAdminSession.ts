import { useCallback, useEffect, useState } from 'react';
import { adminFetch, clearAdminToken, getAdminToken, setAdminToken } from '../api';

interface AdminSession {
  ready: boolean;
  isAuthenticated: boolean;
  email?: string;
}

export const useAdminSession = () => {
  const [state, setState] = useState<AdminSession>({ ready: false, isAuthenticated: false });

  const logout = useCallback(() => {
    clearAdminToken();
    setState({ ready: true, isAuthenticated: false });
  }, []);

  const completeLogin = useCallback(async (token: string): Promise<boolean> => {
    const trimmed = String(token || '').trim();
    if (!trimmed) {
      setState({ ready: true, isAuthenticated: false });
      return false;
    }
    setAdminToken(trimmed);
    try {
      const res = await adminFetch('/api/admin/session');
      if (!res.ok) {
        clearAdminToken();
        setState({ ready: true, isAuthenticated: false });
        return false;
      }
      const data = await res.json();
      setState({ ready: true, isAuthenticated: true, email: data?.email || '' });
      return true;
    } catch {
      clearAdminToken();
      setState({ ready: true, isAuthenticated: false });
      return false;
    }
  }, []);

  useEffect(() => {
    const restore = async () => {
      const token = getAdminToken();
      if (!token) {
        setState({ ready: true, isAuthenticated: false });
        return;
      }
      try {
        const res = await adminFetch('/api/admin/session');
        if (!res.ok) {
          clearAdminToken();
          setState({ ready: true, isAuthenticated: false });
          return;
        }
        const data = await res.json();
        setState({ ready: true, isAuthenticated: true, email: data?.email || '' });
      } catch {
        clearAdminToken();
        setState({ ready: true, isAuthenticated: false });
      }
    };

    void restore();
  }, []);

  return { ...state, logout, completeLogin };
};
