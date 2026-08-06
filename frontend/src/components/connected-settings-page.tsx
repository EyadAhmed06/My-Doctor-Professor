"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { FiCheck, FiEye, FiEyeOff, FiImage, FiLock, FiSave, FiUser } from "react-icons/fi";
import { ThemePreference, useAppTheme } from "./app-theme";
import { AuthUser, useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

type Profile = AuthUser & {
  phoneNumber?: string;
  dateOfBirth?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  createdAt?: string;
  updatedAt?: string;
};

type ProfileDraft = {
  name: string;
  phone: string;
  dateOfBirth: string;
  gender: "" | "MALE" | "FEMALE";
  profilePictureUrl: string;
};

type FieldErrors = Partial<Record<keyof ProfileDraft | "currentPassword" | "newPassword", string>>;

function normalizedPhone(value: string) {
  const trimmed = value.trim();
  const prefix = trimmed.startsWith("+") ? "+" : trimmed.startsWith("00") ? "+" : "";
  const digits = trimmed.replace(/\D/g, "");
  return `${prefix}${trimmed.startsWith("00") ? digits.slice(2) : digits}`;
}

function passwordChecks(value: string) {
  return {
    length: value.length >= 12,
    lower: /[a-z]/.test(value),
    upper: /[A-Z]/.test(value),
    number: /[0-9]/.test(value),
  };
}

export function ConnectedSettingsPage() {
  const { user, request, refreshUser } = useAuth();
  const { theme, preference, setTheme } = useAppTheme();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({ name: "", phone: "", dateOfBirth: "", gender: "", profilePictureUrl: "" });
  const [baseline, setBaseline] = useState<ProfileDraft | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("mdp-reduced-motion");
    const system = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const enabled = saved === null ? system : saved === "true";
    setReducedMotion(enabled);
    document.documentElement.dataset.reducedMotion = String(enabled);
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void request<Profile>(`/users/${user.id}`)
      .then((value) => {
        if (!active) return;
        const next: ProfileDraft = {
          name: value.fullName || value.full_name || "",
          phone: value.phoneNumber || "",
          dateOfBirth: value.dateOfBirth ? String(value.dateOfBirth).slice(0, 10) : "",
          gender: value.gender || "",
          profilePictureUrl: value.profilePictureUrl || "",
        };
        setProfile(value);
        setDraft(next);
        setBaseline(next);
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load your profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, user]);

  const dirty = useMemo(() => baseline !== null && JSON.stringify(draft) !== JSON.stringify(baseline), [baseline, draft]);
  const checks = passwordChecks(newPassword);
  const passwordValid = Object.values(checks).every(Boolean);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function setField<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
    if (key === "profilePictureUrl") setImageError(false);
  }

  function validateProfile() {
    const errors: FieldErrors = {};
    const phone = normalizedPhone(draft.phone);
    if (!draft.name.trim()) errors.name = "Full name is required.";
    else if (draft.name.trim().length > 150) errors.name = "Full name must be 150 characters or fewer.";
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) errors.phone = "Use international format, for example +201012345678.";
    if (draft.dateOfBirth && new Date(`${draft.dateOfBirth}T00:00:00`) >= new Date()) errors.dateOfBirth = "Date of birth must be in the past.";
    if (draft.profilePictureUrl) {
      try { new URL(draft.profilePictureUrl); } catch { errors.profilePictureUrl = "Enter a complete image URL."; }
    }
    setFieldErrors(errors);
    return { valid: !Object.keys(errors).length, phone };
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const validation = validateProfile();
    if (!validation.valid) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await request<Profile>(`/users/${user.id}`, {
        method: "PUT",
        body: {
          full_name: draft.name.trim(),
          phone_number: validation.phone,
          date_of_birth: draft.dateOfBirth || undefined,
          gender: draft.gender || undefined,
          profile_picture_url: draft.profilePictureUrl || undefined,
        },
      });
      const next: ProfileDraft = {
        name: updated.fullName || updated.full_name || draft.name.trim(),
        phone: updated.phoneNumber || validation.phone,
        dateOfBirth: updated.dateOfBirth ? String(updated.dateOfBirth).slice(0, 10) : draft.dateOfBirth,
        gender: updated.gender || draft.gender,
        profilePictureUrl: updated.profilePictureUrl || draft.profilePictureUrl,
      };
      setProfile(updated);
      setDraft(next);
      setBaseline(next);
      await refreshUser();
      setMessage("Profile saved. The shared header and profile menu were refreshed immediately.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const errors: FieldErrors = {};
    if (!currentPassword) errors.currentPassword = "Enter your current password.";
    if (!passwordValid) errors.newPassword = "The new password does not meet every requirement.";
    setFieldErrors((current) => ({ ...current, ...errors }));
    if (Object.keys(errors).length) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await request(`/users/${user.id}/change-password`, { method: "POST", body: { current_password: currentPassword, new_password: newPassword } });
      setCurrentPassword("");
      setNewPassword("");
      setCapsLock(false);
      setMessage("Password changed successfully. The server revoked your other active sessions; this browser remains signed in with its current token until renewal.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to change your password.");
    } finally {
      setSaving(false);
    }
  }

  function passwordKey(event: KeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  function setMotion(value: boolean) {
    setReducedMotion(value);
    localStorage.setItem("mdp-reduced-motion", String(value));
    document.documentElement.dataset.reducedMotion = String(value);
  }

  const displayName = profile?.fullName || profile?.full_name || profile?.email || "User";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return <ProductShell><main className="pp-page settings-complete-page">
    <div className="pp-title"><div><h1>Settings</h1><p>Manage persisted profile data, password security, theme preference, and accessibility motion.</p></div>{dirty && <span className="settings-unsaved-badge">Unsaved changes</span>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p className="form-success"><FiCheck /> {message}</p>}
    {loading ? <div className="product-auth-loading">Loading settings…</div> : <div className="settings-grid">
      <Panel id="profile" title="Profile">
        <div className="profile-card settings-avatar-preview">{draft.profilePictureUrl && !imageError ? <img src={draft.profilePictureUrl} alt={`${displayName} profile`} onError={() => setImageError(true)} /> : <span className="avatar-large">{initials}</span>}<div><h2>{displayName}</h2><p>{profile?.email}</p><p>{profile?.role.replaceAll("_", " ")}</p></div></div>
        <form onSubmit={saveProfile} noValidate>
          <label>Full name<input value={draft.name} onChange={(event) => setField("name", event.target.value)} required maxLength={150} />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label>
          <label>Phone number<input value={draft.phone} onChange={(event) => setField("phone", event.target.value)} onBlur={() => setField("phone", normalizedPhone(draft.phone))} required type="tel" placeholder="+201012345678" />{fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}</label>
          <label>Date of birth<input type="date" value={draft.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setField("dateOfBirth", event.target.value)} />{fieldErrors.dateOfBirth && <small className="field-error">{fieldErrors.dateOfBirth}</small>}</label>
          <label>Gender<select value={draft.gender} onChange={(event) => setField("gender", event.target.value as ProfileDraft["gender"])}><option value="">Not set</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
          <label>Profile picture URL<div className="input-with-icon"><FiImage /><input type="url" value={draft.profilePictureUrl} onChange={(event) => setField("profilePictureUrl", event.target.value)} placeholder="https://…" /></div>{fieldErrors.profilePictureUrl && <small className="field-error">{fieldErrors.profilePictureUrl}</small>}<small>The current backend persists a URL. Direct file upload and server-side cropping are not available yet.</small></label>
          <div className="settings-form-actions"><button type="button" className="pp-button secondary" disabled={!dirty || saving || !baseline} onClick={() => baseline && setDraft(baseline)}>Discard</button><button className="pp-button" disabled={saving || !dirty}><FiSave /> {saving ? "Saving…" : "Save profile"}</button></div>
        </form>
      </Panel>

      <Panel title="Account status"><p>Email <b>{profile?.email}</b></p><p>Status <b>{profile?.status}</b></p><p>Email verification <b>{profile?.emailVerified ? "Verified" : "Not verified"}</b></p><p>Role <b>{profile?.role.replaceAll("_", " ")}</b></p>{profile?.createdAt && <p>Created <b>{new Date(profile.createdAt).toLocaleDateString()}</b></p>}</Panel>

      <Panel title="Privacy & security"><form onSubmit={changePassword} noValidate>
        <label>Current password<div className="password-input"><input type={showCurrent ? "text" : "password"} value={currentPassword} onKeyUp={passwordKey} onChange={(event) => { setCurrentPassword(event.target.value); setFieldErrors((current) => ({ ...current, currentPassword: undefined })); }} required autoComplete="current-password" /><button type="button" onClick={() => setShowCurrent((value) => !value)} aria-label={showCurrent ? "Hide current password" : "Show current password"}>{showCurrent ? <FiEyeOff /> : <FiEye />}</button></div>{fieldErrors.currentPassword && <small className="field-error">{fieldErrors.currentPassword}</small>}</label>
        <label>New password<div className="password-input"><input type={showNew ? "text" : "password"} value={newPassword} onKeyUp={passwordKey} onChange={(event) => { setNewPassword(event.target.value); setFieldErrors((current) => ({ ...current, newPassword: undefined })); }} required minLength={12} autoComplete="new-password" /><button type="button" onClick={() => setShowNew((value) => !value)} aria-label={showNew ? "Hide new password" : "Show new password"}>{showNew ? <FiEyeOff /> : <FiEye />}</button></div>{fieldErrors.newPassword && <small className="field-error">{fieldErrors.newPassword}</small>}</label>
        {capsLock && <p className="caps-lock-warning">Caps Lock is on.</p>}
        <ul className="password-requirements"><li className={checks.length ? "met" : ""}>At least 12 characters</li><li className={checks.lower ? "met" : ""}>Lowercase letter</li><li className={checks.upper ? "met" : ""}>Uppercase letter</li><li className={checks.number ? "met" : ""}>Number</li></ul>
        <button className="pp-button" disabled={saving || !currentPassword || !newPassword}><FiLock /> {saving ? "Updating…" : "Change password"}</button>
      </form></Panel>

      <Panel id="appearance" title="Appearance"><div className="theme-choices"><button className={preference === "light" ? "active" : ""} onClick={() => setTheme("light")}>Light</button><button className={preference === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>Dark</button><button className={preference === "system" ? "active" : ""} onClick={() => setTheme("system")}>System</button></div><p>Resolved theme: <b>{theme}</b>. System mode now follows operating-system changes live.</p><label className="settings-switch"><span><b>Reduce motion</b><small>Disable non-essential movement and animated feedback.</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => setMotion(event.target.checked)} /></label></Panel>

      <Panel title="Integration status"><p><FiUser /> Profile: <b>GET/PUT /users/:userId</b></p><p><FiLock /> Password: <b>POST /users/:userId/change-password</b></p><p>Profile pictures are URL-backed. Billing, subscriptions, two-factor authentication, file upload, and device management are not displayed as completed capabilities because their backend endpoints do not exist.</p></Panel>
    </div>}
  </main></ProductShell>;
}