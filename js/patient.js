// ============================================================
// patient.js
// Page controller for patient.html — the shared Patient/Caregiver
// interface. Wires together auth, exercises, progress, and
// notifications into the dashboard views.
// ============================================================

import { requireAuth } from "./auth.js";
import { getPatient, listTodaysPlansWithExercises } from "./exercises.js";
import {
  recordActivity, recordConditionLog, getRecordsForPatientToday,
  getRecordHistoryForPatient, getConditionLogsForPatient,
  computeProgressStats, filterToCurrentWeek, groupRecordsByDate
} from "./progress.js";
import {
  listNotificationsForPatient, markNotificationRead,
  markNotificationsReadForPatients, countUnreadNotifications, generateTodayNotifications
} from "./notifications.js";
import {
  computeExerciseStatus, formatTime12h, relativeDayLabel, escapeHtml,
  showError, showSuccess, renderEmptyState, renderLoadingState,
  CONDITION_OPTIONS, DIFFICULTY_OPTIONS, DAY_NAMES
} from "./utils.js";

let currentUser = null;
let currentProfile = null;
let currentPatient = null;
let plansWithExercises = [];
let todaysRecords = [];

const views = ["dashboard", "exercises", "progress", "condition", "notifications", "profile"];

requireAuth("patient", async (user, profile) => {
  currentUser = user;
  currentProfile = profile;

  if (!profile.patientId) {
    renderEmptyState(
      document.getElementById("todayExercisesList"),
      "No patient record linked to this account.",
      "Please contact your healthcare worker to link your account to a patient record."
    );
    document.getElementById("greeting").textContent = `Hello, ${profile.name}`;
    return;
  }

  currentPatient = await getPatient(profile.patientId);
  initHeader();
  initNav();
  initModal();
  await refreshAll();
  navigateTo(location.hash.replace("#", "") || "dashboard");
});

function initHeader() {
  document.getElementById("greeting").textContent = `Hello, ${currentPatient?.caregiverName || currentProfile.name}`;
  document.getElementById("todayDate").textContent = relativeDayLabel(new Date().toISOString().slice(0, 10));
  document.getElementById("profileName").textContent = currentProfile.name;
  document.getElementById("avatarInitial").textContent = (currentProfile.name || "P").charAt(0).toUpperCase();
}

function initNav() {
  document.querySelectorAll("[data-view]").forEach((el) => {
    el.addEventListener("click", async (e) => {
      e.preventDefault();
      await navigateTo(el.dataset.view);
      history.replaceState(null, "", `#${el.dataset.view}`);
    });
  });
}

