"use client";

import { FormEvent, useEffect, useState } from "react";
import { FiCheck, FiLock, FiSave, FiUser } from "react-icons/fi";
import { useAppTheme } from "./app-theme";
import { AuthUser, useAuth } from "./auth-provider";
import { Panel, ProductShell } from "./product-shell";
import "./product-pages.css";

type Profile = AuthUser & {phoneNumber?:string;dateOfBirth?:string|null;gender?:string|null;createdAt?:string;updatedAt?:string};

export function ConnectedSettingsPage(){
  const {user,request}=useAuth();const {theme,setTheme}=useAppTheme();
  const [profile,setProfile]=useState<Profile|null>(null);const [name,setName]=useState("");const [phone,setPhone]=useState("");
  const [currentPassword,setCurrentPassword]=useState("");const [newPassword,setNewPassword]=useState("");
  const [loading,setLoading]=useState(true);const [saving,setSaving]=useState(false);const [message,setMessage]=useState<string|null>(null);const [error,setError]=useState<string|null>(null);
  useEffect(()=>{if(!user)return;let active=true;void request<Profile>(`/users/${user.id}`).then(value=>{if(active){setProfile(value);setName(value.fullName||value.full_name||"");setPhone(value.phoneNumber||"");}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:"Unable to load your profile.");}).finally(()=>{if(active)setLoading(false)});return()=>{active=false};},[user,request]);
  async function saveProfile(event:FormEvent){event.preventDefault();if(!user)return;setSaving(true);setError(null);setMessage(null);try{const updated=await request<Profile>(`/users/${user.id}`,{method:"PUT",body:{full_name:name,phone_number:phone}});setProfile(updated);setMessage("Profile saved successfully. Refreshing the page will update the shared header.");}catch(cause){setError(cause instanceof Error?cause.message:"Unable to save your profile.");}finally{setSaving(false);}}
  async function changePassword(event:FormEvent){event.preventDefault();if(!user)return;setSaving(true);setError(null);setMessage(null);try{await request(`/users/${user.id}/change-password`,{method:"POST",body:{current_password:currentPassword,new_password:newPassword}});setCurrentPassword("");setNewPassword("");setMessage("Password changed. Other sessions were revoked by the server.");}catch(cause){setError(cause instanceof Error?cause.message:"Unable to change your password.");}finally{setSaving(false);}}
  const displayName=profile?.fullName||profile?.full_name||profile?.email||"User";const initials=displayName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join("").toUpperCase();
  return <ProductShell><main className="pp-page"><div className="pp-title"><div><h1>Settings</h1><p>Account values shown here come from your authenticated user record.</p></div></div>{error&&<p className="form-error" role="alert">{error}</p>}{message&&<p className="form-success"><FiCheck/> {message}</p>}{loading?<div className="product-auth-loading">Loading settings…</div>:<div className="settings-grid">
    <Panel title="Profile"><div className="profile-card"><span className="avatar-large">{initials}</span><div><h2>{displayName}</h2><p>{profile?.email}</p><p>{profile?.role.replaceAll("_"," ")}</p></div></div><form onSubmit={saveProfile}><label>Full name<input value={name} onChange={event=>setName(event.target.value)} required maxLength={150}/></label><label>Phone number<input value={phone} onChange={event=>setPhone(event.target.value)} required type="tel"/></label><button className="pp-button" disabled={saving}><FiSave/> Save profile</button></form></Panel>
    <Panel title="Account status"><p>Email <b>{profile?.email}</b></p><p>Status <b>{profile?.status}</b></p><p>Email verification <b>{profile?.emailVerified?"Verified":"Not verified"}</b></p><p>Role <b>{profile?.role.replaceAll("_"," ")}</b></p>{profile?.createdAt&&<p>Created <b>{new Date(profile.createdAt).toLocaleDateString()}</b></p>}</Panel>
    <Panel title="Privacy & security"><form onSubmit={changePassword}><label>Current password<input type="password" value={currentPassword} onChange={event=>setCurrentPassword(event.target.value)} required autoComplete="current-password"/></label><label>New password<input type="password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} required minLength={12} autoComplete="new-password"/></label><small>At least 12 characters with uppercase, lowercase, and a number.</small><button className="pp-button" disabled={saving}><FiLock/> Change password</button></form></Panel>
    <Panel title="Appearance"><div className="theme-choices"><button className={theme==="light"?"active":""} onClick={()=>setTheme("light")}>Light</button><button className={theme==="dark"?"active":""} onClick={()=>setTheme("dark")}>Dark</button><button onClick={()=>setTheme(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light")}>System</button></div><p>The selected theme is stored locally for this browser.</p></Panel>
    <Panel title="Integration status"><p><FiUser/> Profile: <b>GET/PUT /users/:userId</b></p><p><FiLock/> Password: <b>POST /users/:userId/change-password</b></p><p>Billing, subscriptions, two-factor authentication, and device management are not displayed because those backend capabilities do not exist yet.</p></Panel>
  </div>}</main></ProductShell>;
}
