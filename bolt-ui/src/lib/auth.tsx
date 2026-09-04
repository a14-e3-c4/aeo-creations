/**
 * Auth context and helpers for aeo.creations.
 * Token-based auth — credentials never stored in localStorage as plaintext.
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  plan: string;
  credits_remaining: number;
  credits_used_this_month: number;
  billing_cycle_start: string;
  created_at: string;
  last_login: string;
  is_admin: boolean;
  is_active: boolean;
  mock_checkout_completed: boolean;
}

export interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  price_yearly: number;
  credits_per_month: number;
  max_scenes_per_video: number;
  max_duration_seconds: number;
  voiceover_enabled: boolean;
  caption_styles: string[];
  export_quality: string;
  watermark: boolean;
  priority_queue: boolean;
  api_access: boolean;
  custom_branding: boolean;
  features: string[];
  limits: {
    images_per_month: number;
    videos_per_month: number;
    voiceover_minutes_per_month: number;
    storage_mb: number;
    projects: number;
  };
}

export interface UsageSummary {
  plan: Plan | null;
  credits_remaining: number;
  credits_used: number;
  credits_total: number;
  billing_cycle_start: string;
  events_this_month: number;
  by_action: Record<string, number>;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

// ── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try { return sessionStorage.getItem('aeo_token'); } catch { return null; }
  });
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    authFetch('/api/auth/me', token)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setUser(d.user); })
      .catch(() => { setToken(null); sessionStorage.removeItem('aeo_token'); })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line

  const saveToken = (t: string) => {
    setToken(t);
    sessionStorage.setItem('aeo_token', t);
  };

  const login = useCallback(async (email: string, password: string) => {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Login failed');
    saveToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    const resp = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, display_name: displayName || '' }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.detail || 'Registration failed');
    saveToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    sessionStorage.removeItem('aeo_token');
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) return;
    const resp = await authFetch('/api/auth/me', token);
    if (resp.ok) {
      const data = await resp.json();
      setUser(data.user);
    }
  }, [token]);

  const authFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const headers = new Headers(opts?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...opts, headers });
  }, [token]);

  const ctxValue = useMemo(() => ({
    user, token, loading, login, register, logout, refreshUser, authFetch,
  }), [user, token, loading]);

  return (
    <AuthContext.Provider value={ctxValue}>
      {children}
    </AuthContext.Provider>
  );
}

