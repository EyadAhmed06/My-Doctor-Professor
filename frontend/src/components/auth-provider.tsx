"use client";

import { apiRequest } from "@/lib/api";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type UserRole = "STUDENT" | "INSTRUCTOR" | "SYSTEM_ADMIN";
export type AuthUser = {
  id: string;
  email: string;
  full_name?: string;
  fullName?: string;
  role: UserRole;
  status: string;
  emailVerified?: boolean;
  profilePictureUrl?: string | null;
};

type AuthResponse = { access_token: string; refresh_token: string; user: AuthUser };
type LoginInput = { email: string; password: string; remember: boolean };

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  login(input: LoginInput): Promise<AuthUser>;
  logout(): Promise<void>;
  request<T>(path: string, options?: Omit<Parameters<typeof apiRequest<T>>[1], "accessToken">): Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ACCESS_KEY = "mdp_access_token";
const REFRESH_KEY = "mdp_refresh_token";

function storageForRemember(remember: boolean) {
  return remember ? localStorage : sessionStorage;
}

function clearTokens() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(ACCESS_KEY);
    storage.removeItem(REFRESH_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback((auth: AuthResponse, remember: boolean) => {
    clearTokens();
    const storage = storageForRemember(remember);
    storage.setItem(ACCESS_KEY, auth.access_token);
    storage.setItem(REFRESH_KEY, auth.refresh_token);
    setAccessToken(auth.access_token);
    setUser(auth.user);
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    const localRefresh = localStorage.getItem(REFRESH_KEY);
    const sessionRefresh = sessionStorage.getItem(REFRESH_KEY);
    const refreshToken = localRefresh || sessionRefresh;
    if (!refreshToken) return null;
    try {
      const auth = await apiRequest<AuthResponse>("/auth/refresh", {
        method: "POST",
        body: { refresh_token: refreshToken },
      });
      persist(auth, Boolean(localRefresh));
      return auth.access_token;
    } catch {
      clearTokens();
      setAccessToken(null);
      setUser(null);
      return null;
    }
  }, [persist]);

  useEffect(() => {
    void (async () => {
      const token = localStorage.getItem(ACCESS_KEY) || sessionStorage.getItem(ACCESS_KEY);
      let usableToken = token;
      if (!usableToken) usableToken = await refresh();
      if (usableToken) {
        try {
          const profile = await apiRequest<AuthUser>("/auth/me", { accessToken: usableToken });
          setUser(profile);
          setAccessToken(usableToken);
        } catch {
          usableToken = await refresh();
          if (usableToken) {
            try {
              setUser(await apiRequest<AuthUser>("/auth/me", { accessToken: usableToken }));
            } catch { clearTokens(); setUser(null); setAccessToken(null); }
          }
        }
      }
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const auth = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email: input.email, password: input.password },
    });
    persist(auth, input.remember);
    return auth.user;
  }, [persist]);

  const logout = useCallback(async () => {
    try {
      if (accessToken) await apiRequest<void>("/auth/logout", { method: "POST", accessToken });
    } finally {
      clearTokens();
      setAccessToken(null);
      setUser(null);
    }
  }, [accessToken]);

  const request = useCallback(async <T,>(path: string, options: Omit<Parameters<typeof apiRequest<T>>[1], "accessToken"> = {}) => {
    let token = accessToken;
    try {
      return await apiRequest<T>(path, { ...options, accessToken: token });
    } catch (error) {
      if (!(error instanceof Error) || !("status" in error) || error.status !== 401) throw error;
      token = await refresh();
      if (!token) throw error;
      return apiRequest<T>(path, { ...options, accessToken: token });
    }
  }, [accessToken, refresh]);

  const value = useMemo(() => ({ user, accessToken, loading, login, logout, request }), [user, accessToken, loading, login, logout, request]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

