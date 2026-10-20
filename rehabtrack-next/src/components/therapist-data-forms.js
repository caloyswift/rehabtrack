"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Feedback({ error, message }) {
  return <>{error && <p className="workspace-feedback workspace-feedback--error" role="alert">{error}</p>}{message && <p className="workspace-feedback" role="status" aria-live="polite">{message}</p>}</>;
}

function describeRequestError(error, fallback) {
  if (typeof error === "string" && error.trim()) return error;
  const parts = [
    error?.message,
    error?.details,
    error?.hint,
    error?.code ? `Error code: ${error.code}` : "",
  ].filter((part) => typeof part === "string" && part.trim());
  return parts.length ? [...new Set(parts)].join(" ") : fallback;
}

function EmptyState({ children }) {
  return <div className="card empty-state"><p>{children}</p></div>;
}

function FormActions({ busy, onCancel, label }) {
  return <div className="workspace-form-actions"><button className="btn btn--primary btn--sm" type="submit" disabled={busy}>{busy ? "Saving…" : label}</button><button className="btn btn--ghost btn--sm" type="button" onClick={onCancel} disabled={busy}>Cancel</button></div>;
}

export function PatientManager({ therapistId, initialPatients }) {
  const router = useRouter();
  const [patients, setPatients] = useState(initialPatients);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const ageValue = String(form.get("age") || "").trim();
    const patient = {
      therapist_id: therapistId,
      full_name: String(form.get("full_name") || "").trim(),
      age: ageValue ? Number(ageValue) : null,
      contact: String(form.get("contact") || "").trim(),
      emergency_contact: String(form.get("emergency_contact") || "").trim(),
      caregiver_name: String(form.get("caregiver_name") || "").trim(),
    };

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("patients")
        .insert(patient)
        .select("id, patient_code, full_name, age, contact, status")
        .single();
      if (insertError) throw insertError;
      setPatients((current) => [data, ...current]);
      router.refresh();
      setMessage(`${data.full_name} was added. Patient code: ${data.patient_code}.`);
      formElement.reset();
      setFormOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The patient could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-header therapist-section-heading">
        <div><h2 id="patients-heading">My patients</h2><p>Share each patient&apos;s code with them so their account connects to this record and its plans.</p></div>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => { setFormOpen((open) => !open); setError(""); setMessage(""); }} disabled={!therapistId}>＋ Add patient</button>
      </div>
      <Feedback error={error} message={message} />
      {formOpen && <form className="card workspace-form" onSubmit={handleSubmit}>
        <h3>Patient details</h3>
        <div className="workspace-form-grid">
          <div className="form-field"><label htmlFor="patient-name">Full name</label><input id="patient-name" name="full_name" type="text" autoComplete="name" required /></div>
          <div className="form-field"><label htmlFor="patient-age">Age</label><input id="patient-age" name="age" type="number" min="0" max="130" /></div>
          <div className="form-field"><label htmlFor="patient-contact">Contact number</label><input id="patient-contact" name="contact" type="tel" autoComplete="tel" /></div>
          <div className="form-field"><label htmlFor="patient-emergency-contact">Emergency contact</label><input id="patient-emergency-contact" name="emergency_contact" type="text" /></div>
          <div className="form-field"><label htmlFor="patient-caregiver">Caregiver name</label><input id="patient-caregiver" name="caregiver_name" type="text" /></div>
        </div>
        <FormActions busy={busy} label="Save patient" onCancel={() => setFormOpen(false)} />
      </form>}
      {!patients.length ? <EmptyState>You have no patients yet. Add a patient to get started.</EmptyState> :
        <div className="card table-card"><div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">Patient</th><th scope="col">Patient code</th><th scope="col">Age</th><th scope="col">Contact</th><th scope="col">Status</th></tr></thead><tbody>
          {patients.map((patient) => <tr key={patient.id}><td><strong>{patient.full_name}</strong></td><td>{patient.patient_code}</td><td>{patient.age ?? "—"}</td><td>{patient.contact || "—"}</td><td>{patient.status}</td></tr>)}
        </tbody></table></div></div>}
    </>
  );
}

