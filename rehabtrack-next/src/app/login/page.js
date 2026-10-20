"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function Brand() {
  return <Link className="brand" href="/" aria-label="RehabTrack home"><span className="brand-mark" aria-hidden="true">R</span>RehabTrack</Link>;
}

const demoAccounts = {
  patient: {
    email: process.env.NEXT_PUBLIC_DEMO_PATIENT_EMAIL,
    password: process.env.NEXT_PUBLIC_DEMO_PATIENT_PASSWORD,
  },
  therapist: {
    email: process.env.NEXT_PUBLIC_DEMO_THERAPIST_EMAIL,
    password: process.env.NEXT_PUBLIC_DEMO_THERAPIST_PASSWORD,
  },
};
const demoLoginEnabled = process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_DEMO_LOGIN_ENABLED === "true" &&
  Object.values(demoAccounts).every((account) => account.email && account.password);

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState("login");
  const [role, setRole] = useState("patient");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [signupEmail, setSignupEmail] = useState("");
  const [signupRole, setSignupRole] = useState("patient");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "register") setMode("register");
    if (params.get("error") === "profile") {
      setError("Your sign-in worked, but your RehabTrack profile is missing. Ask the Supabase project owner to check the setup.");
    }
    if (params.get("error") === "confirmation") {
      setError("That confirmation link could not be verified. Request a new link and try again.");
    }
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");

    try {
      const supabase = createClient();

      if (mode === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
        });
        if (resetError) throw resetError;
        setMessage("If an account exists for that email, a password reset link is on its way.");
        return;
      }

      if (mode === "register") {
        const fullName = String(form.get("fullName") || "").trim();
        const patientCode = String(form.get("patientCode") || "").trim().toUpperCase();
        if (role === "patient" && !patientCode) {
          throw new Error("Enter the patient code provided by your healthcare worker.");
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName, role, ...(role === "patient" ? { patient_code: patientCode } : {}) },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/${role}`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          let destination = role === "therapist" ? "/therapist" : "/patient";
          if (role === "patient") {
            const { error: linkError } = await supabase.rpc("link_current_patient", { p_patient_code: patientCode });
            if (linkError) destination = "/patient?link=failed";
          }
          router.replace(destination);
          router.refresh();
        } else {
          setSignupEmail(email);
          setSignupRole(role);
          setMode("check-email");
        }
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (profileError || !profile) throw new Error("Your account has no RehabTrack profile yet. Ask the Supabase project owner to check the database migration.");

      router.replace(profile.role === "therapist" ? "/therapist" : "/patient");
      router.refresh();
    } catch (requestError) {
      const detail = requestError instanceof Error ? requestError.message : "Please try again.";
      if (detail.includes("not configured")) {
        setError("Supabase is not configured yet. Copy .env.example to .env.local, add your project URL and publishable key, then restart the dev server.");
      } else {
        setError(detail);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleResendConfirmation() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { error: resendError } = await supabase.auth.resend({
        type: "signup",
        email: signupEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=/${signupRole}` },
      });
      if (resendError) throw resendError;
      setMessage("If this account can receive a new confirmation link, it has been sent.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The confirmation email could not be resent.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoLogin(demoRole) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword(demoAccounts[demoRole]);
      if (signInError) throw signInError;

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();
      if (profileError || profile?.role !== demoRole) {
        await supabase.auth.signOut();
        throw new Error("The demo account is not seeded correctly. Run the demo setup command and try again.");
      }

      router.replace(demoRole === "therapist" ? "/therapist" : "/patient");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The demo account could not be opened.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "check-email") {
    return (
      <main className="auth-page">
        <section className="auth-card auth-card--standalone" aria-labelledby="confirmation-title">
          <Brand />
          <h1 id="confirmation-title" className="auth-title">Check your email</h1>
          <p>We sent a confirmation link to <strong>{signupEmail}</strong>.</p>
          <p>Open the link to confirm your account. You’ll then be taken to your {signupRole === "therapist" ? "healthcare worker" : "patient"} dashboard.</p>
          {signupRole === "patient" && <p>Your account will be linked to the patient record using the code you entered.</p>}
          <button type="button" className="btn btn--primary btn--block" onClick={handleResendConfirmation} disabled={busy}>
            {busy ? "Sending…" : "Resend confirmation email"}
          </button>
          <Link className="btn btn--ghost btn--block auth-home-link" href="/">Back to home</Link>
          {error && <p className="auth-feedback auth-feedback--error" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status" aria-live="polite">{message}</p>}
          <p className="auth-switch"><button type="button" className="text-button" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Return to log in</button></p>
        </section>
      </main>
    );
  }

  const isRegister = mode === "register";
  const isForgot = mode === "forgot";

  return (
    <main className="auth-page">
      <div className="auth-layout">
        <section className="auth-card" aria-labelledby="auth-title">
          <Brand />
          <form onSubmit={handleSubmit}>
            <h1 id="auth-title" className="auth-title">
              {isRegister ? "Create your account" : isForgot ? "Reset your password" : "Welcome back"}
            </h1>

            {isRegister && (
              <>
                <div className="role-toggle" role="group" aria-label="Choose account type">
                  <button type="button" aria-pressed={role === "therapist"} onClick={() => setRole("therapist")}>Healthcare Worker</button>
                  <button type="button" aria-pressed={role === "patient"} onClick={() => setRole("patient")}>Patient / Caregiver</button>
                </div>
                <div className="form-field">
                  <label htmlFor="fullName">Full name</label>
                  <input id="fullName" name="fullName" type="text" autoComplete="name" required />
                </div>
                {role === "patient" && <div className="form-field"><label htmlFor="patientCode">Patient code</label><input id="patientCode" name="patientCode" type="text" autoCapitalize="characters" autoComplete="off" placeholder="PAT-XXXXXXXXXX" required /><p className="form-hint">Enter the code your healthcare worker gave you. It links your account to the correct patient record.</p></div>}
                <p className="form-hint form-hint--spaced">Choose the workspace that matches your role. Healthcare worker registration is self-declared and is not verified.</p>
              </>
            )}

            <div className="form-field">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            {!isForgot && (
              <div className="form-field">
                <label htmlFor="password">Password</label>
                <div className="password-field">
                  <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isRegister ? "new-password" : "current-password"} minLength={6} required />
                  <button className="password-toggle" type="button" aria-pressed={showPassword} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "Hide" : "Show"}</button>
                </div>
                {isRegister && <p className="form-hint">Use at least 6 characters.</p>}
              </div>
            )}

            {mode === "login" && <div className="auth-links"><span /><button type="button" className="text-button" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot password?</button></div>}

            <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
              {busy ? "Please wait…" : isRegister ? "Create account" : isForgot ? "Send reset link" : "Log in"}
            </button>
            <p className="auth-switch">
              {isForgot ? "Remembered your password? " : isRegister ? "Already have an account? " : "Don't have an account? "}
              <button type="button" className="text-button" onClick={() => { setMode(isForgot ? "login" : isRegister ? "login" : "register"); setError(""); setMessage(""); }}>
                {isForgot || isRegister ? "Log in" : "Create one"}
              </button>
            </p>
          </form>
          {mode === "login" && demoLoginEnabled && (
            <div className="demo-access" aria-label="Demo accounts">
              <p>Testing RehabTrack? Open a sample account:</p>
              <div className="demo-access__buttons">
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => handleDemoLogin("patient")} disabled={busy}>Demo patient</button>
                <button className="btn btn--ghost btn--sm" type="button" onClick={() => handleDemoLogin("therapist")} disabled={busy}>Demo healthcare worker</button>
              </div>
            </div>
          )}
          <Link className="btn btn--ghost btn--block auth-home-link" href="/">Back to home</Link>

          {error && <p className="auth-feedback auth-feedback--error" role="alert">{error}</p>}
          {message && <p className="auth-feedback" role="status" aria-live="polite">{message}</p>}
        </section>

        <aside className="auth-visual" aria-label="Caregiver supporting a wheelchair user outdoors">
          <Image src="/assets/images/hero2.jpg" alt="A caregiver spending time with a wheelchair user outdoors" width={900} height={1200} priority />
          <div className="auth-visual__content"><p className="auth-visual__eyebrow">RehabTrack</p><h2>Progress is better when it is shared.</h2><p>Stay connected to rehabilitation plans, activity updates, and the care team.</p></div>
        </aside>
      </div>
    </main>
  );
}
