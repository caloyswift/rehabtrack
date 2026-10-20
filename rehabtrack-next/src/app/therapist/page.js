import { Suspense } from "react";
import { connection } from "next/server";
import DashboardShell from "@/components/dashboard-shell";
import { requireProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { ExerciseManager, PatientManager, PlanManager } from "@/components/therapist-data-forms";

const navItems = [
  { id: "overview", icon: "⌂", label: "Overview" },
  { id: "patients", icon: "♙", label: "My patients" },
  { id: "exercises", icon: "↗", label: "Exercise library" },
  { id: "plans", icon: "▤", label: "Rehabilitation plans" },
  { id: "activity", icon: "▥", label: "Recent activity" },
];

async function TherapistDashboardContent() {
  await connection();
  const profile = await requireProfile("therapist");
  const displayName = profile?.full_name || "Healthcare worker";
  let patients = [];
  let exercises = [];
  let plans = [];
  let loadError = "";

  if (profile) {
    const supabase = await createClient();
    const [patientResult, exerciseResult, planResult] = await Promise.all([
      supabase.from("patients").select("id, patient_code, full_name, age, contact, status").order("created_at", { ascending: false }),
      supabase.from("exercises").select("id, name, description, instructions, target_repetitions, target_duration, active").eq("therapist_id", profile.id).order("created_at", { ascending: false }),
      supabase.from("rehabilitation_plans").select("id, scheduled_days, scheduled_time, target_repetitions, target_duration, active, patient:patients(full_name, patient_code), exercise:exercises(name)").order("created_at", { ascending: false }),
    ]);
    patients = patientResult.data || [];
    exercises = exerciseResult.data || [];
    plans = planResult.data || [];
    const failedQuery = [patientResult, exerciseResult, planResult].find((result) => result.error);
    if (failedQuery) loadError = failedQuery.error.message;
  }

  return (
    <DashboardShell
      authenticated={Boolean(profile)}
      displayName={displayName}
      eyebrow="HEALTHCARE WORKER SPACE"
      intro="Welcome"
      summary="Manage your patients and rehabilitation plans."
      roleLabel="Healthcare worker"
      navItems={navItems}
      panes={{
        overview: <section id="overview" className="section" aria-labelledby="overview-heading"><div className="section-header"><div><h2 id="overview-heading">Practice overview</h2><p>Your workspace summary.</p></div></div>{loadError && <p className="workspace-feedback workspace-feedback--error" role="alert">Could not load your data: {loadError}</p>}<div className="card-grid therapist-stats"><div className="stat-card"><span className="stat-value">{patients.filter((patient) => patient.status === "active").length}</span><span className="stat-label">Active patients</span></div><div className="stat-card stat-card--blue"><span className="stat-value">{exercises.filter((exercise) => exercise.active).length}</span><span className="stat-label">Active exercises</span></div><div className="stat-card stat-card--success"><span className="stat-value">{plans.filter((plan) => plan.active).length}</span><span className="stat-label">Active plans</span></div></div></section>,
        patients: <section id="patients" className="section" aria-labelledby="patients-heading"><PatientManager therapistId={profile?.id} initialPatients={patients} /></section>,
        exercises: <section id="exercises" className="section" aria-labelledby="library-heading"><ExerciseManager therapistId={profile?.id} initialExercises={exercises} /></section>,
        plans: <section id="plans" className="section" aria-labelledby="plans-heading"><PlanManager therapistId={profile?.id} patients={patients} exercises={exercises} initialPlans={plans} /></section>,
        activity: <section id="activity" className="section" aria-labelledby="activity-heading"><div className="section-header"><div><h2 id="activity-heading">Recent activity</h2><p>Updates from your patients&apos; rehabilitation logs.</p></div></div><div className="card empty-state"><p>There is no patient activity to show yet.</p></div></section>,
      }}
    />
  );
}

export default function TherapistDashboard() {
  return (
    <Suspense fallback={<div className="container dashboard-container" aria-busy="true"><div className="card empty-state"><p>Loading your healthcare worker dashboard…</p></div></div>}>
      <TherapistDashboardContent />
    </Suspense>
  );
}
