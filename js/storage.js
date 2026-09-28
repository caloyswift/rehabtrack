// Centralized browser storage for the local RehabTrack prototype.
export const STORAGE_KEYS = {
  users: "rehabtrack_users",
  currentUser: "rehabtrack_current_user",
  patients: "rehabtrack_patients",
  exercises: "rehabtrack_exercises",
  plans: "rehabtrack_rehabilitation_plans",
  records: "rehabtrack_exercise_records",
  conditionLogs: "rehabtrack_condition_logs",
  notifications: "rehabtrack_notifications"
};

export function getData(key, fallback = []) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function setData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  return data;
}

export function removeData(key) { localStorage.removeItem(key); }

export function clearData() {
  Object.values(STORAGE_KEYS).forEach(removeData);
}

export function createId() {
  return globalThis.crypto?.randomUUID?.() || `rt-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowISO() { return new Date().toISOString(); }

export function getCurrentUser() { return getData(STORAGE_KEYS.currentUser, null); }
export function isLoggedIn() { return Boolean(getCurrentUser()); }

// Only missing keys are seeded. Existing local prototype data is never replaced.
export function initializeDemoData() {
  const therapistId = "demo-therapist";
  const patientId = "PAT-DEMO-001";
  const createdAt = nowISO();
  if (localStorage.getItem(STORAGE_KEYS.users) === null) setData(STORAGE_KEYS.users, [
    { id: therapistId, userId: therapistId, name: "Demo Therapist", email: "therapist@rehabtrack.test", password: "therapist123", role: "therapist", patientId: null, createdAt, isDemo: true },
    { id: "demo-patient-user", userId: "demo-patient-user", name: "Demo Patient", email: "patient@rehabtrack.test", password: "patient123", role: "patient", patientId, createdAt, isDemo: true }
  ]);
  if (localStorage.getItem(STORAGE_KEYS.patients) === null) setData(STORAGE_KEYS.patients, [
    { id: patientId, patientId, name: "Demo Patient", age: 65, contact: "0917-000-0000", emergencyContact: "0917-111-1111", caregiverName: "Maria Dela Cruz", status: "active", therapistId, createdAt, isDemo: true }
  ]);
  if (localStorage.getItem(STORAGE_KEYS.exercises) === null) setData(STORAGE_KEYS.exercises, [
    { id: "demo-arm-raise", name: "Arm Raise", description: "Improves shoulder mobility and strength.", instructions: "Slowly raise the affected arm as far as comfortable, then lower it with control.", targetRepetitions: 10, targetDuration: 0, imageUrl: "", videoUrl: "", active: true, therapistId, createdAt, isDemo: true },
    { id: "demo-hand-grip", name: "Hand Grip", description: "Builds grip strength and fine motor control.", instructions: "Squeeze a soft ball or towel for a few seconds, then release.", targetRepetitions: 15, targetDuration: 0, imageUrl: "", videoUrl: "", active: true, therapistId, createdAt, isDemo: true }
  ]);
  if (localStorage.getItem(STORAGE_KEYS.plans) === null) setData(STORAGE_KEYS.plans, [
    { id: "demo-plan-arm", patientId, exerciseId: "demo-arm-raise", scheduledDays: ["Monday", "Wednesday", "Friday"], scheduledTime: "09:00", targetRepetitions: 10, targetDuration: 0, active: true, createdBy: therapistId, createdAt, isDemo: true },
    { id: "demo-plan-grip", patientId, exerciseId: "demo-hand-grip", scheduledDays: ["Tuesday", "Thursday", "Saturday"], scheduledTime: "10:00", targetRepetitions: 15, targetDuration: 0, active: true, createdBy: therapistId, createdAt, isDemo: true }
  ]);
  if (localStorage.getItem(STORAGE_KEYS.records) === null) setData(STORAGE_KEYS.records, []);
  if (localStorage.getItem(STORAGE_KEYS.conditionLogs) === null) setData(STORAGE_KEYS.conditionLogs, []);
  if (localStorage.getItem(STORAGE_KEYS.notifications) === null) setData(STORAGE_KEYS.notifications, [
    { id: "demo-notification", userId: null, patientId, type: "new_plan", title: "Welcome to RehabTrack", message: "Your demonstration rehabilitation plan is ready.", read: false, createdAt, isDemo: true }
  ]);
}

initializeDemoData();
