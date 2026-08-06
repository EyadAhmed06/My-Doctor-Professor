"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiBell,
  FiCheck,
  FiChevronDown,
  FiLogOut,
  FiMenu,
  FiSearch,
  FiSettings,
  FiUser,
  FiX,
} from "react-icons/fi";
import { ThemeToggle } from "./app-theme";
import { BrandLockup } from "./brand";
import { useAuth, type UserRole } from "./auth-provider";
import { CommandPalette } from "./command-palette";
import { PageSkeleton } from "./async-state";
import { useUx } from "./ux-provider";
import { useWorkspaceContinuity } from "./workspace-continuity";

type NavItem = { label: string; href: string; exact?: boolean };
type NotificationPreview = {
  id: string;
  title: string;
  message: string;
  target_url: string | null;
  notification_type: string;
  status: "READ" | "UNREAD";
  created_at: string;
};
type Page<T> = { data: T[] };

const studentNav: NavItem[] = [
  { label: "My Bundles", href: "/bundles" },
  { label: "Flashcards", href: "/flashcards" },
  { label: "Notebook", href: "/notebook" },
  { label: "Study Guides", href: "/guidelines" },
  { label: "Analytics", href: "/analytics" },
  { label: "Study Plan", href: "/study-plan" },
];

const instructorNav: NavItem[] = [
  { label: "Overview", href: "/instructor", exact: true },
  { label: "Courses", href: "/instructor/courses" },
  { label: "Questions", href: "/instructor/questions" },
  { label: "Assessments", href: "/instructor/assessments" },
  { label: "Grading", href: "/instructor/grading" },
  { label: "Flashcards", href: "/instructor/flashcards" },
  { label: "Bundles", href: "/bundles" },
];

const adminNav: NavItem[] = [
  { label: "Overview", href: "/admin", exact: true },
  { label: "Users", href: "/admin/users" },
  { label: "Academics", href: "/admin/academics" },
  { label: "Questions", href: "/admin/questions" },
  { label: "Assessments", href: "/admin/assessments" },
  { label: "Grading", href: "/admin/grading" },
  { label: "Flashcards", href: "/admin/flashcards" },
  { label: "Bundles", href: "/bundles" },
  { label: "Audit", href: "/admin/audit" },
];

function navigationFor(role: UserRole): NavItem[] {
  if (role === "SYSTEM_ADMIN") return adminNav;
  if (role === "INSTRUCTOR") return instructorNav;
  return studentNav;
}

function homeFor(role: UserRole): string {
  if (role === "SYSTEM_ADMIN") return "/admin";
  if (role === "INSTRUCTOR") return "/instructor";
  return "/dashboard";
}

