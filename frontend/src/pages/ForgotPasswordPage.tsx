import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, SuccessBanner, inputClass } from "../components/ui";
import { Wordmark } from "../components/Logo";

export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; devResetToken?: string }>("/auth/forgot-password", { identifier });
      setDevToken(res.devResetToken || null);
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
        <h1 className="mb-1 text-xl font-bold text-slate-900">Reset your password</h1>
        <p className="mb-6 text-sm text-slate-500">Enter your email or mobile number and we'll send you a reset link.</p>

        {devToken ? (
          <div className="space-y-4">
            <SuccessBanner message="If that account exists, a reset link has been sent." />
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-700 ring-1 ring-amber-100">
              Development mode: no email service is configured, so here is the reset token directly. In production this
              would only be sent by email/SMS.
              <div className="mt-2 break-all rounded-lg bg-white px-2 py-1.5 font-mono text-[11px]">{devToken}</div>
            </div>
            <Button className="w-full" onClick={() => navigate(`/reset-password?token=${devToken}`)}>
              Continue to reset password
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <ErrorBanner message={error} />}
            <Field label="Mobile number or email">
              <input className={inputClass} value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending..." : "Send reset link"}
            </Button>
          </form>
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
