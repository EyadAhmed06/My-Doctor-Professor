"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FiCamera, FiCheck, FiEye, FiEyeOff, FiGlobe, FiLock, FiMonitor, FiSave, FiShield, FiTrash2, FiUploadCloud, FiUser } from "react-icons/fi";
import { apiAssetUrl } from "@/lib/api";
import { useAppTheme } from "./app-theme";
import { AuthUser, useAuth } from "./auth-provider";
import { LanguageSwitcher, useLocale } from "./locale-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

type Profile = AuthUser & {
  phoneNumber?: string;
  dateOfBirth?: string | null;
  gender?: "MALE" | "FEMALE" | null;
  studentNumber?: string;
  currentSemester?: number;
  current_semester?: number;
  createdAt?: string;
  updatedAt?: string;
};

type ProfileDraft = {
  name: string;
  phone: string;
  dateOfBirth: string;
  gender: "" | "MALE" | "FEMALE";
  current_semester: number | "";
};

type FieldErrors = Partial<Record<keyof ProfileDraft | "currentPassword" | "newPassword", string>>;
type SecurityOverview = {
  sessions: Array<{ id:string; current:boolean; created_at:string; last_used_at:string|null; expires_at:string }>;
  providers: Array<{ provider:string; email:string; linked_at:string; last_used_at:string|null }>;
};

const PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

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
  const router = useRouter();
  const { user, request, refreshUser, logout } = useAuth();
  const { theme, preference, setTheme } = useAppTheme();
  const { locale } = useLocale();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [security, setSecurity] = useState<SecurityOverview | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({ name: "", phone: "", dateOfBirth: "", gender: "", current_semester: 1 });
  const [baseline, setBaseline] = useState<ProfileDraft | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState<string | null>(null);
  const [pictureBusy, setPictureBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [securityBusy, setSecurityBusy] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
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
    setLoading(true);
    void Promise.all([
      request<Profile>(`/users/${user.id}`),
      request<SecurityOverview>("/auth/security"),
    ]).then(([value, securityValue]) => {
      if (!active) return;
      const resolvedSemester = value.currentSemester ?? value.current_semester ?? user.currentSemester ?? user.current_semester ?? 1;
      const next: ProfileDraft = {
        name: value.fullName || value.full_name || "",
        phone: value.phoneNumber || "",
        dateOfBirth: value.dateOfBirth ? String(value.dateOfBirth).slice(0, 10) : "",
        gender: value.gender || "",
        current_semester: resolvedSemester,
      };
      setProfile(value);
      setSecurity(securityValue);
      setDraft(next);
      setBaseline(next);
      setImageError(false);
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Unable to load your settings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, user]);

  useEffect(() => () => {
    if (picturePreview) URL.revokeObjectURL(picturePreview);
  }, [picturePreview]);

  const dirty = useMemo(() => baseline !== null && JSON.stringify(draft) !== JSON.stringify(baseline), [baseline, draft]);
  const checks = passwordChecks(newPassword);
  const passwordValid = Object.values(checks).every(Boolean);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty && !pictureFile) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, pictureFile]);

  function setField<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function validateProfile() {
    const errors: FieldErrors = {};
    const phone = normalizedPhone(draft.phone);
    if (!draft.name.trim()) errors.name = "Full name is required.";
    else if (draft.name.trim().length > 150) errors.name = "Full name must be 150 characters or fewer.";
    if (!/^\+[1-9]\d{6,14}$/.test(phone)) errors.phone = "Use international format, for example +201012345678.";
    if (draft.dateOfBirth && new Date(`${draft.dateOfBirth}T00:00:00`) >= new Date()) errors.dateOfBirth = "Date of birth must be in the past.";
    if (user?.role === "STUDENT") {
      const sem = Number(draft.current_semester);
      if (!Number.isInteger(sem) || sem < 1 || sem > 6) {
        errors.current_semester = locale === "ar" ? "اختر فصلاً دراسياً صحيحاً من 1 إلى 6." : "Select an academic semester from 1 to 6.";
      }
    }
    setFieldErrors(errors);
    return { valid: !Object.keys(errors).length, phone };
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const validation = validateProfile();
    if (!validation.valid) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      const updated = await request<Profile>(`/users/${user.id}`, {
        method: "PUT",
        body: {
          full_name: draft.name.trim(),
          phone_number: validation.phone,
          date_of_birth: draft.dateOfBirth || undefined,
          gender: draft.gender || undefined,
          current_semester: user.role === "STUDENT" && draft.current_semester !== "" ? Number(draft.current_semester) : undefined,
        },
      });
      const next: ProfileDraft = {
        name: updated.fullName || updated.full_name || draft.name.trim(),
        phone: updated.phoneNumber || validation.phone,
        dateOfBirth: updated.dateOfBirth ? String(updated.dateOfBirth).slice(0, 10) : draft.dateOfBirth,
        gender: updated.gender || draft.gender,
        current_semester: updated.currentSemester ?? updated.current_semester ?? draft.current_semester,
      };
      setProfile(updated); setDraft(next); setBaseline(next); await refreshUser();
      setMessage(locale === "ar" ? "تم حفظ الملف الشخصي وتحديث الفصل الدراسي." : "Profile saved and semester synchronised across the workspace.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save your profile."); }
    finally { setSaving(false); }
  }

  function chooseProfilePicture(file: File | null) {
    setError(null); setMessage(null); setImageError(false);
    if (!file) return;
    if (!PROFILE_IMAGE_TYPES.has(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image. SVG and executable formats are not accepted.");
      return;
    }
    if (!file.size || file.size > PROFILE_IMAGE_MAX_BYTES) {
      setError("Profile picture must be 5 MB or smaller.");
      return;
    }
    if (picturePreview) URL.revokeObjectURL(picturePreview);
    setPictureFile(file);
    setPicturePreview(URL.createObjectURL(file));
  }

  function discardPictureSelection() {
    if (picturePreview) URL.revokeObjectURL(picturePreview);
    setPicturePreview(null); setPictureFile(null); setImageError(false);
  }

  async function uploadProfilePicture() {
    if (!user || !pictureFile) return;
    setPictureBusy(true); setError(null); setMessage(null);
    try {
      const updated = await request<Profile>(`/users/${user.id}/profile-picture`, {
        method: "PUT",
        body: pictureFile,
        headers: { "Content-Type": pictureFile.type },
      });
      setProfile(updated);
      discardPictureSelection();
      await refreshUser();
      setMessage("Profile picture updated across the workspace.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to upload your profile picture."); }
    finally { setPictureBusy(false); }
  }

  async function deleteProfilePicture() {
    if (!user || !profile?.profilePictureUrl) return;
    setPictureBusy(true); setError(null); setMessage(null);
    try {
      await request(`/users/${user.id}/profile-picture`, { method: "DELETE" });
      discardPictureSelection();
      setProfile((current) => current ? { ...current, profilePictureUrl: null } : current);
      await refreshUser();
      setMessage("Profile picture removed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to remove your profile picture."); }
    finally { setPictureBusy(false); }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const errors: FieldErrors = {};
    if (!currentPassword) errors.currentPassword = "Enter your current password.";
    if (!passwordValid) errors.newPassword = "The new password does not meet every requirement.";
    setFieldErrors((current) => ({ ...current, ...errors }));
    if (Object.keys(errors).length) return;
    setSaving(true); setError(null); setMessage(null);
    try {
      await request(`/users/${user.id}/change-password`, { method: "POST", body: { current_password: currentPassword, new_password: newPassword } });
      setCurrentPassword(""); setNewPassword(""); setCapsLock(false);
      try { await logout(); } catch { /* session is intentionally revoked by the password change */ }
      router.push("/login?password=changed");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change your password."); }
    finally { setSaving(false); }
  }

  async function revokeOtherSessions(){
    setSecurityBusy(true); setError(null); setMessage(null);
    try{
      await request("/auth/sessions/revoke-others",{method:"POST"});
      const next=await request<SecurityOverview>("/auth/security");
      setSecurity(next); setMessage("Other active sessions were signed out.");
    }catch(cause){setError(cause instanceof Error?cause.message:"Unable to revoke other sessions.");}
    finally{setSecurityBusy(false);}
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault();
    if (!user || deleteConfirmation !== "DELETE" || !deletePassword) return;
    setDeleteBusy(true); setError(null); setMessage(null);
    try {
      await request(`/users/${user.id}`, { method: "DELETE", body: { current_password: deletePassword, confirmation: deleteConfirmation } });
      try { await logout(); } catch { /* the account deletion already revoked this session */ }
      router.push("/login?account=deleted");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to delete your account."); }
    finally { setDeleteBusy(false); }
  }

  function passwordKey(event: KeyboardEvent<HTMLInputElement>) { setCapsLock(event.getModifierState("CapsLock")); }
  function setMotion(value: boolean) {
    setReducedMotion(value); localStorage.setItem("mdp-reduced-motion", String(value));
    document.documentElement.dataset.reducedMotion = String(value);
  }

  const displayName = profile?.fullName || profile?.full_name || profile?.email || "User";
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const google=security?.providers.find(provider=>provider.provider==="GOOGLE");
  const otherSessions=security?.sessions.filter(session=>!session.current).length||0;
  const profileImage = picturePreview || apiAssetUrl(profile?.profilePictureUrl);

  return <ProductShell><main className="pp-page settings-complete-page settings-v2-page">
    <div className="pp-title settings-v2-heading"><div><small className="page-eyebrow">ACCOUNT CONTROL</small><h1>{locale==="ar"?"الإعدادات":"Settings"}</h1><p>{locale==="ar"?"إدارة هويتك وأمان الحساب والجلسات والمظهر واللغة من مكان واحد.":"One place for identity, account security, active sessions, appearance, language, and accessibility."}</p></div>{(dirty || pictureFile) && <span className="settings-unsaved-badge">Unsaved changes</span>}</div>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success"><FiCheck /> {message}</p>}
    {loading ? <div className="product-auth-loading">Loading settings…</div> : <div className="settings-v2-layout">
      <nav className="settings-section-nav" aria-label="Settings sections"><a href="#profile"><FiUser/> Identity</a><a href="#security"><FiShield/> Security</a><a href="#appearance"><FiGlobe/> Appearance & language</a>{user?.role==="STUDENT"&&<a href="#delete-account"><FiTrash2/> Delete account</a>}</nav>
      <div className="settings-v2-content">
        <Panel id="profile" title="Profile & identity">
          <div className="profile-card settings-avatar-preview">
            <div className="settings-avatar-media">{profileImage && !imageError ? <img src={profileImage} alt={`${displayName} profile`} onError={() => setImageError(true)} /> : <span className="avatar-large">{initials}</span>}</div>
            <div className="settings-avatar-copy">
              <h2>{displayName}</h2>
              <p>{profile?.email}</p>
              <p>
                {profile?.role.replaceAll("_", " ")}
                {user?.role === "STUDENT" && (profile?.currentSemester || profile?.current_semester || user?.currentSemester || user?.current_semester)
                  ? ` · Semester ${profile?.currentSemester ?? profile?.current_semester ?? user?.currentSemester ?? user?.current_semester}`
                  : ""}
                {" · "}{profile?.status}
              </p>
              <small>JPEG, PNG, or WebP · max 5 MB. Files are renamed and stored by the server.</small>
            </div>
            <div className="settings-avatar-actions">
              <label className="pp-button secondary settings-file-button"><FiCamera/> {profile?.profilePictureUrl ? "Choose replacement" : "Choose photo"}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event)=>chooseProfilePicture(event.target.files?.[0]||null)} disabled={pictureBusy}/></label>
              {pictureFile && <button type="button" className="pp-button" disabled={pictureBusy} onClick={()=>void uploadProfilePicture()}><FiUploadCloud/> {pictureBusy?"Uploading…":"Upload photo"}</button>}
              {pictureFile && <button type="button" className="pp-button secondary" disabled={pictureBusy} onClick={discardPictureSelection}>Cancel preview</button>}
              {profile?.profilePictureUrl && !pictureFile && <button type="button" className="pp-button secondary danger-text" disabled={pictureBusy} onClick={()=>void deleteProfilePicture()}><FiTrash2/> {pictureBusy?"Removing…":"Remove photo"}</button>}
            </div>
          </div>
          <form onSubmit={saveProfile} noValidate className="settings-profile-form">
            <label>Full name<input value={draft.name} onChange={(event) => setField("name", event.target.value)} required maxLength={150} />{fieldErrors.name && <small className="field-error">{fieldErrors.name}</small>}</label>
            <label>Phone number<input value={draft.phone} onChange={(event) => setField("phone", event.target.value)} onBlur={() => setField("phone", normalizedPhone(draft.phone))} required type="tel" placeholder="+201012345678" />{fieldErrors.phone && <small className="field-error">{fieldErrors.phone}</small>}</label>
            <label>Date of birth<input type="date" value={draft.dateOfBirth} max={new Date().toISOString().slice(0, 10)} onChange={(event) => setField("dateOfBirth", event.target.value)} />{fieldErrors.dateOfBirth && <small className="field-error">{fieldErrors.dateOfBirth}</small>}</label>
            <label>Gender<select value={draft.gender} onChange={(event) => setField("gender", event.target.value as ProfileDraft["gender"])}><option value="">Not set</option><option value="MALE">Male</option><option value="FEMALE">Female</option></select></label>
            {user?.role === "STUDENT" && (
              <>
                <label>
                  {locale === "ar" ? "الفصل الدراسي الأكاديمي" : "Academic semester"}
                  <select
                    value={draft.current_semester}
                    onChange={(event) => setField("current_semester", Number(event.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6].map((sem) => (
                      <option key={sem} value={sem}>
                        {locale === "ar"
                          ? `الفصل الدراسي ${sem} (السنة ${Math.ceil(sem / 2)})`
                          : `Semester ${sem} (Year ${Math.ceil(sem / 2)})`}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.current_semester && <small className="field-error">{fieldErrors.current_semester}</small>}
                  <small style={{ color: "var(--pp-text-muted, #64748b)", fontSize: "0.82rem", marginTop: 4, display: "block" }}>
                    {locale === "ar"
                      ? "يحدد الحزم والمقررات المتزامنة مع حسابك الدراسي."
                      : "Controls which learning bundles, courses, and modules synchronize with your workspace."}
                  </small>
                </label>
                {(profile?.studentNumber || user?.studentNumber) && (
                  <label>
                    {locale === "ar" ? "رقم الطالب الجامعي" : "Student number"}
                    <input
                      value={profile?.studentNumber || user?.studentNumber || ""}
                      readOnly
                      disabled
                      style={{ opacity: 0.8, cursor: "not-allowed", backgroundColor: "var(--pp-bg-subtle, rgba(0,0,0,0.03))" }}
                    />
                    <small style={{ color: "var(--pp-text-muted, #64748b)", fontSize: "0.82rem", marginTop: 4, display: "block" }}>
                      {locale === "ar" ? "الرقم التعريفي الأكاديمي الرسمي (للقراءة فقط)." : "Official university academic identifier (read-only)."}
                    </small>
                  </label>
                )}
              </>
            )}
            <div className="settings-form-actions wide"><button type="button" className="pp-button secondary" disabled={!dirty || saving || !baseline} onClick={() => baseline && setDraft(baseline)}>{locale === "ar" ? "إلغاء التعديلات" : "Discard"}</button><button className="pp-button" disabled={saving || !dirty}><FiSave /> {saving ? (locale === "ar" ? "جاري الحفظ…" : "Saving…") : (locale === "ar" ? "حفظ الملف الشخصي" : "Save profile")}</button></div>
          </form>
        </Panel>

        <Panel id="security" title="Security & sessions">
          <div className="settings-security-summary"><div><FiShield/><span><b>Email verification</b><small>{profile?.emailVerified?"Verified":"Not verified"}</small></span></div><div><FiMonitor/><span><b>Active sessions</b><small>{security?.sessions.length||0} active · {otherSessions} other</small></span></div><div><FiGlobe/><span><b>Google identity</b><small>{google?`Linked · ${google.email}`:"Not linked"}</small></span></div></div>
          <div className="settings-session-list">{security?.sessions.map(session=><article key={session.id} className={session.current?"current":""}><FiMonitor/><div><b>{session.current?"This browser":"Active session"}</b><small>Started {new Date(session.created_at).toLocaleString()}</small><small>Expires {new Date(session.expires_at).toLocaleString()}</small></div>{session.current&&<span>Current</span>}</article>)}</div>
          <div className="settings-security-actions"><button type="button" className="pp-button secondary" disabled={securityBusy||otherSessions===0} onClick={()=>void revokeOtherSessions()}><FiShield/> {securityBusy?"Signing out…":"Sign out other sessions"}</button></div>
          <form onSubmit={changePassword} noValidate className="settings-password-form">
            <h3>Change password</h3><div className="settings-password-grid"><label>Current password<div className="password-input"><input type={showCurrent ? "text" : "password"} value={currentPassword} onKeyUp={passwordKey} onChange={(event) => { setCurrentPassword(event.target.value); setFieldErrors((current) => ({ ...current, currentPassword: undefined })); }} required autoComplete="current-password" /><button type="button" onClick={() => setShowCurrent((value) => !value)} aria-label={showCurrent ? "Hide current password" : "Show current password"}>{showCurrent ? <FiEyeOff /> : <FiEye />}</button></div>{fieldErrors.currentPassword && <small className="field-error">{fieldErrors.currentPassword}</small>}</label>
            <label>New password<div className="password-input"><input type={showNew ? "text" : "password"} value={newPassword} onKeyUp={passwordKey} onChange={(event) => { setNewPassword(event.target.value); setFieldErrors((current) => ({ ...current, newPassword: undefined })); }} required minLength={12} autoComplete="new-password" /><button type="button" onClick={() => setShowNew((value) => !value)} aria-label={showNew ? "Hide new password" : "Show new password"}>{showNew ? <FiEyeOff /> : <FiEye />}</button></div>{fieldErrors.newPassword && <small className="field-error">{fieldErrors.newPassword}</small>}</label></div>
            {capsLock && <p className="caps-lock-warning">Caps Lock is on.</p>}<ul className="password-requirements"><li className={checks.length ? "met" : ""}>At least 12 characters</li><li className={checks.lower ? "met" : ""}>Lowercase letter</li><li className={checks.upper ? "met" : ""}>Uppercase letter</li><li className={checks.number ? "met" : ""}>Number</li></ul><button className="pp-button" disabled={saving || !currentPassword || !newPassword}><FiLock /> {saving ? "Updating…" : "Change password"}</button>
          </form>
        </Panel>

        {user?.role==="STUDENT"&&<Panel id="delete-account" title="Delete account"><form onSubmit={deleteAccount} className="settings-password-form"><p>Deleting your account immediately disables sign-in and signs out every active session. Academic and audit records are retained securely.</p><label>Current password<input type="password" autoComplete="current-password" value={deletePassword} onChange={(event)=>setDeletePassword(event.target.value)} required /></label><label>Type DELETE to confirm<input value={deleteConfirmation} onChange={(event)=>setDeleteConfirmation(event.target.value)} required /></label><button className="pp-button danger" disabled={deleteBusy||!deletePassword||deleteConfirmation!=="DELETE"}><FiTrash2/> {deleteBusy?"Deleting…":"Delete my account"}</button></form></Panel>}

        <Panel id="appearance" title="Appearance & language"><div className="settings-preference-grid"><section><h3>Theme</h3><div className="theme-choices"><button className={preference === "light" ? "active" : ""} onClick={() => setTheme("light")}>Light</button><button className={preference === "dark" ? "active" : ""} onClick={() => setTheme("dark")}>Dark</button><button className={preference === "system" ? "active" : ""} onClick={() => setTheme("system")}>System</button></div><p>Resolved theme: <b>{theme}</b>.</p></section><section><h3>Language</h3><LanguageSwitcher/><p>English and Arabic UI are available. Arabic switches the application shell to RTL while academic/user-authored content keeps its original language.</p></section></div><label className="settings-switch"><span><b>Reduce motion</b><small>Disable non-essential movement and animated feedback.</small></span><input type="checkbox" checked={reducedMotion} onChange={(event) => setMotion(event.target.checked)} /></label></Panel>
      </div>
    </div>}
  </main></ProductShell>;
}