function isActivePath(path: string, item: NavItem): boolean {
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

function workspaceLabel(path: string, items: NavItem[]) {
  const match = [...items]
    .sort((left, right) => right.href.length - left.href.length)
    .find(item => isActivePath(path, item));
  if (match) return match.label;
  if (path.startsWith("/notifications")) return "Notifications";
  if (path.startsWith("/settings")) return "Settings";
  if (path.startsWith("/dashboard")) return "Dashboard";
  return "Workspace";
}

export function ProductShell({ children, search = "Search cases, topics, or concepts" }: { children: React.ReactNode; search?: string }) {
  const path = usePathname();
  const router = useRouter();
  const { startNavigation, notify } = useUx();
  const { user, loading, logout, request } = useAuth();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<NotificationPreview[]>([]);
  const [unread, setUnread] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const notificationsButtonRef = useRef<HTMLButtonElement>(null);
  const nav = useMemo(() => navigationFor(user?.role || "STUDENT"), [user?.role]);
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  useWorkspaceContinuity(path, workspaceLabel(path, nav));

  const loadUnread = useCallback(async () => {
    if (!user) return;
    try {
      setUnread((await request<{ count: number }>("/notifications/unread/count")).count);
    } catch {
      setUnread(0);
    }
  }, [request, user]);

  const loadPreview = useCallback(async () => {
    if (!user) return;
    setPreviewLoading(true);
    try {
      setPreview((await request<Page<NotificationPreview>>("/notifications?limit=5")).data);
    } catch (cause) {
      notify({
        title: "Could not load notifications",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setPreviewLoading(false);
    }
  }, [notify, request, user]);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, path, router, user]);

  useEffect(() => { void loadUnread(); }, [loadUnread]);

  useEffect(() => {
    const refresh = () => {
      void loadUnread();
      if (notificationsOpen) void loadPreview();
    };
    window.addEventListener("mdp:notifications-changed", refresh);
    return () => window.removeEventListener("mdp:notifications-changed", refresh);
  }, [loadPreview, loadUnread, notificationsOpen]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [open]);

  useEffect(() => {
    if (!profileOpen && !notificationsOpen) return;
    function outside(event: PointerEvent) {
      const target = event.target as Node;
      if (profileOpen && !profileRef.current?.contains(target)) setProfileOpen(false);
      if (notificationsOpen && !notificationsRef.current?.contains(target)) setNotificationsOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (profileOpen) {
        setProfileOpen(false);
        profileButtonRef.current?.focus();
      }
      if (notificationsOpen) {
        setNotificationsOpen(false);
        notificationsButtonRef.current?.focus();
      }
    }
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", escape);
    };
  }, [notificationsOpen, profileOpen]);

  async function markPreviewRead(item: NotificationPreview) {
    if (item.status === "READ") return;
    setPreview(current => current.map(value => value.id === item.id ? { ...value, status: "READ" } : value));
    setUnread(value => Math.max(0, value - 1));
    try {
      await request(`/notifications/${item.id}`, { method: "PUT" });
      window.dispatchEvent(new Event("mdp:notifications-changed"));
    } catch {
      setPreview(current => current.map(value => value.id === item.id ? { ...value, status: "UNREAD" } : value));
      setUnread(value => value + 1);
    }
  }

  async function markAllPreviewRead() {
    const previous = preview;
    setPreview(current => current.map(item => ({ ...item, status: "READ" })));
    setUnread(0);
    try {
      await request("/notifications/mark-read", { method: "PUT" });
      window.dispatchEvent(new Event("mdp:notifications-changed"));
    } catch (cause) {
      setPreview(previous);
      void loadUnread();
      notify({
        title: "Could not mark notifications as read",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    }
  }

  async function openNotification(item: NotificationPreview) {
    await markPreviewRead(item);
    setNotificationsOpen(false);
    if (item.target_url) {
      startNavigation();
      router.push(item.target_url);
    }
  }

  if (loading || !user) {
    return <main className="product-auth-loading"><PageSkeleton variant="workspace" label="Loading your workspace" /></main>;
  }

  const displayName = user.fullName || user.full_name || user.email;
  const roleLabel = user.role === "SYSTEM_ADMIN" ? "System Administrator" : user.role === "INSTRUCTOR" ? "Instructor" : "Medical Student";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const unreadPreview = preview.filter(item => item.status === "UNREAD").length;

  function navigate(href: string) {
    setProfileOpen(false);
    setNotificationsOpen(false);
    startNavigation();
    router.push(href);
  }

  return <div className="product-app">
    <header className="pp-topbar">
      <BrandLockup className="pp-brand" href={homeFor(user.role)} />
      <button className="pp-menu" onClick={() => setOpen(true)} aria-label="Open menu" aria-expanded={open} aria-controls="product-navigation"><FiMenu /></button>
      {open && <button className="pp-mobile-overlay" type="button" aria-label="Close navigation" onClick={() => setOpen(false)} />}
      <nav id="product-navigation" className={open ? "open" : ""} aria-label="Primary navigation">
        <button className="pp-nav-close" type="button" onClick={() => setOpen(false)} aria-label="Close menu"><FiX /></button>
        {nav.map(item => <Link key={item.href} className={isActivePath(path, item) ? "active" : ""} href={item.href} onClick={() => { setOpen(false); startNavigation(); }}>{item.label}</Link>)}
        <Link href="/settings" className={path.startsWith("/settings") ? "active" : ""} onClick={() => { setOpen(false); startNavigation(); }}>Settings</Link>
      </nav>
      <button className="pp-search-command" type="button" onClick={openPalette} aria-label={`Open command palette. ${search}`}><FiSearch /><span>{search}</span><kbd>⌘ K</kbd></button>
      <div className="pp-profile">
        <div className="header-popover-anchor" ref={notificationsRef}>
          <button ref={notificationsButtonRef} aria-label={`${unread} unread notifications`} aria-expanded={notificationsOpen} aria-haspopup="dialog" onClick={() => {
            const next = !notificationsOpen;
            setNotificationsOpen(next);
            setProfileOpen(false);
            if (next) void loadPreview();
          }}><FiBell />{unread > 0 && <i>{unread > 99 ? "99+" : unread}</i>}</button>
          {notificationsOpen && <section className="header-popover notification-preview" role="dialog" aria-label="Notification preview">
            <header><div><b>Notifications</b><small>{unreadPreview} unread in preview</small></div><button type="button" disabled={!unread} onClick={() => void markAllPreviewRead()}><FiCheck /> Mark all read</button></header>
            {previewLoading ? <PageSkeleton variant="list" label="Loading notification preview" /> : preview.length ? <div className="notification-preview-list">{preview.map(item => <button type="button" className={item.status === "UNREAD" ? "unread" : ""} key={item.id} onClick={() => void openNotification(item)}><span /><div><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString()}</small></div></button>)}</div> : <p className="header-popover-empty">No notifications yet.</p>}
            <footer><button type="button" onClick={() => navigate("/notifications")}>View all notifications</button></footer>
          </section>}
        </div>
        <div className="header-popover-anchor profile-menu-anchor" ref={profileRef}>
          <button ref={profileButtonRef} className="profile-menu-trigger" type="button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => {
            setProfileOpen(value => !value);
            setNotificationsOpen(false);
          }}><span className="avatar-fallback">{initials}</span><span><b>{displayName}</b><small>{roleLabel}</small></span><FiChevronDown /></button>
          {profileOpen && <div className="header-popover profile-menu" role="menu">
            <div className="profile-menu-summary"><span className="avatar-fallback">{initials}</span><div><b>{displayName}</b><small>{user.email}</small></div></div>
            <button type="button" role="menuitem" onClick={() => navigate("/settings#profile")}><FiUser /> Profile</button>
            <button type="button" role="menuitem" onClick={() => navigate("/settings")}><FiSettings /> Settings</button>
            <div className="profile-theme-row"><span>Theme</span><ThemeToggle compact /></div>
            <button className="danger" type="button" role="menuitem" onClick={() => void logout().then(() => {
              setProfileOpen(false);
              startNavigation();
              router.replace("/login");
            })}><FiLogOut /> Log out</button>
          </div>}
        </div>
      </div>
    </header>
    {children}
    <CommandPalette open={paletteOpen} onOpen={openPalette} onClose={closePalette} role={user.role} />
  </div>;
}

export function Panel({ title, action, children, className = "", id }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`pp-panel ${className}`}>{(title || action) && <header><h2>{title}</h2>{action}</header>}{children}</section>;
}

export function Progress({ value, tone = "teal" }: { value: number; tone?: "teal" | "violet" | "orange" }) {
  return <div className={`pp-progress ${tone}`}><i style={{ width: `${value}%` }} /></div>;
}
