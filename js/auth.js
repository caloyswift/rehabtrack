// Local authentication and role-based routing for the prototype.
import { validateFields, showError, showSuccess } from "./utils.js";
import { STORAGE_KEYS, getData, setData, removeData, getCurrentUser, isLoggedIn, createId, nowISO } from "./storage.js";

export { getCurrentUser, isLoggedIn };

/**
 * Fetch the app-level user profile (role, linked patientId) from Firestore.
 */
export async function getUserProfile(uid) { return getData(STORAGE_KEYS.users).find((user) => user.id === uid || user.userId === uid) || null; }

/** Redirect the browser to the correct dashboard for a given role. */
export function redirectForRole(role) {
  if (role === "therapist") {
    window.location.href = "therapist.html";
  } else {
    window.location.href = "patient.html";
  }
}

/**
 * Guard for dashboard pages. Redirects to login.html if not authenticated,
 * or to the correct dashboard if the user is on the wrong page for their role.
 * Calls onReady(user, profile) once confirmed.
 */
export function requireAuth(expectedRole, onReady) {
  const user = getCurrentUser();
  if (!user) { window.location.href = "login.html"; return; }
  const profile = getData(STORAGE_KEYS.users).find((entry) => entry.id === user.id || entry.userId === user.userId);
  if (!profile) { removeData(STORAGE_KEYS.currentUser); window.location.href = "login.html"; return; }
  if (profile.role !== expectedRole) { redirectForRole(profile.role); return; }
  onReady({ ...profile, uid: profile.id }, profile);
}

/** Handle the login form submit. */
export async function handleLogin(email, password) {
  const errors = validateFields(
    { email, password },
    {
      email: { required: true, email: true, label: "Email" },
      password: { required: true, label: "Password" }
    }
  );
  if (errors.length) {
    showError(errors[0]);
    return;
  }
  const user = getData(STORAGE_KEYS.users).find((entry) => entry.email.toLowerCase() === email.trim().toLowerCase() && entry.password === password);
  if (!user) { showError("Invalid email or password."); return; }
  setData(STORAGE_KEYS.currentUser, { id: user.id, userId: user.userId, name: user.name, email: user.email, role: user.role, patientId: user.patientId || null });
  redirectForRole(user.role);
}

/**
 * Handle registration. `role` is "patient" or "therapist".
 * For patient/caregiver accounts, `patientId` links the login to an existing
 * patient record (created earlier by a therapist).
 */
export async function handleRegister({ name, email, password, role, patientId }) {
  const rules = {
    name: { required: true, label: "Full name" },
    email: { required: true, email: true, label: "Email" },
    password: { required: true, label: "Password" }
  };
  const errors = validateFields({ name, email, password }, rules);
  if (password && password.length < 6) {
    errors.push("Password must be at least 6 characters.");
  }
  if (role === "patient" && !patientId) {
    errors.push("Please enter the Patient ID provided by your therapist.");
  }
  if (errors.length) {
    showError(errors[0]);
    return;
  }
  const users = getData(STORAGE_KEYS.users);
  if (users.some((entry) => entry.email.toLowerCase() === email.trim().toLowerCase())) { showError("An account with this email already exists."); return; }
  if (role === "patient" && !getData(STORAGE_KEYS.patients).some((patient) => patient.id === patientId.trim() || patient.patientId === patientId.trim())) { showError("We couldn't find that Patient ID. Please check it with your healthcare worker."); return; }
  const id = createId();
  const user = { id, userId: id, name: name.trim(), email: email.trim(), password, role, patientId: role === "patient" ? patientId.trim() : null, createdAt: nowISO() };
  users.push(user); setData(STORAGE_KEYS.users, users);
  setData(STORAGE_KEYS.currentUser, { id, userId: id, name: user.name, email: user.email, role, patientId: user.patientId });
  showSuccess("Account created! Redirecting..."); redirectForRole(role);
}

export async function handlePasswordReset(email) {
  showError("Password reset is not available in this local prototype. Please contact your healthcare worker or administrator.");
}

export async function handleLogout() { removeData(STORAGE_KEYS.currentUser); window.location.href = "login.html"; }

// Auto-wire a #logoutBtn if present on the page (dashboards include this).
document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", handleLogout);
  }
});
