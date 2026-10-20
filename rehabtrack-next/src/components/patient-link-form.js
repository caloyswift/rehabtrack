"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PatientLinkForm({ initialError = "" }) {
  const router = useRouter();
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const patientCode = String(form.get("patientCode") || "").trim().toUpperCase();

    try {
      const supabase = createClient();
      const { error: linkError } = await supabase.rpc("link_current_patient", {
        p_patient_code: patientCode,
      });
      if (linkError) throw linkError;
      setMessage("Your patient record is linked. Loading your care plan…");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The patient record could not be linked.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card workspace-form">
      <h3>Link your patient record</h3>
      <p>Enter the patient code provided by your healthcare worker to see your assigned rehabilitation plan.</p>
      <form onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="patient-link-code">Patient code</label>
          <input id="patient-link-code" name="patientCode" type="text" autoCapitalize="characters" autoComplete="off" placeholder="PAT-XXXXXXXXXX" required />
        </div>
        <button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? "Linking…" : "Link patient record"}</button>
      </form>
      {error && <p className="workspace-feedback workspace-feedback--error" role="alert">{error}</p>}
      {message && <p className="workspace-feedback" role="status" aria-live="polite">{message}</p>}
    </div>
  );
}