async function navigateTo(view) {
  if (!views.includes(view)) view = "dashboard";
  views.forEach((v) => {
    document.getElementById(`view-${v}`).classList.toggle("hidden", v !== view);
  });
  document.querySelectorAll("[data-view]").forEach((el) => {
    if (el.dataset.view === view) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  if (view === "profile") renderProfileView();
  if (view === "notifications") await openNotifications();
}

// ------------------------------------------------------------
// Data loading
// ------------------------------------------------------------

async function refreshAll() {
  plansWithExercises = await listTodaysPlansWithExercises(currentPatient.id);
  todaysRecords = await getRecordsForPatientToday(currentPatient.id);

  await generateTodayNotifications(currentPatient.id, plansWithExercises, todaysRecords).catch(() => {});

  renderDashboardStats();
  renderTodayExercises();
  renderAllExercises();
  await renderProgressView();
  await renderConditionHistory();
  await renderNotifications();
}

// ------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------

function getStatusFor(plan) {
  const record = todaysRecords.find((r) => r.planId === plan.id || r.exerciseId === plan.exerciseId);
  return {
    status: computeExerciseStatus(plan.scheduledTime, Boolean(record), record?.status),
    record
  };
}

function renderDashboardStats() {
  const todaysScheduled = plansWithExercises.filter(({ plan }) =>
    DAY_NAMES[new Date().getDay()] && (plan.scheduledDays || []).includes(DAY_NAMES[new Date().getDay()])
  );
  const total = todaysScheduled.length || plansWithExercises.length;
  const completed = todaysRecords.filter((r) => r.status === "completed").length;
  const remaining = Math.max(total - todaysRecords.length, 0);

  document.getElementById("statToday").textContent = total;
  document.getElementById("statCompleted").textContent = completed;
  document.getElementById("statRemaining").textContent = remaining;

  const weekRecordsPromise = getRecordHistoryForPatient(currentPatient.id, 14).then((all) => {
    const weekly = computeProgressStats(filterToCurrentWeek(all));
    document.getElementById("statWeekly").textContent = `${weekly.completionRate}%`;
  });
}

function statusLabel(status) {
  return {
    upcoming: "Upcoming",
    due: '<i class="fa-regular fa-clock" aria-hidden="true"></i> Due',
    completed: '<i class="fa-solid fa-circle-check" aria-hidden="true"></i> Completed',
    missed: '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Missed'
  }[status];
}

function exerciseCardHTML({ plan, exercise }, status) {
  return `
    <article class="exercise-card exercise-card--${status}">
      <span class="status-tag status-tag--${status}">${statusLabel(status)}</span>
      <h3 style="margin-bottom:0;">${escapeHtml(exercise.name)}</h3>
      <p style="margin:0; color:var(--color-text-muted);">
        ${plan.targetRepetitions ? `${plan.targetRepetitions} repetitions` : ""}
        ${plan.targetRepetitions && plan.targetDuration ? " · " : ""}
        ${plan.targetDuration ? `${plan.targetDuration} min` : ""}
      </p>
      <p style="margin:0; color:var(--color-text-muted);">${formatTime12h(plan.scheduledTime)}</p>
      <button class="btn btn--primary btn--sm view-exercise-btn" data-plan-id="${plan.id}">
        View Exercise
      </button>
    </article>
  `;
}

function renderTodayExercises() {
  const container = document.getElementById("todayExercisesList");
  const todayName = DAY_NAMES[new Date().getDay()];
  const todays = plansWithExercises.filter(({ plan }) => (plan.scheduledDays || []).includes(todayName));

  if (todays.length === 0) {
    renderEmptyState(container, "No exercises scheduled for today.", "Your rehabilitation plan is currently empty for today.");
    return;
  }
  container.innerHTML = todays.map((pe) => exerciseCardHTML(pe, getStatusFor(pe.plan).status)).join("");
  wireExerciseButtons(container);
}

function renderAllExercises() {
  const container = document.getElementById("allExercisesList");
  if (plansWithExercises.length === 0) {
    renderEmptyState(container, "No exercises assigned yet.", "Your healthcare worker will add exercises to your rehabilitation plan.");
    return;
  }
  container.innerHTML = plansWithExercises.map((pe) => exerciseCardHTML(pe, getStatusFor(pe.plan).status)).join("");
  wireExerciseButtons(container);
}

function wireExerciseButtons(container) {
  container.querySelectorAll(".view-exercise-btn").forEach((btn) => {
    btn.addEventListener("click", () => openExerciseModal(btn.dataset.planId));
  });
}

// ------------------------------------------------------------
// Exercise detail + record activity modal
// ------------------------------------------------------------

function initModal() {
  document.getElementById("closeExerciseModal").addEventListener("click", closeExerciseModal);
  document.getElementById("exerciseModal").addEventListener("click", (e) => {
    if (e.target.id === "exerciseModal") closeExerciseModal();
  });
}

function closeExerciseModal() {
  document.getElementById("exerciseModal").classList.add("hidden");
}

function openExerciseModal(planId) {
  const pe = plansWithExercises.find(({ plan }) => plan.id === planId);
  if (!pe) return;
  const { plan, exercise } = pe;
  const { status, record } = getStatusFor(plan);

  document.getElementById("exerciseModalTitle").textContent = exercise.name;
  const body = document.getElementById("exerciseModalBody");

  if (record) {
    body.innerHTML = `
      <p><strong>Instructions:</strong> ${escapeHtml(exercise.instructions)}</p>
      <div class="card" style="background:var(--color-primary-tint); border:none;">
        <p style="margin:0;"><strong>Already recorded today</strong></p>
        <p style="margin:0;">Status: ${statusLabel(status)}</p>
        ${record.status === "completed" ? `<p style="margin:0;">${record.completedRepetitions} repetitions · ${record.completedDuration} min · ${escapeHtml(record.difficulty || "")}</p>` : ""}
      </div>
      <h4 style="margin-top:var(--space-3);">How did you feel today?</h4>
      ${conditionFormHTML(plan, exercise)}
    `;
    wireConditionForm(plan, exercise);
    document.getElementById("exerciseModal").classList.remove("hidden");
    return;
  }

  body.innerHTML = `
    ${exercise.imageUrl ? `<img src="${escapeHtml(exercise.imageUrl)}" alt="${escapeHtml(exercise.name)}" style="border-radius:var(--radius-sm); margin-bottom:var(--space-2);" />` : ""}
    <p>${escapeHtml(exercise.description || "")}</p>
    <p><strong>Instructions:</strong> ${escapeHtml(exercise.instructions)}</p>
    ${exercise.videoUrl ? `<p><a href="${escapeHtml(exercise.videoUrl)}" target="_blank" rel="noopener">Watch demonstration video</a></p>` : ""}
    <p><strong>Target:</strong> ${plan.targetRepetitions} repetitions${plan.targetDuration ? ` · ${plan.targetDuration} min` : ""}</p>
    <p><strong>Scheduled:</strong> ${formatTime12h(plan.scheduledTime)}</p>

    <form id="recordActivityForm" class="stack" style="margin-top:var(--space-3); border-top:1px solid var(--color-border); padding-top:var(--space-3);">
      <h4 style="margin:0;">Record Activity</h4>
      <div class="field-grid">
        <div class="form-field">
          <label for="repsCompleted">Repetitions completed</label>
          <input type="number" id="repsCompleted" min="0" value="${plan.targetRepetitions || 0}" />
        </div>
        <div class="form-field">
          <label for="durationCompleted">Duration completed (min)</label>
          <input type="number" id="durationCompleted" min="0" value="${plan.targetDuration || 0}" />
        </div>
      </div>
      <div class="form-field">
        <label>How difficult was the exercise?</label>
        <div class="checkbox-group" role="radiogroup" aria-label="Difficulty">
          ${DIFFICULTY_OPTIONS.map((d, i) => `
            <label class="checkbox-pill">
              <input type="radio" name="difficulty" value="${d}" ${i === 1 ? "checked" : ""} />
              ${d}
            </label>
          `).join("")}
        </div>
      </div>
      <div class="row row--wrap">
        <label class="row" style="gap:0.4rem;"><input type="radio" name="recordedBy" value="patient" checked /> Recorded by patient</label>
        <label class="row" style="gap:0.4rem;"><input type="radio" name="recordedBy" value="caregiver" /> Recorded by caregiver</label>
      </div>
      <div class="row row--wrap">
        <button type="submit" class="btn btn--primary" id="markCompletedBtn">Mark as Completed</button>
        <button type="button" class="btn btn--danger" id="markMissedBtn">Mark as Missed</button>
      </div>
    </form>
  `;

  const form = document.getElementById("recordActivityForm");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    submitActivity(plan, exercise, "completed");
  });
  document.getElementById("markMissedBtn").addEventListener("click", () => {
    submitActivity(plan, exercise, "missed");
  });

  document.getElementById("exerciseModal").classList.remove("hidden");
}

