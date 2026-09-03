import { useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Button, ErrorBanner, Field, SuccessBanner, inputClass } from "../components/ui";
import { Wordmark } from "../components/Logo";

export default function ForgotPasswordPage() {
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post<{ success: boolean }>("/auth/forgot-password", { phone });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[#f6f8f7] px-4 py-10">
      <div className="mb-8">
        <Wordmark size={40} />
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-900/5">
        <h1 className="mb-1 text-xl font-bold text-slate-900">Forgot your password?</h1>
        <p className="mb-6 text-sm text-slate-500">
          No link to click — enter your mobile number and we'll let your Super Admin know so they can reset it for you.
        </p>

        {sent ? (
          <div className="space-y-4">
            <SuccessBanner message="Your Super Admin has been notified." />
            <p className="text-xs text-slate-500">
              They'll reset your password back to the app's default password. Once they do, log in again with that
              default password and change it from Profile → Change Password.
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <ErrorBanner message={error} />}
            <Field label="Mobile number">
              <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </Field>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Sending…" : "Notify Super Admin"}
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
