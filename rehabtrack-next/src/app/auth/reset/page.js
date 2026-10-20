"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password !== confirmation) {
      setBusy(false);
      setError("The passwords do not match.");
      return;
    }

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Your password has been updated. You can now sign in.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The password could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card reset-card" aria-labelledby="reset-heading">
        <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">R</span>RehabTrack</Link>
        <h1 id="reset-heading" className="auth-title">Choose a new password</h1>
        <form onSubmit={handleSubmit}>
          <div className="form-field"><label htmlFor="password">New password</label><input id="password" name="password" type="password" autoComplete="new-password" minLength={6} required /></div>
          <div className="form-field"><label htmlFor="confirmation">Confirm new password</label><input id="confirmation" name="confirmation" type="password" autoComplete="new-password" minLength={6} required /></div>
          <button className="btn btn--primary btn--block" disabled={busy}>{busy ? "Updating…" : "Update password"}</button>
        </form>
        {error && <p className="auth-feedback auth-feedback--error" role="alert">{error}</p>}
        {message && <p className="auth-feedback" role="status">{message} <Link href="/login">Log in</Link></p>}
      </section>
    </main>
  );
}