async function submitActivity(plan, exercise, status) {
  const recordedBy = document.querySelector('input[name="recordedBy"]:checked')?.value || "patient";
  const difficulty = document.querySelector('input[name="difficulty"]:checked')?.value || null;
  try {
    await recordActivity({
      patientId: currentPatient.id,
      exerciseId: exercise.id,
      planId: plan.id,
      targetRepetitions: plan.targetRepetitions,
      targetDuration: plan.targetDuration,
      completedRepetitions: document.getElementById("repsCompleted")?.value ?? 0,
      completedDuration: document.getElementById("durationCompleted")?.value ?? 0,
      difficulty,
      status,
      recordedBy
    });
    showSuccess(status === "completed" ? "Activity saved." : "Marked as missed.");
    todaysRecords = await getRecordsForPatientToday(currentPatient.id);
    renderDashboardStats();
    renderTodayExercises();
    renderAllExercises();

    // Immediately follow up with the condition log, matching the spec's flow.
    document.getElementById("exerciseModalTitle").textContent = "How did you feel today?";
    const body = document.getElementById("exerciseModalBody");
    body.innerHTML = conditionFormHTML(plan, exercise);
    wireConditionForm(plan, exercise);
  } catch (err) {
    showError(err.message || "Unable to save the activity. Please try again.");
  }
}

