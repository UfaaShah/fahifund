import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, inputClass } from "../components/ui";
import { Wordmark } from "../components/Logo";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
      navigate("/app");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Unable to sign in right now");
    } finally {
      setLoading(false);
    }
  }

  function fillDemo(id: string) {
    setIdentifier(id);
    setPassword("Demo@1234");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8f7] px-4 py-10">
      <div className="mb-8">
        <Wordmark size={40} />
        <p className="mt-1 text-center text-sm text-slate-500">Save Together. Receive in Order.</p>
      </div>

      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Welcome back</h1>
        <p className="mb-6 text-sm text-slate-500">Sign in to your Fahi Fund account.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorBanner message={error} />}
          <Field label="Mobile number or email">
            <input
              className={inputClass}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password">
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </Field>
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm font-medium text-brand-600 hover:underline">
              Forgot password?
            </Link>
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>

      <div className="mt-6 w-full max-w-sm rounded-2xl bg-white/60 p-4 ring-1 ring-slate-900/5">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Demo accounts</p>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => fillDemo("superadmin@fahifund.test")} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
            Super Admin
          </button>
          <button onClick={() => fillDemo("ahmed.shah@fahifund.test")} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
            Admin
          </button>
          <button onClick={() => fillDemo("hassan.ibrahim@fahifund.test")} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200">
            Member
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Tap a role to fill the form, password: Demo@1234</p>
      </div>
    </div>
  );
}