export function ExerciseManager({ therapistId, initialExercises }) {
  const router = useRouter();
  const [exercises, setExercises] = useState(initialExercises);
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const exercise = {
      therapist_id: therapistId,
      name: String(form.get("name") || "").trim(),
      description: String(form.get("description") || "").trim(),
      instructions: String(form.get("instructions") || "").trim(),
      target_repetitions: Number(form.get("target_repetitions") || 0),
      target_duration: Number(form.get("target_duration") || 0),
    };

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("exercises")
        .insert(exercise)
        .select("id, name, description, instructions, target_repetitions, target_duration, active")
        .single();
      if (insertError) throw insertError;
      setExercises((current) => [data, ...current]);
      router.refresh();
      setMessage(`${data.name} was added to your exercise library.`);
      formElement.reset();
      setFormOpen(false);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The exercise could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-header therapist-section-heading">
        <div><h2 id="library-heading">Exercise library</h2><p>Reusable exercises for rehabilitation plans.</p></div>
        <button className="btn btn--secondary btn--sm" type="button" onClick={() => { setFormOpen((open) => !open); setError(""); setMessage(""); }} disabled={!therapistId}>＋ Create exercise</button>
      </div>
      <Feedback error={error} message={message} />
      {formOpen && <form className="card workspace-form" onSubmit={handleSubmit}>
        <h3>Exercise details</h3>
        <div className="workspace-form-grid">
          <div className="form-field"><label htmlFor="exercise-name">Exercise name</label><input id="exercise-name" name="name" type="text" required /></div>
          <div className="form-field"><label htmlFor="exercise-description">Description</label><input id="exercise-description" name="description" type="text" /></div>
          <div className="form-field workspace-form-grid__full"><label htmlFor="exercise-instructions">Instructions</label><textarea id="exercise-instructions" name="instructions" rows="3" required /></div>
          <div className="form-field"><label htmlFor="exercise-repetitions">Target repetitions</label><input id="exercise-repetitions" name="target_repetitions" type="number" min="0" defaultValue="0" required /></div>
          <div className="form-field"><label htmlFor="exercise-duration">Target duration (minutes)</label><input id="exercise-duration" name="target_duration" type="number" min="0" defaultValue="0" required /></div>
        </div>
        <FormActions busy={busy} label="Save exercise" onCancel={() => setFormOpen(false)} />
      </form>}
      {!exercises.length ? <EmptyState>Your exercise library is empty. Create an exercise before assigning a plan.</EmptyState> :
        <div className="card-grid exercise-library-grid">{exercises.map((exercise) => (
          <article className="exercise-library-card" key={exercise.id}>
            <div className="exercise-library-card__heading">
              <h3>{exercise.name}</h3>
              <button className="btn btn--ghost btn--sm exercise-library-toggle" type="button" onClick={() => setSelectedExercise(exercise)}>
                Show more
              </button>
            </div>
          </article>
        ))}</div>}
      {selectedExercise && (
        <div className="exercise-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedExercise(null); }}>
          <section className="exercise-modal" role="dialog" aria-modal="true" aria-labelledby="exercise-modal-title">
            <div className="exercise-modal__header">
              <div><span className="exercise-library-detail__label">Exercise details</span><h3 id="exercise-modal-title">{selectedExercise.name}</h3></div>
              <button className="exercise-modal__close" type="button" aria-label="Close exercise details" onClick={() => setSelectedExercise(null)}>×</button>
            </div>
            <div className="exercise-library-card__details">
              <div className="exercise-library-detail"><span className="exercise-library-detail__label">Description</span><p>{selectedExercise.description || "No description provided."}</p></div>
              <div className="exercise-library-detail"><span className="exercise-library-detail__label">Instructions</span><p>{selectedExercise.instructions || "No instructions provided."}</p></div>
              <div className="exercise-library-targets">
                <div><span className="exercise-library-detail__label">Target repetitions</span><strong>{selectedExercise.target_repetitions}</strong></div>
                <div><span className="exercise-library-detail__label">Target duration</span><strong>{selectedExercise.target_duration} min</strong></div>
              </div>
              {selectedExercise.active !== undefined && <span className={`exercise-library-status${selectedExercise.active ? " is-active" : ""}`}>{selectedExercise.active ? "Active" : "Inactive"}</span>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

export function PlanManager({ therapistId, patients, exercises, initialPlans }) {
  const router = useRouter();
  const [plans, setPlans] = useState(initialPlans);
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canCreatePlan = Boolean(therapistId && patients.length && exercises.length);

  async function handleSubmit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const scheduledDays = form.getAll("scheduled_days").map(String);
    if (!scheduledDays.length) {
      setError("Choose at least one scheduled day.");
      setBusy(false);
      return;
    }
    const plan = {
      patient_id: String(form.get("patient_id") || ""),
      exercise_id: String(form.get("exercise_id") || ""),
      created_by: therapistId,
      scheduled_days: scheduledDays,
      scheduled_time: String(form.get("scheduled_time") || ""),
      target_repetitions: Number(form.get("target_repetitions") || 0),
      target_duration: Number(form.get("target_duration") || 0),
      active: true,
    };

    try {
      const supabase = createClient();
      const { data, error: insertError } = await supabase
        .from("rehabilitation_plans")
        .insert(plan)
        .select("id, scheduled_days, scheduled_time, target_repetitions, target_duration, active, patient:patients(full_name, patient_code), exercise:exercises(name)")
        .single();
      if (insertError) throw insertError;
      setPlans((current) => [data, ...current]);
      router.refresh();
      setMessage("The rehabilitation plan was assigned.");
      formElement.reset();
      setFormOpen(false);
    } catch (requestError) {
      setError(describeRequestError(requestError, "The plan could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="section-header therapist-section-heading">
        <div><h2 id="plans-heading">Rehabilitation plans</h2><p>Plans for your linked patients.</p></div>
        <button className="btn btn--primary btn--sm" type="button" onClick={() => { setFormOpen((open) => !open); setError(""); setMessage(""); }} disabled={!canCreatePlan} title={canCreatePlan ? undefined : "Add a patient and an exercise first"}>＋ Assign exercise</button>
      </div>
      {!canCreatePlan && <p className="form-hint">Add a patient and at least one exercise before assigning a plan.</p>}
      <Feedback error={error} message={message} />
      {formOpen && <form className="card workspace-form" onSubmit={handleSubmit}>
        <h3>Assign an exercise</h3>
        <div className="workspace-form-grid">
          <div className="form-field"><label htmlFor="plan-patient">Patient</label><select id="plan-patient" name="patient_id" required defaultValue=""><option value="" disabled>Select a patient</option>{patients.map((patient) => <option value={patient.id} key={patient.id}>{patient.full_name} · {patient.patient_code}</option>)}</select></div>
          <div className="form-field"><label htmlFor="plan-exercise">Exercise</label><select id="plan-exercise" name="exercise_id" required defaultValue=""><option value="" disabled>Select an exercise</option>{exercises.map((exercise) => <option value={exercise.id} key={exercise.id}>{exercise.name}</option>)}</select></div>
          <fieldset className="workspace-days"><legend>Scheduled days</legend>{DAYS.map((day) => <label className="workspace-day" key={day}><input type="checkbox" name="scheduled_days" value={day} />{day.slice(0, 3)}</label>)}</fieldset>
          <div className="form-field"><label htmlFor="plan-time">Scheduled time</label><input id="plan-time" name="scheduled_time" type="time" required /></div>
          <div className="form-field"><label htmlFor="plan-repetitions">Target repetitions</label><input id="plan-repetitions" name="target_repetitions" type="number" min="0" defaultValue="0" required /></div>
          <div className="form-field"><label htmlFor="plan-duration">Target duration (minutes)</label><input id="plan-duration" name="target_duration" type="number" min="0" defaultValue="0" required /></div>
        </div>
        <FormActions busy={busy} label="Save plan" onCancel={() => setFormOpen(false)} />
      </form>}
      {!plans.length ? <EmptyState>You have no rehabilitation plans yet.</EmptyState> :
        <div className="card-grid workspace-list">{plans.map((plan) => <article className="card" key={plan.id}><p className="workspace-meta">{plan.patient?.full_name || "Patient"} · {plan.patient?.patient_code || ""}</p><h3>{plan.exercise?.name || "Exercise"}</h3><p>{plan.scheduled_days.join(", ")} at {plan.scheduled_time.slice(0, 5)}</p><p>{plan.target_repetitions} repetitions · {plan.target_duration} minutes</p></article>)}</div>}
    </>
  );
}
