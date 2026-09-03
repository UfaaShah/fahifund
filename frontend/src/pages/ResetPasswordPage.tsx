import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, inputClass } from "../components/ui";
import { Wordmark } from "../components/Logo";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const [token, setToken] = useState(params.get("token") || "");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, newPassword });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8f7] px-4 py-10">
      <div className="mb-8">
        <Wordmark size={40} />
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
        {done ? (
          <>
            <h1 className="mb-1 text-xl font-bold text-slate-900">Password updated</h1>
            <p className="mb-6 text-sm text-slate-500">You can now sign in with your new password.</p>
            <Button className="w-full" onClick={() => navigate("/login")}>
              Go to sign in
            </Button>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-xl font-bold text-slate-900">Set a new password</h1>
            <p className="mb-6 text-sm text-slate-500">Paste your reset token and choose a new password.</p>
            <form onSubmit={onSubmit} className="space-y-4">
              {error && <ErrorBanner message={error} />}
              <Field label="Reset token">
                <input className={inputClass} value={token} onChange={(e) => setToken(e.target.value)} required />
              </Field>
              <Field label="New password" hint="At least 6 characters">
                <input
                  className={inputClass}
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </Field>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Saving..." : "Reset password"}
              </Button>
            </form>
          </>
        )}
        <p className="mt-6 text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-brand-600 hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
