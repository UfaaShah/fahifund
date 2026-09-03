import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUsers } from "../../lib/queries";
import { api, ApiError } from "../../lib/api";
import { Avatar, Button, Card, ErrorBanner, Field, LoadingScreen, SectionTitle, StatusBadge, inputClass } from "../../components/ui";
import { PlusIcon } from "../../components/icons";

export default function GlobalMembersPage() {
  const { data: users, isLoading } = useUsers();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; tempPassword: string } | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function createMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.post<{ user: any; tempPassword: string }>("/users", { name, email, phone, nationalId: nationalId || undefined });
      qc.invalidateQueries({ queryKey: ["users"] });
      setCreated({ name: res.user.name, tempPassword: res.tempPassword });
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

  async function toggleStatus(userId: string, status: string) {
    const next = status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
    await api.patch(`/users/${userId}/status`, { status: next });
    qc.invalidateQueries({ queryKey: ["users"] });
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

      {showForm && (
        <Card className="p-5">
          <SectionTitle>New member</SectionTitle>
          <form onSubmit={createMember} className="space-y-3">
            <Field label="Full name">
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mobile number">
                <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </Field>
              <Field label="Email">
                <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </Field>
            </div>
            <Field label="National ID" hint="Optional">
              <input className={inputClass} value={nationalId} onChange={(e) => setNationalId(e.target.value)} />
            </Field>
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? "Adding…" : "Add Member"}
            </Button>
          </form>
        </Card>
      )}

      <Card className="divide-y divide-slate-100">
        {users?.map((u) => (
          <div key={u.id} className="flex items-center gap-3 p-4">
            <Avatar name={u.name} photoUrl={u.photoUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{u.name}</p>
              <p className="text-xs text-slate-500">
                {u.memberCode} · {u.role.replace("_", " ")}
              </p>
            </div>
            <StatusBadge status={u.status} />
            {u.role !== "SUPER_ADMIN" && (
              <button onClick={() => toggleStatus(u.id, u.status)} className="ml-2 text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
                {u.status === "ACTIVE" ? "Suspend" : "Activate"}
              </button>
            )}
          </div>
        ))}
      </Card>
    </div>
  );
}