function conditionFormHTML() {
  return `
    <form id="conditionForm" class="stack">
      <div class="choice-group" role="radiogroup" aria-label="How did you feel today?">
        ${CONDITION_OPTIONS.map((c, i) => `
          <label class="choice-card">
            <input type="radio" name="condition" value="${c.value}" ${i === 0 ? "checked" : ""} />
            <span class="emoji" aria-hidden="true"><i class="${c.icon}"></i></span> ${c.label}
          </label>
        `).join("")}
      </div>
      <div class="form-field">
        <label for="conditionNote">Note (optional)</label>
        <textarea id="conditionNote" placeholder="Anything worth mentioning to the healthcare worker?"></textarea>
      </div>
      <button type="submit" class="btn btn--primary">Save</button>
    </form>
  `;
}

function wireConditionForm(plan, exercise) {
  const form = document.getElementById("conditionForm");
  if (!form) return;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const condition = document.querySelector('input[name="condition"]:checked')?.value;
    const note = document.getElementById("conditionNote").value;
    const recordedBy = document.querySelector('input[name="recordedBy"]:checked')?.value || "patient";
    try {
      await recordConditionLog({
        patientId: currentPatient.id,
        exerciseId: exercise.id,
        condition,
        note,
        recordedBy
      });
      showSuccess("Thanks — condition saved.");
      closeExerciseModal();
      await renderConditionHistory();
    } catch (err) {
      showError(err.message || "Unable to save. Please try again.");
    }
  });
}

// ------------------------------------------------------------
// Progress view
// ------------------------------------------------------------

async function renderProgressView() {
  const history = await getRecordHistoryForPatient(currentPatient.id, 30);
  const weekRecords = filterToCurrentWeek(history);
  const stats = computeProgressStats(weekRecords);

  document.getElementById("progAssigned").textContent = stats.assigned;
  document.getElementById("progCompleted").textContent = stats.completed;
  document.getElementById("progMissed").textContent = stats.missed;
  document.getElementById("progRate").textContent = `${stats.completionRate}%`;

  renderWeeklyChart(weekRecords);

  const list = document.getElementById("recentActivityList");
  if (history.length === 0) {
    renderEmptyState(list, "No activity recorded yet.");
  } else {
    list.innerHTML = history.slice(0, 10).map((r) => `
      <li class="history-item">
        <span class="status-tag status-tag--${r.status === "completed" ? "completed" : "missed"}"><i class="fa-solid ${r.status === "completed" ? "fa-circle-check" : "fa-triangle-exclamation"}" aria-hidden="true"></i></span>
        <div>
          <div>${relativeDayLabel(r.date)}</div>
          <div class="meta">${r.status === "completed" ? `${r.completedRepetitions} reps · ${r.completedDuration} min` : "Missed"}</div>
        </div>
      </li>
    `).join("");
  }
}

