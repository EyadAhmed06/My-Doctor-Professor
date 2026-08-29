"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FiAward,
  FiBell,
  FiCheck,
  FiChevronDown,
  FiHelpCircle,
  FiLogOut,
  FiMenu,
  FiSearch,
  FiSettings,
  FiX,
} from "react-icons/fi";
import { apiAssetUrl } from "@/lib/api";
import { ThemeToggle } from "./app-theme";
import { BrandLockup } from "./brand";
import { useAuth, type UserRole } from "./auth-provider";
import { CommandPalette } from "./command-palette";
import { PageSkeleton } from "./async-state";
import { useLocale } from "./locale-provider";
import {
  AchievementDrawer,
  MobileRoleDock,
  PhaseFiveMilestones,
  RoleWorkflowCoach,
  WorkspaceBreadcrumbs,
  WorkspaceHelpDrawer,
} from "./phase-five-ux";
import { StudentProgressControl } from "./student-progress-control";
import { useUx } from "./ux-provider";
import { useWorkspaceContinuity } from "./workspace-continuity";

type NavItem = { label: string; href: string };
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
  { label: "Questions", href: "/assessments" },
  { label: "Mock Exams", href: "/past-exams" },
  { label: "Flashcards", href: "/flashcards" },
  { label: "Essay Cases", href: "/essay-practice" },
  { label: "Notebook", href: "/notebook" },
  { label: "Study Guides", href: "/guidelines" },
  { label: "Analytics", href: "/analytics" },
  { label: "Study Plan", href: "/study-plan" },
];

const instructorNav: NavItem[] = [
  { label: "Overview", href: "/instructor" },
  { label: "Courses", href: "/instructor/courses" },
  { label: "Resources", href: "/resources/upload" },
  { label: "Questions", href: "/instructor/questions" },
  { label: "Essay Cases", href: "/instructor/essay-cases" },
  { label: "Assessments", href: "/instructor/assessments" },
  { label: "Flashcards", href: "/instructor/flashcards" },
  { label: "Bundles", href: "/bundles" },
];

const adminNav: NavItem[] = [
  { label: "Overview", href: "/admin" },
  { label: "Users", href: "/admin/users" },
  { label: "Academics", href: "/admin/academics" },
  { label: "Resources", href: "/resources/upload" },
  { label: "Questions", href: "/admin/questions" },
  { label: "Assessments", href: "/admin/assessments" },
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

function isNavActive(path: string, href: string) {
  if (href === "/admin" || href === "/instructor" || href === "/dashboard") return path === href;
  return path === href || path.startsWith(`${href}/`);
}

function workspaceLabel(path: string, items: NavItem[]) {
  const match = [...items].sort((left, right) => right.href.length - left.href.length).find(item => isNavActive(path, item.href));
  if (match) return match.label;
  if (path.startsWith("/notifications")) return "Notifications";
  if (path.startsWith("/settings")) return "Settings";
  if (path.startsWith("/shortcuts")) return "Keyboard shortcuts";
  if (path.startsWith("/dashboard")) return "Dashboard";
  return "Workspace";
}

function isEditableTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
}

