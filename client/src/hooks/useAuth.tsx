import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, apiGet, apiPost } from "@/services/api";
import type { Role, User } from "@/types";
import { ROLE_PERMISSIONS, type Permission } from "@/lib/permissions";

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  password: string;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<User | null>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthEnvelope {
  user: User;
}

async function fetchMe(): Promise<User | null> {
  try {
    const res = await apiGet<AuthEnvelope>("/auth/me");
    return res.user ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshMe = useCallback(async (): Promise<User | null> => {
    const me = await fetchMe();
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await api.get("/auth/csrf");
      } catch {
        /* csrf bootstrap is best-effort */
      }
      const me = await fetchMe();
      if (!cancelled) {
        setUser(me);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<User> => {
    try {
      await api.get("/auth/csrf");
    } catch {
      /* best-effort */
    }
    const res = await apiPost<AuthEnvelope>("/auth/login", { email, password });
    const user = res.user;
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (input: RegisterInput): Promise<User> => {
    try {
      await api.get("/auth/csrf");
    } catch {
      /* best-effort */
    }
    const res = await apiPost<AuthEnvelope>("/auth/register", input);
    const user = res.user;
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiPost<void>("/auth/logout");
    } catch {
      /* ignore network failures on logout */
    } finally {
      setUser(null);
      window.dispatchEvent(new CustomEvent("auth:logout"));
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, refreshMe, setUser }),
    [user, loading, login, register, logout, refreshMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export function usePermission(): { can: (perm: Permission) => boolean; role: Role | null } {
  const { user } = useAuth();
  const role = user?.role ?? null;
  const can = useCallback(
    (perm: Permission): boolean => {
      if (!role) return false;
      return (ROLE_PERMISSIONS[role] ?? []).includes(perm);
    },
    [role],
  );
  return { can, role };
}