function renderWeeklyChart(weekRecords) {
  const grouped = groupRecordsByDate(weekRecords);
  const chart = document.getElementById("weeklyChart");
  const days = Object.keys(grouped).sort();
  if (days.length === 0) {
    renderEmptyState(chart, "No activity this week yet.");
    return;
  }
  const max = Math.max(...days.map((d) => grouped[d].completed + grouped[d].missed), 1);
  chart.innerHTML = days.map((d) => {
    const { completed, missed } = grouped[d];
    const completedH = Math.round((completed / max) * 100);
    const missedH = Math.round((missed / max) * 100);
    return `
      <div class="bar-col">
        <div class="bar-stack" style="height:100%; justify-content:flex-end;">
          <div class="bar" style="height:${completedH}%;" title="${completed} completed"></div>
          <div class="bar bar--missed" style="height:${missedH}%;" title="${missed} missed"></div>
        </div>
        <span class="bar-label">${new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</span>
      </div>
    `;
  }).join("");
}

// ------------------------------------------------------------
// Condition history view
// ------------------------------------------------------------

async function renderConditionHistory() {
  const logs = await getConditionLogsForPatient(currentPatient.id, 20);
  const list = document.getElementById("conditionHistoryList");
  if (logs.length === 0) {
    renderEmptyState(list, "No condition logs yet.", "These appear after you record how the patient felt during a session.");
    return;
  }
  const labelFor = (v) => CONDITION_OPTIONS.find((c) => c.value === v) || { label: v, icon: "fa-regular fa-circle" };
  list.innerHTML = logs.map((log) => {
    const c = labelFor(log.condition);
    return `
      <li class="history-item">
        <span class="emoji" aria-hidden="true"><i class="${c.icon}"></i></span>
        <div>
          <div>${relativeDayLabel(log.date)} — ${c.label}</div>
          ${log.note ? `<div class="meta">${escapeHtml(log.note)}</div>` : ""}
        </div>
      </li>
    `;
  }).join("");
}

// ------------------------------------------------------------
// Notifications view
// ------------------------------------------------------------

async function renderNotifications() {
  const notes = await listNotificationsForPatient(currentPatient.id, 30);
  const unread = notes.filter((n) => !n.read).length;
  const badge = document.getElementById("notifBadge");
  badge.textContent = String(unread);
  badge.classList.toggle("hidden", unread === 0);

  const list = document.getElementById("notificationsList");
  if (notes.length === 0) {
    renderEmptyState(list, "No notifications yet.");
    return;
  }
  const iconFor = { reminder: "fa-regular fa-bell", missed: "fa-solid fa-triangle-exclamation", new_plan: "fa-solid fa-clipboard-list", schedule_update: "fa-regular fa-calendar" };
  list.innerHTML = notes.map((n) => `
    <li class="notification-item ${n.read ? "" : "unread"}" data-id="${n.id}">
      <span class="n-icon" aria-hidden="true"><i class="${iconFor[n.type] || "fa-regular fa-bell"}"></i></span>
      <div>
        <div><strong>${escapeHtml(n.title)}</strong></div>
        <div>${escapeHtml(n.message)}</div>
        <div class="n-time">${n.createdAt ? relativeDayLabel(String(n.createdAt).slice(0, 10)) : ""}</div>
      </div>
    </li>
  `).join("");

  list.querySelectorAll(".notification-item.unread").forEach((el) => {
    el.addEventListener("click", async () => {
      await markNotificationRead(el.dataset.id);
      el.classList.remove("unread");
      await renderNotifications();
    });
  });
}

/** Opening the notification view acknowledges all of this patient's notifications. */
async function openNotifications() {
  await markNotificationsReadForPatients([currentPatient.id]);
  const badge = document.getElementById("notifBadge");
  badge.textContent = "0";
  badge.classList.add("hidden");
  await renderNotifications();
}

// ------------------------------------------------------------
// Profile view
// ------------------------------------------------------------

function renderProfileView() {
  const card = document.getElementById("profileCard");
  card.innerHTML = `
    <div><strong>Name:</strong> ${escapeHtml(currentProfile.name)}</div>
    <div><strong>Email:</strong> ${escapeHtml(currentProfile.email)}</div>
    <div><strong>Patient:</strong> ${escapeHtml(currentPatient?.name || "—")}</div>
    <div><strong>Caregiver on file:</strong> ${escapeHtml(currentPatient?.caregiverName || "—")}</div>
  `;
}
