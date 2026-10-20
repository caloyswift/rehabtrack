import { Suspense } from "react";
import { connection } from "next/server";
import PatientDashboardWorkspace from "@/components/patient-dashboard-workspace";
import PatientLinkForm from "@/components/patient-link-form";
import { requireProfile } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

async function PatientDashboardContent({ searchParams }) {
  await connection();
  const profile = await requireProfile("patient");
  const params = await searchParams;
  let patient = null;
  let plans = [];
  let records = [];
  let conditionLogs = [];
  let notifications = [];
  let loadError = "";

  if (profile) {
    const supabase = await createClient();
    const { data: patientData, error: patientError } = await supabase
      .from("patients")
      .select("id, patient_code, full_name, age, caregiver_name")
      .eq("linked_user_id", profile.id)
      .maybeSingle();
    patient = patientData;
    if (patientError) loadError = patientError.message;

    if (patient) {
      const [planResult, recordResult, conditionResult, notificationResult] = await Promise.all([
        supabase.from("rehabilitation_plans")
          .select("id, scheduled_days, scheduled_time, target_repetitions, target_duration, active, exercise:exercises(id, name, description, instructions, image_url, video_url)")
          .eq("patient_id", patient.id).eq("active", true).order("scheduled_time", { ascending: true }),
        supabase.from("exercise_records")
          .select("id, plan_id, exercise_id, status, repetitions, duration, notes, difficulty, recorded_as, completed_at")
          .eq("patient_id", patient.id).order("completed_at", { ascending: false }).limit(300),
        supabase.from("condition_logs")
          .select("id, feeling, notes, recorded_as, created_at")
          .eq("patient_id", patient.id).order("created_at", { ascending: false }).limit(30),
        supabase.from("notifications")
          .select("id, type, title, message, read_at, created_at")
          .eq("patient_id", patient.id).order("created_at", { ascending: false }).limit(50),
      ]);
      plans = planResult.data || [];
      records = recordResult.data || [];
      conditionLogs = conditionResult.data || [];
      notifications = notificationResult.data || [];
      const failedQuery = [planResult, recordResult, conditionResult, notificationResult].find((result) => result.error);
      if (failedQuery && !loadError) loadError = failedQuery.error.message;
    }
  }

  const linkForm = profile && !patient
    ? <PatientLinkForm initialError={params?.link === "failed" ? "We couldn't link that patient code. Check it with your healthcare worker and try again." : ""} />
    : null;

  return <PatientDashboardWorkspace
    profile={profile}
    patient={patient}
    plans={plans}
    initialRecords={records}
    initialConditionLogs={conditionLogs}
    initialNotifications={notifications}
    loadError={loadError}
    linkForm={linkForm}
  />;
}

export default function PatientDashboard({ searchParams }) {
  return (
    <Suspense fallback={<div className="container dashboard-container" aria-busy="true"><div className="card empty-state"><p>Loading your rehabilitation dashboard…</p></div></div>}>
      <PatientDashboardContent searchParams={searchParams} />
    </Suspense>
  );
}
