// Local CRUD helpers for patients, exercises, and rehabilitation plans.
import { STORAGE_KEYS, getData, setData, createId, nowISO } from "./storage.js";
import { validateFields } from "./utils.js";

function validPatient(data) { const e = validateFields(data, { name: { required: true, label: "Full name" }, age: { required: true, nonNegative: true, label: "Age" } }); if (e.length) throw new Error(e[0]); }
function validExercise(data) { const e = validateFields(data, { name: { required: true, label: "Exercise name" }, instructions: { required: true, label: "Instructions" }, targetRepetitions: { nonNegative: true, label: "Target repetitions" }, targetDuration: { nonNegative: true, label: "Target duration" } }); if (e.length) throw new Error(e[0]); }
const patientFields = (data) => ({ name: data.name.trim(), age: Number(data.age), contact: data.contact?.trim() || "", emergencyContact: data.emergencyContact?.trim() || "", caregiverName: data.caregiverName?.trim() || "", status: data.status || "active" });
const exerciseFields = (data) => ({ name: data.name.trim(), description: data.description?.trim() || "", instructions: data.instructions.trim(), targetRepetitions: Number(data.targetRepetitions) || 0, targetDuration: Number(data.targetDuration) || 0, imageUrl: data.imageUrl?.trim() || "", videoUrl: data.videoUrl?.trim() || "", active: data.active !== false });

export async function addPatient(therapistId, data) { validPatient(data); const id = createId(), all = getData(STORAGE_KEYS.patients); all.push({ id, patientId: id, ...patientFields(data), therapistId, createdAt: nowISO() }); setData(STORAGE_KEYS.patients, all); return id; }
export async function updatePatient(id, data) { validPatient(data); const all = getData(STORAGE_KEYS.patients), item = all.find((p) => p.id === id); if (!item) throw new Error("Patient not found."); Object.assign(item, patientFields(data)); setData(STORAGE_KEYS.patients, all); }
export async function getPatient(id) { return getData(STORAGE_KEYS.patients).find((p) => p.id === id || p.patientId === id) || null; }
export async function listPatientsForTherapist(therapistId) { return getData(STORAGE_KEYS.patients).filter((p) => p.therapistId === therapistId); }

export async function addExercise(therapistId, data) { validExercise(data); const id = createId(), all = getData(STORAGE_KEYS.exercises); all.push({ id, ...exerciseFields(data), therapistId, createdAt: nowISO() }); setData(STORAGE_KEYS.exercises, all); return id; }
export async function updateExercise(id, data) { validExercise(data); const all = getData(STORAGE_KEYS.exercises), item = all.find((e) => e.id === id); if (!item) throw new Error("Exercise not found."); Object.assign(item, exerciseFields(data)); setData(STORAGE_KEYS.exercises, all); }
export async function deleteExercise(id) { setData(STORAGE_KEYS.exercises, getData(STORAGE_KEYS.exercises).filter((e) => e.id !== id)); }
export async function getExercise(id) { return getData(STORAGE_KEYS.exercises).find((e) => e.id === id) || null; }
export async function listExercisesForTherapist(therapistId) { return getData(STORAGE_KEYS.exercises).filter((e) => e.therapistId === therapistId); }

export async function createPlan(therapistId, data) {
  const errors = validateFields(data, { patientId: { required: true, label: "Patient" }, exerciseId: { required: true, label: "Exercise" }, targetRepetitions: { nonNegative: true, label: "Target repetitions" }, targetDuration: { nonNegative: true, label: "Target duration" }, scheduledTime: { required: true, label: "Scheduled time" } });
  if (!data.scheduledDays?.length) errors.push("Please select at least one scheduled day."); if (errors.length) throw new Error(errors[0]);
  const id = createId(), plans = getData(STORAGE_KEYS.plans); plans.push({ id, patientId: data.patientId, exerciseId: data.exerciseId, scheduledDays: data.scheduledDays, scheduledTime: data.scheduledTime, targetRepetitions: Number(data.targetRepetitions) || 0, targetDuration: Number(data.targetDuration) || 0, active: true, createdBy: therapistId, createdAt: nowISO() }); setData(STORAGE_KEYS.plans, plans);
  const notes = getData(STORAGE_KEYS.notifications); notes.push({ id: createId(), userId: null, patientId: data.patientId, type: "new_plan", title: "New rehabilitation plan", message: "A new exercise has been added to your rehabilitation plan.", read: false, createdAt: nowISO() }); setData(STORAGE_KEYS.notifications, notes); return id;
}
export async function updatePlan(id, data) { const all = getData(STORAGE_KEYS.plans), item = all.find((p) => p.id === id); if (!item) throw new Error("Rehabilitation plan not found."); Object.assign(item, { scheduledDays: data.scheduledDays, scheduledTime: data.scheduledTime, targetRepetitions: Number(data.targetRepetitions) || 0, targetDuration: Number(data.targetDuration) || 0, active: data.active !== false }); setData(STORAGE_KEYS.plans, all); }
export async function deletePlan(id) { setData(STORAGE_KEYS.plans, getData(STORAGE_KEYS.plans).filter((p) => p.id !== id)); }
export async function listPlansForPatient(patientId, activeOnly = true) { return getData(STORAGE_KEYS.plans).filter((p) => p.patientId === patientId && (!activeOnly || p.active)); }
export async function listTodaysPlansWithExercises(patientId) { const exercises = getData(STORAGE_KEYS.exercises); return (await listPlansForPatient(patientId, true)).map((plan) => ({ plan, exercise: exercises.find((e) => e.id === plan.exerciseId) })).filter((x) => x.exercise); }
