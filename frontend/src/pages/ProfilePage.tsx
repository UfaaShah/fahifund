import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/AuthContext";
import { api, ApiError } from "../lib/api";
import { Avatar, Button, Card, ErrorBanner, Field, SectionTitle, SuccessBanner, inputClass } from "../components/ui";
import { LogoutIcon } from "../components/icons";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile", user!.id],
    queryFn: () => api.get<any>(`/users/${user!.id}`),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Avatar name={user!.name} photoUrl={user!.photoUrl} size={56} />
        <div>
          <h1 className="text-lg font-bold text-slate-900">{user!.name}</h1>
          <p className="text-sm text-slate-500">{profile?.memberCode} · {user!.role.replace("_", " ")}</p>
        </div>
      </div>

      <Card className="grid grid-cols-1 gap-3 p-4 text-sm">
        <Row label="Email" value={user!.email || "Not set"} />
        <Row label="Mobile" value={user!.phone} />
      </Card>

      <BankAccountForm
        key={profile ? "loaded" : "loading"}
        userId={user!.id}
        initial={profile?.bankAccount}
        onSaved={() => qc.invalidateQueries({ queryKey: ["profile", user!.id] })}
      />

      <ChangePasswordForm />

      <Button
        variant="secondary"
        className="w-full"
        onClick={() => {
          logout();
          navigate("/login");
        }}
      >
        <LogoutIcon width={18} height={18} /> Log out
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 last:pb-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

function BankAccountForm({ userId, initial, onSaved }: { userId: string; initial: any; onSaved: () => void }) {
  const [bankName, setBankName] = useState(initial?.bankName || "");
  const [accountName, setAccountName] = useState(initial?.accountName || "");
  const [accountNumber, setAccountNumber] = useState(initial?.accountNumber || "");
  const [branch, setBranch] = useState(initial?.branch || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.put(`/users/${userId}/bank-account`, { bankName, accountName, accountNumber, branch: branch || undefined });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save bank account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionTitle>Bank Account</SectionTitle>
      <p className="mb-3 -mt-2 text-xs text-slate-400">Used when you collect contributions as Admin or receive a payout.</p>
      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
      {saved && <div className="mb-3"><SuccessBanner message="Bank account saved." /></div>}
      <form onSubmit={save} className="space-y-3">
        <Field label="Bank name">
          <input className={inputClass} value={bankName} onChange={(e) => setBankName(e.target.value)} required />
        </Field>
        <Field label="Account holder name">
          <input className={inputClass} value={accountName} onChange={(e) => setAccountName(e.target.value)} required />
        </Field>
        <Field label="Account number">
          <input className={inputClass} value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} required />
        </Field>
        <Field label="Branch" hint="Optional">
          <input className={inputClass} value={branch} onChange={(e) => setBranch(e.target.value)} />
        </Field>
        <Button type="submit" disabled={saving} variant="secondary" className="w-full">
          {saving ? "Saving…" : "Save Bank Account"}
        </Button>
      </form>
    </Card>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api.post("/auth/change-password", { currentPassword, newPassword });
      setSaved(true);
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <SectionTitle>Change Password</SectionTitle>
      {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
      {saved && <div className="mb-3"><SuccessBanner message="Password changed." /></div>}
      <form onSubmit={save} className="space-y-3">
        <Field label="Current password">
          <input className={inputClass} type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
        </Field>
        <Field label="New password" hint="At least 6 characters">
          <input className={inputClass} type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} required />
        </Field>
        <Button type="submit" disabled={saving} variant="secondary" className="w-full">
          {saving ? "Saving…" : "Change Password"}
        </Button>
      </form>
    </Card>
  );
}
