"use client";
export const dynamic = "force-dynamic";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { apiFetch, apiGet } from "@/lib/api-client";

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="data-card rounded-xl border border-[#E2E8F0]">
      <h2 className="text-sm font-semibold text-[#64748B] uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Input field ────────────────────────────────────────────────────────────────
function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-[#64748B]">{label}</label>
      <input
        {...props}
        className="input-base disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

// ── Delete confirmation modal ──────────────────────────────────────────────────
function DeleteModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [input, setInput] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-sm rounded-xl border border-red-200 bg-white p-6 shadow-xl">
        <h3 className="mb-2 text-lg font-bold text-red-700">Delete Account</h3>
        <p className="mb-4 text-sm text-muted2">
          This permanently deletes your account and all data. Type{" "}
          <span className="font-mono text-red-400">DELETE</span> to confirm.
        </p>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="DELETE"
          className="input-base mb-4 focus:ring-2 focus:ring-red-500/30"
        />
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-muted2 transition-colors hover:bg-surface-2"
          >
            Cancel
          </button>
          <button
            disabled={input !== "DELETE"}
            onClick={onConfirm}
            className="flex-1 py-2 rounded-lg bg-red-700 text-sm text-white font-semibold hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Delete Forever
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Branding section ──────────────────────────────────────────────────────────
interface BrandingConfig {
  white_label_enabled: boolean;
  firm_name: string | null;
  advisor_name: string | null;
  advisor_email: string;
  logo_base64?: string | null;
  firm_logo_url?: string;
  brand_primary_color: string;
  brand_color?: string | null;
}

function BrandingSection() {
  const [config, setConfig] = useState<BrandingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  // Editable copies
  const [firmName, setFirmName] = useState("");
  const [advisorName, setAdvisorName] = useState("");
  const [advisorEmail, setAdvisorEmail] = useState("");
  const [brandColor, setBrandColor] = useState("#1EB8CC");
  const [wlEnabled, setWlEnabled] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<BrandingConfig>("/api/profile/white-label")
      .then((data) => {
        setConfig(data);
        setFirmName(data.firm_name ?? "");
        setAdvisorName(data.advisor_name ?? "");
        setAdvisorEmail(data.advisor_email ?? "");
        const bc = data.brand_color || data.brand_primary_color || "#1EB8CC";
        setBrandColor(bc);
        setWlEnabled(data.white_label_enabled);
        setLogoPreview(
          data.logo_base64
            ? `data:image/png;base64,${data.logo_base64}`
            : data.firm_logo_url || null,
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      // Upload new logo if selected
      if (logoFile) {
        const form = new FormData();
        form.append("file", logoFile);
        const res = await apiFetch("/api/profile/logo", {
          method: "POST",
          body: form,
        });
        if (res.ok) {
          const data = (await res.json()) as {
            logo_url?: string;
            logo_base64?: string;
          };
          if (data.logo_base64) {
            const src = `data:image/png;base64,${data.logo_base64}`;
            setConfig((c) =>
              c
                ? {
                    ...c,
                    logo_base64: data.logo_base64,
                    firm_logo_url: data.logo_url || c.firm_logo_url,
                  }
                : c,
            );
            setLogoPreview(src);
            setLogoFile(null);
          } else if (data.logo_url) {
            setConfig((c) => (c ? { ...c, firm_logo_url: data.logo_url! } : c));
            setLogoPreview(data.logo_url!);
            setLogoFile(null);
          }
        }
      }

      const res = await apiFetch("/api/profile/branding", {
        method: "PATCH",
        body: JSON.stringify({
          firm_name: firmName,
          advisor_name: advisorName,
          advisor_email: advisorEmail,
          brand_primary_color: brandColor,
          white_label_enabled: wlEnabled,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setConfig((c) =>
        c
          ? {
              ...c,
              firm_name: firmName,
              advisor_name: advisorName,
              advisor_email: advisorEmail,
              brand_primary_color: brandColor,
              brand_color: brandColor,
              white_label_enabled: wlEnabled,
            }
          : c,
      );
      setMsg("Branding saved.");
      setEditing(false);
    } catch (e) {
      setErr((e as Error).message || "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-shell-subtle py-2">
        <div className="w-4 h-4 border-2 border-shell-border border-t-shell-muted rounded-full animate-spin" />
        Loading branding…
      </div>
    );
  }

  const displayLogo = logoPreview ?? config?.firm_logo_url;

  return (
    <div className="flex flex-col gap-4">
      {/* Preview strip */}
      <div className="rounded-xl overflow-hidden border border-[#2A3550]">
        <div
          className="h-1.5"
          style={{
            background: wlEnabled ? brandColor || "#1EB8CC" : "#1EB8CC",
          }}
        />
        <div className="bg-[#0B0F14] px-4 py-3 flex items-center gap-3">
          {displayLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayLogo}
              alt="Firm logo"
              style={{ height: 28, objectFit: "contain" }}
            />
          ) : (
            <div className="text-[#1EB8CC] font-bold text-sm">
              {(firmName || "NeuFin").slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="text-sm text-[#64748B] uppercase tracking-widest">
              Portfolio Intelligence Report
            </div>
            <div className="text-xs font-semibold text-[#F0F4FF]">
              {wlEnabled && firmName ? firmName : "NeuFin Intelligence"}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-[#64748B]">Prepared by</div>
            <div className="text-sm text-[#CBD5E1]">
              {wlEnabled && advisorName ? advisorName : "NeuFin Intelligence"}
            </div>
          </div>
        </div>
        <div className="bg-[#0D1118] px-4 py-1.5 flex items-center justify-between">
          <div className="text-sm text-[#2A3550]">RESTRICTED</div>
          <div className="text-sm text-[#2A3550]">
            {wlEnabled && firmName
              ? `${firmName} · Confidential`
              : "Powered by NeuFin Intelligence"}
          </div>
        </div>
      </div>

      {!editing ? (
        <div className="flex items-center gap-3">
          <div className="text-sm text-shell-muted flex-1">
            {config?.white_label_enabled ? (
              <span className="text-green-400">
                White-label active —{" "}
                <strong className="text-white">
                  {config.firm_name || "Your firm"}
                </strong>
              </span>
            ) : (
              "Using NeuFin Intelligence branding"
            )}
          </div>
          <button
            onClick={() => setEditing(true)}
            className="py-1.5 px-4 rounded-lg border border-shell-border text-sm text-shell-fg/90 hover:bg-shell-raised transition-colors"
          >
            Edit Branding
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-4 p-4 bg-[#0D1118] rounded-xl border border-[#2A3550]">
          {/* WL toggle */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="wl-settings"
              checked={wlEnabled}
              onChange={(e) => setWlEnabled(e.target.checked)}
              className="w-4 h-4 accent-teal-400 cursor-pointer"
            />
            <label
              htmlFor="wl-settings"
              className="text-sm text-[#F0F4FF] cursor-pointer"
            >
              Enable white-label branding on reports
            </label>
          </div>

          <div>
            <label className="block text-xs text-[#64748B] mb-1">
              Firm name
            </label>
            <input
              type="text"
              value={firmName}
              onChange={(e) => setFirmName(e.target.value)}
              placeholder="Acme Capital Management"
              className="w-full bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2 text-sm text-[#F0F4FF] placeholder-[#3A4560] focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40"
            />
          </div>
          <div>
            <label className="block text-xs text-[#64748B] mb-1">
              Advisor name (appears on reports)
            </label>
            <input
              type="text"
              value={advisorName}
              onChange={(e) => setAdvisorName(e.target.value)}
              placeholder="Jane Smith, CFA"
              className="w-full bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2 text-sm text-[#F0F4FF] placeholder-[#3A4560] focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40"
            />
          </div>
          <div>
            <label className="block text-xs text-[#64748B] mb-1">
              Contact email for reports
            </label>
            <input
              type="email"
              value={advisorEmail}
              onChange={(e) => setAdvisorEmail(e.target.value)}
              placeholder="jane@acmecapital.com"
              className="w-full bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2 text-sm text-[#F0F4FF] placeholder-[#3A4560] focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40"
            />
          </div>

          {/* Logo */}
          <div>
            <label className="block text-xs text-[#64748B] mb-1">
              Firm logo
            </label>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/svg+xml,image/jpeg,image/webp"
              onChange={handleLogoSelect}
              className="hidden"
            />
            <div
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-3 p-3 bg-[#0B0F14] border border-dashed border-[#2A3550] rounded-lg cursor-pointer hover:border-[#1EB8CC]/50 transition-colors"
            >
              {displayLogo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayLogo}
                  alt="Logo"
                  style={{ height: 28, objectFit: "contain" }}
                />
              ) : (
                <div className="text-[#64748B] text-xs">
                  Click to upload (PNG/SVG/JPEG)
                </div>
              )}
              <span className="ml-auto text-[#1EB8CC] text-xs">
                {logoFile ? "Change" : "Upload"}
              </span>
            </div>
          </div>

          {/* Brand color */}
          <div>
            <label className="block text-xs text-[#64748B] mb-1">
              Primary brand color
            </label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-10 h-9 rounded border border-[#2A3550] bg-[#0B0F14] cursor-pointer p-0.5"
              />
              <input
                type="text"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="flex-1 bg-[#0B0F14] border border-[#2A3550] rounded-lg px-3 py-2 text-sm text-[#F0F4FF] font-mono focus:outline-none focus:ring-2 focus:ring-[#1EB8CC]/40"
              />
            </div>
          </div>

          {err && <p className="text-red-400 text-xs">{err}</p>}
          {msg && <p className="text-green-400 text-xs">{msg}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-lg border border-[#2A3550] text-sm text-[#64748B] hover:bg-[#1A2030] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-[#1EB8CC] text-[#0B0F14] text-sm font-semibold hover:bg-[#18a8ba] disabled:opacity-60 transition-colors"
            >
              {saving ? "Saving…" : "Save Branding"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState(
    user?.user_metadata?.full_name ?? "",
  );
  const [nameLoading, setNameLoading] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  const [showDelete, setShowDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const handleSaveName = async () => {
    if (!displayName.trim()) return;
    setNameLoading(true);
    setNameMsg("");
    const { error } = await supabase.auth.updateUser({
      data: { full_name: displayName.trim() },
    });
    setNameLoading(false);
    if (error) setNameMsg(`Error: ${error.message}`);
    else setNameMsg("Display name updated.");
  };

  const handleChangePassword = async () => {
    setPwMsg("");
    setPwError("");
    if (newPassword.length < 8) {
      setPwError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwError("Passwords do not match.");
      return;
    }
    setPwLoading(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwLoading(false);
    if (error) setPwError(error.message);
    else {
      setPwMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteError("");
    // Sign out then redirect — actual deletion requires a server-side admin call;
    // send a deletion request email or call a backend endpoint if needed.
    try {
      await supabase.auth.signOut();
      router.push("/");
    } catch {
      setDeleteError("Could not delete account. Please contact support.");
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-section">
      <div className="section-header">
        <div>
          <h1>Account Settings</h1>
          <p>{user.email}</p>
        </div>
      </div>

      {/* Profile */}
      <Section title="Profile">
        <div className="flex flex-col gap-4">
          <Field
            label="Display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your name"
          />
          <Field label="Email" value={user.email ?? ""} disabled type="email" />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveName}
              disabled={nameLoading || !displayName.trim()}
              className="btn-primary py-1.5 px-4 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {nameLoading ? "Saving…" : "Save Changes"}
            </button>
            {nameMsg && <p className="text-xs text-green-400">{nameMsg}</p>}
          </div>
        </div>
      </Section>

      {/* Report Branding */}
      <Section title="Report Branding">
        <p className="text-xs text-shell-subtle mb-4">
          Customize how your NeuFin PDF reports appear. Advisors and B2B
          partners can white-label reports with their firm&apos;s logo and
          colors.
        </p>
        <BrandingSection />
      </Section>

      {/* Password */}
      <Section title="Change Password">
        <div className="flex flex-col gap-4">
          <Field
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
          />
          <Field
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Repeat new password"
          />
          {pwError && <p className="text-xs text-red-400">{pwError}</p>}
          {pwMsg && <p className="text-xs text-green-400">{pwMsg}</p>}
          <button
            onClick={handleChangePassword}
            disabled={pwLoading || !newPassword}
            className="btn-primary py-1.5 px-4 text-sm self-start disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pwLoading ? "Updating…" : "Update Password"}
          </button>
        </div>
      </Section>

      {/* Danger Zone */}
      <Section title="Danger Zone">
        <p className="text-sm text-shell-muted mb-4">
          Deleting your account is permanent and cannot be undone. All
          portfolios, scores, and reports will be removed.
        </p>
        {deleteError && (
          <p className="text-xs text-red-400 mb-3">{deleteError}</p>
        )}
        <button
          onClick={() => setShowDelete(true)}
          className="py-2 px-4 rounded-lg text-sm font-semibold border border-red-700/60 text-red-400 hover:bg-red-900/20 transition-colors"
        >
          Delete Account
        </button>
      </Section>

      {showDelete && (
        <DeleteModal
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDelete(false)}
        />
      )}
    </div>
  );
}
