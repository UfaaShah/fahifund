import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../lib/AuthContext";
import { useUsers } from "../../lib/queries";
import { api, ApiError } from "../../lib/api";
import { Avatar, Button, Card, ErrorBanner, Field, LoadingScreen, SectionTitle, StatusBadge, inputClass } from "../../components/ui";
import { PlusIcon, EditIcon, TrashIcon, KeyIcon } from "../../components/icons";

type BulkRow = { name: string; phone: string; email: string | null; lineNumber: number };
type BulkResult = {
  createdCount: number;
  errors: { row: number; name?: string; error: string }[];
};

// "Name, Phone" or "Name, Phone, Email" — one member per line. Tabs work too, since a lot of
// people paste this straight out of a spreadsheet column. Every non-blank line is sent to the
// API (even one missing a name/phone) so the server's validation message and the original
// pasted line number both survive — no separate client-side "skipped" bucket to keep in sync.
function parseBulkText(text: string): BulkRow[] {
  const rows: BulkRow[] = [];
  text.split("\n").forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) return;
    const parts = line.split(/[,\t]/).map((p) => p.trim());
    const [name, phone, email] = parts;
    rows.push({ name: name || "", phone: phone || "", email: email || null, lineNumber: idx + 1 });
  });
  return rows;
}

export default function GlobalMembersPage() {
  const { data: users, isLoading } = useUsers();
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"single" | "bulk">("single");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; tempPassword: string } | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetResult, setResetResult] = useState<{ name: string; tempPassword: string } | null>(null);
  const [resetSaving, setResetSaving] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [bulkText, setBulkText] = useState("");

  async function createMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ user: any; tempPassword: string }>("/users", {
        name,
        phone,
        email: email.trim() || null,
        nationalId: nationalId || undefined,
      });
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreated({ name: res.user.name, tempPassword: res.tempPassword });
      setBulkResult(null);
      setName("");
      setEmail("");
      setPhone("");
      setNationalId("");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add member");
    } finally {
      setSubmitting(false);
    }
  }

  async function createMembersBulk(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const rows = parseBulkText(bulkText);
    if (rows.length === 0) {
      setError('Paste at least one line as "Name, Phone" (email is optional).');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{
        created: any[];
        errors: { row: number; name?: string; error: string }[];
      }>("/users/bulk", { members: rows.map(({ name, phone, email }) => ({ name, phone, email })) });
      qc.invalidateQueries({ queryKey: ["users"] });
      // The API's "row" is the 1-indexed position within what we sent — map it back to the
      // pasted text's actual line number so the summary matches what the user typed.
      const errors = res.errors.map((e) => ({ ...e, row: rows[e.row - 1]?.lineNumber ?? e.row }));
      setBulkResult({ createdCount: res.created.length, errors });
      setCreated(null);
      if (res.created.length > 0) {
        setBulkText("");
        setShowForm(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add members");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleStatus(userId: string, status: string) {
    const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    await api.patch(`/users/${userId}/status`, { status: next });
    qc.invalidateQueries({ queryKey: ["users"] });
  }

  async function resetPassword(userId: string, name: string) {
    setError(null);
    setResetSaving(true);
    try {
      const res = await api.post<{ tempPassword: string }>(`/users/${userId}/reset-password`, {});
      setResetResult({ name, tempPassword: res.tempPassword });
      setCreated(null);
      setBulkResult(null);
      setResettingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to reset password");
    } finally {
      setResetSaving(false);
    }
  }

  async function deleteMember(userId: string) {
    setError(null);
    try {
      await api.delete(`/users/${userId}`);
      qc.invalidateQueries({ queryKey: ["users"] });
      setDeletingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to delete member");
      setDeletingId(null);
    }
  }

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Members</h1>
        <Button onClick={() => setShowForm((s) => !s)} className="text-sm">
          <PlusIcon width={16} height={16} /> Add Member
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}
      {created && (
        <Card className="border border-brand-100 p-4">
          <p className="text-sm font-semibold text-brand-700">{created.name} was added</p>
          <p className="mt-1 text-xs text-slate-500">
            Temporary password (share securely, they should change it after first login):
          </p>
          <div className="mt-1 inline-block rounded-lg bg-slate-50 px-2 py-1 font-mono text-xs">{created.tempPassword}</div>
        </Card>
      )}
      {resetResult && (
        <Card className="border border-amber-100 p-4">
          <p className="text-sm font-semibold text-amber-700">{resetResult.name}'s password was reset</p>
          <p className="mt-1 text-xs text-slate-500">Default password (share securely, ask them to change it after logging in):</p>
          <div className="mt-1 inline-block rounded-lg bg-slate-50 px-2 py-1 font-mono text-xs">{resetResult.tempPassword}</div>
        </Card>
      )}
      {bulkResult && (
        <Card className="border border-brand-100 p-4">
          <p className="text-sm font-semibold text-brand-700">
            {bulkResult.createdCount} member{bulkResult.createdCount === 1 ? "" : "s"} added
          </p>
          {bulkResult.createdCount > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Everyone starts with the default password{" "}
              <span className="rounded bg-slate-50 px-1.5 py-0.5 font-mono">welcome123</span> — ask them to change it after
              first login.
            </p>
          )}
          {bulkResult.errors.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-slate-100 pt-2">
              <p className="text-xs font-semibold text-amber-700">Skipped:</p>
              {bulkResult.errors.map((e, i) => (
                <p key={i} className="text-xs text-amber-700">
                  {e.row > 0 ? `Line ${e.row}${e.name ? ` (${e.name})` : ""}: ` : ""}
                  {e.error}
                </p>
              ))}
            </div>
          )}
        </Card>
      )}

      {showForm && (
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>New member</SectionTitle>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-medium">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={`rounded-md px-2.5 py-1 ${mode === "single" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                One at a time
              </button>
              <button
                type="button"
                onClick={() => setMode("bulk")}
                className={`rounded-md px-2.5 py-1 ${mode === "bulk" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
              >
                Paste a list
              </button>
            </div>
          </div>

          {mode === "single" ? (
            <form onSubmit={createMember} className="space-y-3">
              <Field label="Full name">
                <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Mobile number">
                <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Email" hint="Optional">
                  <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </Field>
                <Field label="National ID" hint="Optional">
                  <input className={inputClass} value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
                </Field>
              </div>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Adding…" : "Add Member"}
              </Button>
            </form>
          ) : (
            <form onSubmit={createMembersBulk} className="space-y-3">
              <Field label="One member per line: Name, Phone, Email (email optional)">
                <textarea
                  className={`${inputClass} h-40 font-mono text-xs`}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={"Ali Waheed, +9607700002\nHassan Ibrahim, +9607700003, hassan@example.com\nIbrahim Adam, +9607700004"}
                />
              </Field>
              <p className="text-xs text-slate-400">
                Everyone gets the default password <span className="font-mono">welcome123</span>. Rows with a missing
                name/phone, a duplicate, or a bad email are skipped and listed after — the rest still get added.
              </p>
              <Button type="submit" disabled={submitting} className="w-full">
                {submitting ? "Adding…" : "Add Members"}
              </Button>
            </form>
          )}
        </Card>
      )}

      <Card className="divide-y divide-slate-100">
        {users?.map((u) => (
          <div key={u.id}>
            <div className="flex items-start gap-3 p-4">
              <Avatar name={u.name} photoUrl={u.photoUrl} size={36} />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div>
                  <p className="truncate text-sm font-semibold text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">
                    {u.memberCode} · {u.role.replace("_", " ")}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <StatusBadge status={u.status} />
                  {u.role !== "SUPER_ADMIN" && (
                    <button onClick={() => toggleStatus(u.id, u.status)} className="ml-1 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
                      {u.status === "ACTIVE" ? "Suspend" : "Activate"}
                    </button>
                  )}
                  <button
                    onClick={() => setResettingId(resettingId === u.id ? null : u.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-amber-50 hover:text-amber-600"
                    title="Reset password"
                  >
                    <KeyIcon width={16} height={16} />
                  </button>
                  <button
                    onClick={() => setEditingId(editingId === u.id ? null : u.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-700"
                    title="Edit"
                  >
                    <EditIcon width={16} height={16} />
                  </button>
                  {u.id !== me?.id && (
                    <button
                      onClick={() => setDeletingId(deletingId === u.id ? null : u.id)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      title="Delete"
                    >
                      <TrashIcon width={16} height={16} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {resettingId === u.id && (
              <div className="space-y-2 border-t border-amber-100 bg-amber-50/50 p-4">
                <p className="text-sm text-amber-800">
                  Reset <span className="font-semibold">{u.name}</span>'s password back to the default password? They'll
                  need to log in with it and change it afterwards.
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setResettingId(null)}>
                    Never mind
                  </Button>
                  <Button disabled={resetSaving} onClick={() => resetPassword(u.id, u.name)}>
                    {resetSaving ? "Resetting…" : "Yes, reset password"}
                  </Button>
                </div>
              </div>
            )}

            {editingId === u.id && (
              <EditMemberForm
                user={u}
                onDone={() => setEditingId(null)}
                onSaved={() => {
                  qc.invalidateQueries({ queryKey: ["users"] });
                  setEditingId(null);
                }}
                onError={setError}
              />
            )}

            {deletingId === u.id && (
              <div className="space-y-2 border-t border-rose-100 bg-rose-50/50 p-4">
                <p className="text-sm text-rose-700">
                  Permanently delete <span className="font-semibold">{u.name}</span>'s account? This can't be undone.
                  {u.role !== "USER" || u.status !== "ACTIVE" ? "" : " If they've ever been part of a fund, this will be blocked automatically — suspend instead to preserve records."}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setDeletingId(null)}>
                    Never mind
                  </Button>
                  <Button variant="danger" onClick={() => deleteMember(u.id)}>
                    Yes, delete permanently
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}

function EditMemberForm({
  user,
  onDone,
  onSaved,
  onError,
}: {
  user: any;
  onDone: () => void;
  onSaved: () => void;
  onError: (m: string) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email || "");
  const [phone, setPhone] = useState(user.phone);
  const [nationalId, setNationalId] = useState(user.nationalId || "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      await api.patch(`/users/${user.id}`, {
        name,
        phone,
        email: email.trim() || null,
        nationalId: nationalId || undefined,
      });
      onSaved();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : "Failed to update member");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 border-t border-slate-100 bg-slate-50/60 p-4">
      <Field label="Full name">
        <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
      </Field>
      <Field label="Mobile number">
        <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email" hint="Optional">
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="National ID" hint="Optional">
          <input className={inputClass} value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
