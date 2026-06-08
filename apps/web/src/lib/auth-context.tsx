'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { authApi } from './api';

interface AuthState {
  /** Short-lived access token, held in memory only. */
  accessToken: string | null;
  /** True once the initial silent-refresh attempt has completed. */
  ready: boolean;
  setAccessToken: (token: string | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // On load, try to mint an access token from the httpOnly refresh cookie (silent login).
  useEffect(() => {
    let active = true;
    void authApi
      .refresh()
      .then((r) => {
        if (active) setAccessToken(r.accessToken);
      })
      .catch(() => {
        /* not signed in — leave the token null */
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const logout = useCallback(async () => {
    if (accessToken) {
      try {
        await authApi.logoutAll(accessToken);
      } catch {
        /* best-effort; clear locally regardless */
      }
    }
    setAccessToken(null);
  }, [accessToken]);

  return (
    <AuthContext.Provider value={{ accessToken, ready, setAccessToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
