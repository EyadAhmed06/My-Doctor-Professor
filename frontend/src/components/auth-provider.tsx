"use client";

import { apiRequest } from "@/lib/api";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

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

export type GoogleOnboardingResult = {
  requires_onboarding: true;
  onboarding_token: string;
  profile: { email: string; full_name: string; picture: string | null };
};

type AuthResponse = { access_token: string; refresh_token?: string; user: AuthUser };
type LoginInput = { email: string; password: string; remember: boolean };
type CompleteGoogleSignupInput = {
  onboarding_token: string;
  phone_number: string;
  student_number: string;
  current_semester: number;
  date_of_birth?: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  login(input: LoginInput): Promise<AuthUser>;
  googleLogin(credential: string): Promise<AuthUser | GoogleOnboardingResult>;
  completeGoogleSignup(input: CompleteGoogleSignupInput): Promise<AuthUser>;
  logout(): Promise<void>;
  refreshUser(): Promise<AuthUser | null>;
  refreshAccessToken(): Promise<string | null>;
  request<T>(path: string, options?: Omit<Parameters<typeof apiRequest<T>>[1], "accessToken">): Promise<T>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const ACCESS_KEY = "mdp_access_token";
const LEGACY_REFRESH_KEY = "mdp_refresh_token";
const LOGOUT_KEY = "mdp_logged_out_at";
const LOGOUT_REFRESH_SUPPRESSION_MS = 30_000;

function clearClientAuth() {
  for (const storage of [localStorage, sessionStorage]) {
    storage.removeItem(ACCESS_KEY);
    storage.removeItem(LEGACY_REFRESH_KEY);
  }
}

function clearLegacyRefreshStorage() {
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  sessionStorage.removeItem(LEGACY_REFRESH_KEY);
}

function markLoggedOut() {
  localStorage.setItem(LOGOUT_KEY, String(Date.now()));
}

function clearLoggedOutMarker() {
  localStorage.removeItem(LOGOUT_KEY);
}

function recentlyLoggedOut() {
  const value = Number(localStorage.getItem(LOGOUT_KEY) || 0);
  return Number.isFinite(value) && value > 0 && Date.now() - value < LOGOUT_REFRESH_SUPPRESSION_MS;
}

function isGoogleOnboarding(value: AuthResponse | GoogleOnboardingResult): value is GoogleOnboardingResult {
  return "requires_onboarding" in value && value.requires_onboarding === true;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshPromise = useRef<Promise<string | null> | null>(null);

  const persistAccess = useCallback((auth: AuthResponse) => {
    localStorage.removeItem(ACCESS_KEY);
    sessionStorage.setItem(ACCESS_KEY, auth.access_token);
    clearLegacyRefreshStorage();
    clearLoggedOutMarker();
    setAccessToken(auth.access_token);
    setUser(auth.user);
  }, []);

  const refresh = useCallback(async (): Promise<string | null> => {
    if (recentlyLoggedOut()) return null;
    if (refreshPromise.current) return refreshPromise.current;
    refreshPromise.current = (async () => {
      try {
        const auth = await apiRequest<AuthResponse>("/auth/refresh", {
          method: "POST",
          body: {},
        });
        persistAccess(auth);
        return auth.access_token;
      } catch {
        clearClientAuth();
        setAccessToken(null);
        setUser(null);
        return null;
      }
    })();
    try {
      return await refreshPromise.current;
    } finally {
      refreshPromise.current = null;
    }
  }, [persistAccess]);

  const refreshUser = useCallback(async (): Promise<AuthUser | null> => {
    let token = accessToken;
    if (!token) token = await refresh();
    if (!token) {
      setUser(null);
      return null;
    }
    try {
      const profile = await apiRequest<AuthUser>("/auth/me", { accessToken: token });
      setUser(profile);
      setAccessToken(token);
      return profile;
    } catch {
      token = await refresh();
      if (!token) return null;
      const profile = await apiRequest<AuthUser>("/auth/me", { accessToken: token });
      setUser(profile);
      setAccessToken(token);
      return profile;
    }
  }, [accessToken, refresh]);

  useEffect(() => {
    void (async () => {
      clearLegacyRefreshStorage();
      if (recentlyLoggedOut()) {
        clearClientAuth();
        setAccessToken(null);
        setUser(null);
        setLoading(false);
        return;
      }
      const token = sessionStorage.getItem(ACCESS_KEY) || localStorage.getItem(ACCESS_KEY);
      let usableToken = token;
      if (!usableToken) usableToken = await refresh();
      if (usableToken) {
        try {
          const profile = await apiRequest<AuthUser>("/auth/me", { accessToken: usableToken });
          setUser(profile);
          setAccessToken(usableToken);
          if (localStorage.getItem(ACCESS_KEY)) {
            localStorage.removeItem(ACCESS_KEY);
            sessionStorage.setItem(ACCESS_KEY, usableToken);
          }
        } catch {
          usableToken = await refresh();
          if (usableToken) {
            try {
              setUser(await apiRequest<AuthUser>("/auth/me", { accessToken: usableToken }));
            } catch {
              clearClientAuth();
              setUser(null);
              setAccessToken(null);
            }
          }
        }
      }
      setLoading(false);
    })();
  }, [refresh]);

  const login = useCallback(async (input: LoginInput) => {
    const auth = await apiRequest<AuthResponse>("/auth/login", {
      method: "POST",
      body: { email: input.email, password: input.password, remember: input.remember },
    });
    persistAccess(auth);
    return auth.user;
  }, [persistAccess]);

  const googleLogin = useCallback(async (credential: string): Promise<AuthUser | GoogleOnboardingResult> => {
    const result = await apiRequest<AuthResponse | GoogleOnboardingResult>("/auth/google", {
      method: "POST",
      body: { credential, remember: true },
    });
    if (isGoogleOnboarding(result)) return result;
    persistAccess(result);
    return result.user;
  }, [persistAccess]);

  const completeGoogleSignup = useCallback(async (input: CompleteGoogleSignupInput): Promise<AuthUser> => {
    const auth = await apiRequest<AuthResponse>("/auth/google/signup", {
      method: "POST",
      body: input,
    });
    persistAccess(auth);
    return auth.user;
  }, [persistAccess]);

  const logout = useCallback(async () => {
    const token = accessToken;

    // Logout is intentionally optimistic: the UI must not wait for a slow API or a refresh attempt.
    markLoggedOut();
    clearClientAuth();
    setAccessToken(null);
    setUser(null);

    void (async () => {
      try {
        if (token) {
          await apiRequest<void>("/auth/logout", {
            method: "POST",
            accessToken: token,
            signal: AbortSignal.timeout(2500),
          });
          return;
        }
        await apiRequest<void>("/auth/logout/browser", {
          method: "POST",
          signal: AbortSignal.timeout(2500),
        });
      } catch {
        // Best-effort cookie cleanup. The client tombstone prevents silent restoration meanwhile.
        try {
          await apiRequest<void>("/auth/logout/browser", {
            method: "POST",
            signal: AbortSignal.timeout(1500),
          });
        } catch {
          // Network failure must never trap the user inside the application.
        }
      }
    })();
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

  const value = useMemo(() => ({
    user,
    accessToken,
    loading,
    login,
    googleLogin,
    completeGoogleSignup,
    logout,
    refreshUser,
    refreshAccessToken: refresh,
    request,
  }), [
    user,
    accessToken,
    loading,
    login,
    googleLogin,
    completeGoogleSignup,
    logout,
    refreshUser,
    refresh,
    request,
  ]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
