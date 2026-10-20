import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadLocalEnvironment() {
  let contents;
  try {
    contents = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  } catch {
    throw new Error("Create .env.local from .env.example before seeding demo accounts.");
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Add ${name} to .env.local first.`);
  return value;
}

async function findUserByEmail(supabase, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 1000) return null;
  }
  throw new Error("Could not find the demo accounts. Check the Auth user list size and run this again.");
}

async function ensureDemoUser(supabase, { email, password, fullName, role }) {
  const existing = await findUserByEmail(supabase, email);
  let user;

  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: fullName,
    role,
  });
  if (profileError) throw profileError;
  return user;
}

async function seedDemoData(supabase, therapist, patientAccount) {
  const { data: patient, error: patientError } = await supabase.from("patients").upsert({
    patient_code: "PAT-DEMO000001",
    full_name: "Demo Patient",
    age: 58,
    contact: "Demo account",
    emergency_contact: "Demo account",
    caregiver_name: "Demo Caregiver",
    status: "active",
    therapist_id: therapist.id,
    linked_user_id: patientAccount.id,
  }, { onConflict: "patient_code" }).select("id").single();
  if (patientError) throw patientError;

  const exerciseDetails = {
    therapist_id: therapist.id,
    name: "Demo: Seated Arm Raise",
    description: "A sample exercise assigned for testing the RehabTrack plan flow.",
    instructions: "Sit comfortably with support. Raise each arm only within a comfortable range, then lower it slowly. Stop if you feel pain or unwell.",
    target_repetitions: 8,
    target_duration: 5,
    active: true,
  };
  const { data: existingExercises, error: exerciseLookupError } = await supabase.from("exercises")
    .select("id").eq("therapist_id", therapist.id).eq("name", exerciseDetails.name).limit(1);
  if (exerciseLookupError) throw exerciseLookupError;

  let exercise = existingExercises[0];
  if (exercise) {
    const { data, error } = await supabase.from("exercises").update(exerciseDetails).eq("id", exercise.id).select("id").single();
    if (error) throw error;
    exercise = data;
  } else {
    const { data, error } = await supabase.from("exercises").insert(exerciseDetails).select("id").single();
    if (error) throw error;
    exercise = data;
  }

  const planDetails = {
    patient_id: patient.id,
    exercise_id: exercise.id,
    created_by: therapist.id,
    scheduled_days: ["Monday", "Wednesday", "Friday"],
    scheduled_time: "09:00:00",
    target_repetitions: 8,
    target_duration: 5,
    active: true,
  };
  const { data: existingPlans, error: planLookupError } = await supabase.from("rehabilitation_plans")
    .select("id").eq("patient_id", patient.id).eq("exercise_id", exercise.id).limit(1);
  if (planLookupError) throw planLookupError;

  let planId;
  if (existingPlans.length) {
    planId = existingPlans[0].id;
    const { error } = await supabase.from("rehabilitation_plans").update(planDetails).eq("id", planId);
    if (error) throw error;
  } else {
    const { data, error } = await supabase.from("rehabilitation_plans").insert(planDetails).select("id").single();
    if (error) throw error;
    planId = data.id;
  }

  const { data: existingRecords, error: recordLookupError } = await supabase.from("exercise_records")
    .select("id").eq("patient_id", patient.id).limit(1);
  if (recordLookupError) throw recordLookupError;
  if (!existingRecords.length) {
    const now = Date.now();
    const records = [
      { daysAgo: 3, status: "completed", repetitions: 8, duration: 5, difficulty: "easy" },
      { daysAgo: 2, status: "completed", repetitions: 7, duration: 5, difficulty: "moderate" },
      { daysAgo: 1, status: "missed", repetitions: 0, duration: 0, difficulty: null },
    ].map(({ daysAgo, ...record }) => ({
      patient_id: patient.id,
      plan_id: planId,
      exercise_id: exercise.id,
      logged_by: patientAccount.id,
      recorded_as: "patient",
      notes: "Sample demo activity",
      completed_at: new Date(now - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      ...record,
    }));
    const { error } = await supabase.from("exercise_records").insert(records);
    if (error) throw error;
  }
}

async function main() {
  loadLocalEnvironment();
  const supabase = createClient(
    requiredEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const therapist = await ensureDemoUser(supabase, {
    email: requiredEnvironment("NEXT_PUBLIC_DEMO_THERAPIST_EMAIL"),
    password: requiredEnvironment("NEXT_PUBLIC_DEMO_THERAPIST_PASSWORD"),
    fullName: "Demo Healthcare Worker",
    role: "therapist",
  });
  const patient = await ensureDemoUser(supabase, {
    email: requiredEnvironment("NEXT_PUBLIC_DEMO_PATIENT_EMAIL"),
    password: requiredEnvironment("NEXT_PUBLIC_DEMO_PATIENT_PASSWORD"),
    fullName: "Demo Patient Account",
    role: "patient",
  });

  await seedDemoData(supabase, therapist, patient);
  console.log("Demo accounts and sample rehabilitation data are ready.");
  console.log(`Healthcare worker demo: ${process.env.NEXT_PUBLIC_DEMO_THERAPIST_EMAIL}`);
  console.log(`Patient demo: ${process.env.NEXT_PUBLIC_DEMO_PATIENT_EMAIL}`);
}

main().catch((error) => {
  console.error(`Demo seed failed: ${error.message}`);
  process.exitCode = 1;
});