export function ProductShell({ children, search = "Search cases, topics, or concepts" }: { children: React.ReactNode; search?: string }) {
  const path = usePathname();
  const router = useRouter();
  const { translate, locale } = useLocale();
  const { startNavigation, notify, confirm, achievements } = useUx();
  const { user, loading, logout, request } = useAuth();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
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

  useWorkspaceContinuity(path, translate(workspaceLabel(path, nav)));

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
      notify({ title: translate("Could not load notifications"), description: cause instanceof Error ? cause.message : undefined, tone: "error" });
    } finally {
      setPreviewLoading(false);
    }
  }, [notify, request, translate, user]);

  useEffect(() => {
    if (!loading && !user) router.replace(`/login?next=${encodeURIComponent(path)}`);
  }, [loading, path, router, user]);

  useEffect(() => {
    void loadUnread();
    const interval=window.setInterval(() => void loadUnread(),60_000);
    const refreshWhenVisible=() => { if(document.visibilityState==='visible') void loadUnread(); };
    document.addEventListener('visibilitychange',refreshWhenVisible);
    window.addEventListener('focus',loadUnread);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange',refreshWhenVisible);
      window.removeEventListener('focus',loadUnread);
    };
  }, [loadUnread]);

  useEffect(() => {
    const refresh = () => {
      void loadUnread();
      if (notificationsOpen) void loadPreview();
    };
    window.addEventListener("mdp:notifications-changed", refresh);
    return () => window.removeEventListener("mdp:notifications-changed", refresh);
  }, [loadPreview, loadUnread, notificationsOpen]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key !== "?" || event.metaKey || event.ctrlKey || event.altKey || isEditableTarget(event.target)) return;
      event.preventDefault();
      setHelpOpen(value => !value);
      setAchievementsOpen(false);
      setProgressOpen(false);
      setProfileOpen(false);
      setNotificationsOpen(false);
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
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
      notify({ title: translate("Could not mark notifications as read"), description: cause instanceof Error ? cause.message : undefined, tone: "error" });
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

  async function confirmLogout() {
    const accepted = await confirm({
      title: "Log out?",
      description: "Your current session on this device will end. Unsaved form changes may be lost.",
      confirmLabel: "Log out",
      cancelLabel: "Cancel",
      tone: "danger",
    });
    if (!accepted) return;
    setProfileOpen(false);
    setProgressOpen(false);
    startNavigation();
    void logout();
    window.location.replace("/login");
  }

  if (loading || !user) {
    return <main className="product-auth-loading"><PageSkeleton variant="workspace" label={translate("Loading your workspace")} /></main>;
  }

  const displayName = user.fullName || user.full_name || user.email;
  const roleLabel = translate(user.role === "SYSTEM_ADMIN" ? "System Administrator" : user.role === "INSTRUCTOR" ? "Instructor" : "Medical Student");
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
  const profileImage = apiAssetUrl(user.profilePictureUrl);
  const unreadPreview = preview.filter(item => item.status === "UNREAD").length;

  function navigate(href: string) {
    setProfileOpen(false);
    setProgressOpen(false);
    setNotificationsOpen(false);
    startNavigation();
    router.push(href);
  }

  const avatar = <span className="avatar-fallback">{profileImage ? <img src={profileImage} alt="" /> : initials}</span>;

  return <div className="product-app">
    <header className="pp-topbar">
      <BrandLockup className="pp-brand" href={homeFor(user.role)} />
      <button className="pp-menu" onClick={() => setOpen(true)} aria-label={translate("Open menu")} aria-expanded={open} aria-controls="product-navigation"><FiMenu /></button>
      {open && <button className="pp-mobile-overlay" type="button" aria-label={translate("Close navigation")} onClick={() => setOpen(false)} />}
      <nav id="product-navigation" className={open ? "open" : ""} aria-label={translate("Primary navigation")}>
        <button className="pp-nav-close" type="button" onClick={() => setOpen(false)} aria-label={translate("Close menu")}><FiX /></button>
        {nav.map(item => <Link key={item.href} className={isNavActive(path, item.href) ? "active" : ""} href={item.href} onClick={() => { setOpen(false); startNavigation(); }}>{translate(item.label)}</Link>)}
        <Link href="/settings" className={path.startsWith("/settings") ? "active" : ""} onClick={() => { setOpen(false); startNavigation(); }}>{translate("Settings")}</Link>
      </nav>
      <button className="pp-search-command" type="button" onClick={openPalette} aria-label={`${translate("Open command palette")}. ${translate(search)}`}><FiSearch /><span>{translate(search)}</span><kbd>⌘ K</kbd></button>
      <div className="pp-profile">
        <ThemeToggle compact iconOnly />
        <button className="phase5-header-action" type="button" aria-label={translate("Open contextual help")} aria-expanded={helpOpen} onClick={() => { setHelpOpen(true); setAchievementsOpen(false); setProgressOpen(false); setProfileOpen(false); setNotificationsOpen(false); }}><FiHelpCircle /></button>
        <button className="phase5-header-action" type="button" aria-label={locale === "ar" ? `${achievements.length} إنجازات مفتوحة` : `${achievements.length} unlocked achievements`} aria-expanded={achievementsOpen} onClick={() => { setAchievementsOpen(true); setHelpOpen(false); setProgressOpen(false); setProfileOpen(false); setNotificationsOpen(false); }}><FiAward />{achievements.length > 0 && <i>{achievements.length > 99 ? "99+" : achievements.length}</i>}</button>
        <div className="header-popover-anchor" ref={notificationsRef}>
          <button className="phase5-header-action" ref={notificationsButtonRef} aria-label={locale === "ar" ? `${unread} إشعارات غير مقروءة` : `${unread} unread notifications`} aria-expanded={notificationsOpen} aria-haspopup="dialog" onClick={() => { const next = !notificationsOpen; setNotificationsOpen(next); setProfileOpen(false); setHelpOpen(false); setAchievementsOpen(false); setProgressOpen(false); if (next) void loadPreview(); }}><FiBell />{unread > 0 && <i>{unread > 99 ? "99+" : unread}</i>}</button>
          {notificationsOpen && <section className="header-popover notification-preview" role="dialog" aria-label={translate("Notification preview")}><header><div><b>{translate("Notifications")}</b><small>{locale === "ar" ? `${unreadPreview} غير مقروء في المعاينة` : `${unreadPreview} unread in preview`}</small></div><button type="button" disabled={!unread} onClick={() => void markAllPreviewRead()}><FiCheck /> {translate("Mark all read")}</button></header>{previewLoading ? <PageSkeleton variant="list" label={translate("Loading notification preview")} /> : preview.length ? <div className="notification-preview-list">{preview.map(item => <button type="button" className={item.status === "UNREAD" ? "unread" : ""} key={item.id} onClick={() => void openNotification(item)}><span /><div><b>{item.title}</b><p>{item.message}</p><small>{new Date(item.created_at).toLocaleString(locale === "ar" ? "ar-EG" : undefined)}</small></div></button>)}</div> : <p className="header-popover-empty">{translate("No notifications yet.")}</p>}<footer><button type="button" onClick={() => navigate("/notifications")}>{translate("View all notifications")}</button></footer></section>}
        </div>
        <StudentProgressControl open={progressOpen} onOpenChange={(next) => {
          setProgressOpen(next);
          if (next) {
            setHelpOpen(false);
            setAchievementsOpen(false);
            setProfileOpen(false);
            setNotificationsOpen(false);
          }
        }} />
        <div className="header-popover-anchor profile-menu-anchor" ref={profileRef}>
          <button ref={profileButtonRef} className="profile-menu-trigger" type="button" aria-expanded={profileOpen} aria-haspopup="menu" onClick={() => { setProfileOpen(value => !value); setNotificationsOpen(false); setHelpOpen(false); setAchievementsOpen(false); setProgressOpen(false); }}>{avatar}<span><b>{displayName}</b><small>{roleLabel}</small></span><FiChevronDown /></button>
          {profileOpen && <div className="header-popover profile-menu" role="menu"><div className="profile-menu-summary">{avatar}<div><b>{displayName}</b><small>{user.email}</small></div></div><button type="button" role="menuitem" onClick={() => navigate("/settings")}><FiSettings /> {translate("Settings")}</button><div className="profile-theme-row"><span>{translate("Theme")}</span><ThemeToggle compact /></div><button className="danger" data-phase5-confirmed="true" type="button" role="menuitem" onClick={() => void confirmLogout()}><FiLogOut /> {translate("Log out")}</button></div>}
        </div>
      </div>
    </header>
    <WorkspaceBreadcrumbs path={path} role={user.role} />
    {user.role !== "INSTRUCTOR" && <RoleWorkflowCoach path={path} role={user.role} />}
    <div id="workspace-main" className="phase5-workspace-main" tabIndex={-1}>{children}</div>
    <PhaseFiveMilestones path={path} role={user.role} />
    <MobileRoleDock path={path} role={user.role} />
    <WorkspaceHelpDrawer path={path} role={user.role} open={helpOpen} onClose={() => setHelpOpen(false)} />
    <AchievementDrawer open={achievementsOpen} onClose={() => setAchievementsOpen(false)} />
    <CommandPalette open={paletteOpen} onOpen={openPalette} onClose={closePalette} role={user.role} />
  </div>;
}

export function Panel({ title, action, children, className = "", id }: { title?: string; action?: React.ReactNode; children: React.ReactNode; className?: string; id?: string }) {
  return <section id={id} className={`pp-panel ${className}`}>{(title || action) && <header><h2>{title}</h2>{action}</header>}{children}</section>;
}

export function Progress({ value, tone = "teal" }: { value: number; tone?: "teal" | "violet" | "orange" }) {
  return <div className={`pp-progress ${tone}`}><i style={{ width: `${value}%` }} /></div>;
}
