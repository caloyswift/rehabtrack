// Local in-app notifications.
import { STORAGE_KEYS, getData, setData, createId, nowISO } from "./storage.js";
import { computeExerciseStatus, formatTime12h } from "./utils.js";
export async function createNotification({ patientId, type, title, message }) { const all = getData(STORAGE_KEYS.notifications); all.push({ id: createId(), userId: null, patientId, type, title, message, read: false, createdAt: nowISO() }); setData(STORAGE_KEYS.notifications, all); }
export async function listNotificationsForPatient(patientId, max = 20) { return getData(STORAGE_KEYS.notifications).filter((n) => n.patientId === patientId).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, max); }
export async function markNotificationRead(id) { const all = getData(STORAGE_KEYS.notifications), note = all.find((n) => n.id === id); if (note) { note.read = true; setData(STORAGE_KEYS.notifications, all); } }
/** Mark every notification belonging to one or more patients as read in one storage write. */
export async function markNotificationsReadForPatients(patientIds) {
  const ids = new Set(patientIds);
  const all = getData(STORAGE_KEYS.notifications);
  let changed = false;
  all.forEach((note) => {
    if (ids.has(note.patientId) && !note.read) {
      note.read = true;
      changed = true;
    }
  });
  if (changed) setData(STORAGE_KEYS.notifications, all);
}
export async function countUnreadNotifications(patientId) { return (await listNotificationsForPatient(patientId, 50)).filter((n) => !n.read).length; }
export async function generateTodayNotifications(patientId, plansWithExercises, todaysRecords) { const existing = await listNotificationsForPatient(patientId, 50), today = new Date().toISOString().slice(0, 10), sent = new Set(existing.filter((n) => String(n.createdAt).slice(0, 10) === today).map((n) => `${n.type}:${n.message}`)); for (const { plan, exercise } of plansWithExercises) { const record = todaysRecords.find((r) => r.planId === plan.id || r.exerciseId === plan.exerciseId), status = computeExerciseStatus(plan.scheduledTime, Boolean(record), record?.status); if (status === "due") { const message = `${exercise.name} is scheduled for ${formatTime12h(plan.scheduledTime)}.`; if (!sent.has(`reminder:${message}`)) await createNotification({ patientId, type: "reminder", title: "Rehabilitation Reminder", message }); } if (status === "missed") { const message = `The ${exercise.name} exercise scheduled for today has not been recorded.`; if (!sent.has(`missed:${message}`)) await createNotification({ patientId, type: "missed", title: "Missed Activity", message }); } } }
