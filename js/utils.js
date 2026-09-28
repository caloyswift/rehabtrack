// ============================================================
// utils.js
// Shared helper functions used across the app:
//  - form validation
//  - date/time formatting
//  - exercise status logic (upcoming / due / missed / completed)
//  - lightweight toast + loading/empty state helpers
// ============================================================

/** Day names used for schedule matching (matches JS Date.getDay()). */
export const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday",
  "Thursday", "Friday", "Saturday"
];

/** Condition log choices, in display order. */
export const CONDITION_OPTIONS = [
  { value: "comfortable", label: "Comfortable", icon: "fa-regular fa-face-smile" },
  { value: "slightly_difficult", label: "Slightly difficult", icon: "fa-regular fa-face-meh" },
  { value: "difficult", label: "Difficult", icon: "fa-regular fa-face-frown" },
  { value: "very_difficult", label: "Very difficult", icon: "fa-solid fa-triangle-exclamation" }
];

/** Difficulty choices for activity recording. */
export const DIFFICULTY_OPTIONS = ["Easy", "Moderate", "Difficult"];

// ------------------------------------------------------------
// Formatting helpers
// ------------------------------------------------------------

export function formatDateISO(date = new Date()) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDateReadable(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString(undefined, {
    year: "numeric", month: "long", day: "numeric"
  });
}

export function formatTime12h(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function relativeDayLabel(isoDate) {
  const today = formatDateISO();
  const yesterday = formatDateISO(new Date(Date.now() - 86400000));
  const tomorrow = formatDateISO(new Date(Date.now() + 86400000));
  if (isoDate === today) return "Today";
  if (isoDate === yesterday) return "Yesterday";
  if (isoDate === tomorrow) return "Tomorrow";
  return formatDateReadable(isoDate);
}

// ------------------------------------------------------------
// Exercise status logic (see spec section 29 - Missed Activity Logic)
// ------------------------------------------------------------

/**
 * Determine the status of a scheduled exercise for "today".
 * Does NOT mark future/unscheduled activities as missed.
 *
 * @param {string} scheduledTime - "HH:MM" 24h format
 * @param {boolean} hasRecord - whether an exerciseRecord already exists for today
 * @param {string} recordStatus - "completed" | "missed" | undefined
 * @param {Date} now - current time (injectable for testing)
 * @returns {"completed"|"missed"|"due"|"upcoming"}
 */
export function computeExerciseStatus(scheduledTime, hasRecord, recordStatus, now = new Date()) {
  if (hasRecord) {
    return recordStatus === "missed" ? "missed" : "completed";
  }
  const [h, m] = scheduledTime.split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(h, m, 0, 0);

  const DUE_WINDOW_MS = 30 * 60 * 1000; // 30 minutes around scheduled time counts as "due"
  const diff = now - scheduled;

  if (diff < -DUE_WINDOW_MS) return "upcoming";
  if (diff >= -DUE_WINDOW_MS && diff <= DUE_WINDOW_MS) return "due";
  return "missed"; // scheduled time has passed with no record
}

export function isExerciseScheduledForDay(scheduledDays, date = new Date()) {
  const dayName = DAY_NAMES[date.getDay()];
  return Array.isArray(scheduledDays) && scheduledDays.includes(dayName);
}

// ------------------------------------------------------------
// Validation helpers
// ------------------------------------------------------------

export function isNonEmpty(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

export function isNonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

/**
 * Validate a set of fields against simple rules.
 * rules: { fieldName: { required?: bool, nonNegative?: bool, email?: bool, label: string } }
 * Returns an array of human-readable error messages.
 */
export function validateFields(values, rules) {
  const errors = [];
  for (const [field, rule] of Object.entries(rules)) {
    const value = values[field];
    const label = rule.label || field;
    if (rule.required && !isNonEmpty(value)) {
      errors.push(`${label} is required.`);
      continue;
    }
    if (rule.nonNegative && value !== "" && value !== null && value !== undefined) {
      if (!isNonNegativeNumber(value)) {
        errors.push(`${label} cannot be negative.`);
      }
    }
    if (rule.email && isNonEmpty(value) && !isValidEmail(value)) {
      errors.push(`Please enter a valid email address.`);
    }
  }
  return errors;
}

// ------------------------------------------------------------
// UI helpers: toast messages, loading/empty states
// ------------------------------------------------------------

let toastTimeout = null;

/** Show a small toast message. Requires a #toast element in the page. */
export function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) {
    console.log(`[toast:${type}]`, message);
    return;
  }
  toast.textContent = message;
  toast.className = `toast toast--${type} toast--visible`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("toast--visible");
  }, 4000);
}

export function showError(message) {
  showToast(message, "error");
}

export function showSuccess(message) {
  showToast(message, "success");
}

/** Render an empty-state block into a container element. */
export function renderEmptyState(container, title, subtitle = "") {
  container.innerHTML = `
    <div class="empty-state">
      <p class="empty-state__title">${title}</p>
      ${subtitle ? `<p class="empty-state__subtitle">${subtitle}</p>` : ""}
    </div>
  `;
}

/** Render a loading spinner block into a container element. */
export function renderLoadingState(container, label = "Loading...") {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner" aria-hidden="true"></div>
      <p>${label}</p>
    </div>
  `;
}

export function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function calcCompletionRate(completed, assigned) {
  if (!assigned || assigned <= 0) return 0;
  return Math.round((completed / assigned) * 100);
}
