"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { PageSkeleton } from "./async-state";
import { useAuth, type UserRole } from "./auth-provider";

function homeForRole(role: UserRole): string {
  if (role === "SYSTEM_ADMIN") return "/admin";
  if (role === "INSTRUCTOR") return "/instructor";
  return "/dashboard";
}

export function ProtectedRoute({
  children,
  roles,
  label = "Loading your workspace",
}: {
  children: React.ReactNode;
  roles?: UserRole[];
  label?: string;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const roleAllowed = Boolean(user && (!roles?.length || roles.includes(user.role)));

  useEffect(() => {
    if (loading) return;

    if (!user) {
      const next = typeof window === "undefined"
        ? pathname
        : `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    if (roles?.length && !roles.includes(user.role)) {
      router.replace(homeForRole(user.role));
    }
  }, [loading, pathname, roles, router, user]);

  if (loading || !roleAllowed) {
    return <main className="product-auth-loading"><PageSkeleton variant="workspace" label={label} /></main>;
  }

  return <>{children}</>;
}
