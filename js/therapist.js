// ============================================================
// therapist.js
// Page controller for therapist.html — patient management,
// exercise library, rehabilitation plan wizard, and progress review.
// ============================================================

import { requireAuth } from "./auth.js";
import {
  addPatient, updatePatient, listPatientsForTherapist,
  addExercise, updateExercise, deleteExercise, listExercisesForTherapist,
  createPlan, updatePlan, deletePlan, listPlansForPatient, getExercise
} from "./exercises.js";
import {
  getRecordsForPatientToday, getRecordHistoryForPatient, getConditionLogsForPatient,
  computeProgressStats, filterToCurrentWeek, groupRecordsByDate
} from "./progress.js";
import { listNotificationsForPatient, markNotificationsReadForPatients, countUnreadNotifications } from "./notifications.js";
import {
  computeExerciseStatus, formatTime12h, relativeDayLabel, escapeHtml,
  showError, showSuccess, renderEmptyState, DAY_NAMES, CONDITION_OPTIONS
} from "./utils.js";

let currentUser = null;
let currentProfile = null;
let patients = [];
let exercisesLibrary = [];
let allPlans = []; // flattened across all patients, loaded on demand

const views = ["dashboard", "patients", "exercises", "plans", "progress", "notifications", "profile"];

requireAuth("therapist", async (user, profile) => {
  currentUser = user;
  currentProfile = profile;
  initHeader();
  initNav();
  initModal();
  wireStaticButtons();
  await refreshAll();
  navigateTo(location.hash.replace("#", "") || "dashboard");
});

function initHeader() {
  document.getElementById("greeting").textContent = `Hello, ${currentProfile.name}`;
  document.getElementById("profileName").textContent = currentProfile.name;
  document.getElementById("avatarInitial").textContent = (currentProfile.name || "T").charAt(0).toUpperCase();
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
  views.forEach((v) => document.getElementById(`view-${v}`).classList.toggle("hidden", v !== view));
  document.querySelectorAll("[data-view]").forEach((el) => {
    if (el.dataset.view === view) el.setAttribute("aria-current", "page");
    else el.removeAttribute("aria-current");
  });
  if (view === "profile") renderProfileView();
  if (view === "notifications") await openNotifications();
}

async function refreshAll() {
  patients = await listPatientsForTherapist(currentUser.uid);
  exercisesLibrary = await listExercisesForTherapist(currentUser.uid);
  allPlans = [];
  for (const p of patients) {
    const plans = await listPlansForPatient(p.id, false);
    allPlans.push(...plans.map((pl) => ({ ...pl, patientName: p.name })));
  }
  await renderDashboard();
  renderPatientsTable();
  renderExerciseLibrary();
  await renderPlansTable();
  populateProgressPatientSelect();
  await updateNotificationBadge();
}

// ------------------------------------------------------------
// Dashboard
// ------------------------------------------------------------

async function renderDashboard() {
  document.getElementById("statPatients").textContent = patients.length;
  document.getElementById("statActivePlans").textContent = allPlans.filter((p) => p.active).length;

  let completedToday = 0;
  let missed = 0;
  const rows = [];

  for (const patient of patients) {
    const todaysRecords = await getRecordsForPatientToday(patient.id);
    completedToday += todaysRecords.filter((r) => r.status === "completed").length;
    missed += todaysRecords.filter((r) => r.status === "missed").length;

    const history = await getRecordHistoryForPatient(patient.id, 14);
    const weekStats = computeProgressStats(filterToCurrentWeek(history));
    rows.push({ patient, rate: weekStats.completionRate });
  }

  document.getElementById("statCompletedToday").textContent = completedToday;
  document.getElementById("statMissed").textContent = missed;

  const tbody = document.querySelector("#dashboardPatientsTable tbody");
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4">No patients yet. Add your first patient to get started.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(({ patient, rate }) => `
    <tr>
      <td>${escapeHtml(patient.name)}</td>
      <td>${escapeHtml(patient.status || "active")}</td>
      <td>${rate}%</td>
      <td><button class="btn btn--ghost btn--sm view-progress-btn" data-id="${patient.id}">View Progress</button></td>
    </tr>
  `).join("");
  tbody.querySelectorAll(".view-progress-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      navigateTo("progress");
      history.replaceState(null, "", "#progress");
      document.getElementById("progressPatientSelect").value = btn.dataset.id;
      loadPatientProgress(btn.dataset.id);
    });
  });
}

// ------------------------------------------------------------
// Patients CRUD
// ------------------------------------------------------------

function renderPatientsTable() {
  const tbody = document.querySelector("#patientsTable tbody");
  if (patients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">No patients yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = patients.map((p) => `
    <tr>
      <td>${escapeHtml(p.name)}</td>
      <td>${p.age}</td>
      <td>${escapeHtml(p.caregiverName || "—")}</td>
      <td>${escapeHtml(p.status || "active")}</td>
      <td class="table-actions">
        <button class="btn btn--ghost btn--sm edit-patient-btn" data-id="${p.id}">Edit</button>
      </td>
    </tr>
  `).join("");
  tbody.querySelectorAll(".edit-patient-btn").forEach((btn) => {
    btn.addEventListener("click", () => openPatientModal(patients.find((p) => p.id === btn.dataset.id)));
  });
}

function patientFormHTML(patient = {}) {
  return `
    <form id="patientForm" class="stack">
      <div class="field-grid">
        <div class="form-field">
          <label for="pfName">Full name</label>
          <input type="text" id="pfName" value="${escapeHtml(patient.name || "")}" required />
        </div>
        <div class="form-field">
          <label for="pfAge">Age</label>
          <input type="number" id="pfAge" min="0" value="${patient.age ?? ""}" required />
        </div>
      </div>
      <div class="field-grid">
        <div class="form-field">
          <label for="pfContact">Contact information</label>
          <input type="tel" id="pfContact" value="${escapeHtml(patient.contact || "")}" />
        </div>
        <div class="form-field">
          <label for="pfEmergency">Emergency contact</label>
          <input type="tel" id="pfEmergency" value="${escapeHtml(patient.emergencyContact || "")}" />
        </div>
      </div>
      <div class="field-grid">
        <div class="form-field">
          <label for="pfCaregiver">Assigned caregiver name</label>
          <input type="text" id="pfCaregiver" value="${escapeHtml(patient.caregiverName || "")}" />
        </div>
        <div class="form-field">
          <label for="pfStatus">Status</label>
          <select id="pfStatus">
            <option value="active" ${patient.status === "active" || !patient.status ? "selected" : ""}>Active</option>
            <option value="inactive" ${patient.status === "inactive" ? "selected" : ""}>Inactive</option>
            <option value="discharged" ${patient.status === "discharged" ? "selected" : ""}>Discharged</option>
          </select>
        </div>
      </div>
      ${patient.id ? `<p class="form-hint">Patient ID: <strong>${patient.id}</strong> — share this with the patient/caregiver so they can register.</p>` : ""}
      <button type="submit" class="btn btn--primary btn--block">${patient.id ? "Save Changes" : "Add Patient"}</button>
    </form>
  `;
}

function openPatientModal(patient = {}) {
  openModal(patient.id ? "Edit Patient" : "Add Patient", patientFormHTML(patient));
  document.getElementById("patientForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById("pfName").value,
      age: document.getElementById("pfAge").value,
      contact: document.getElementById("pfContact").value,
      emergencyContact: document.getElementById("pfEmergency").value,
      caregiverName: document.getElementById("pfCaregiver").value,
      status: document.getElementById("pfStatus").value
    };
    try {
      if (patient.id) {
        await updatePatient(patient.id, data);
        showSuccess("Patient updated.");
      } else {
        await addPatient(currentUser.uid, data);
        showSuccess("Patient added.");
      }
      closeModal();
      await refreshAll();
    } catch (err) {
      showError(err.message || "Unable to save the patient. Please try again.");
    }
  });
}

// ------------------------------------------------------------
// Exercise library CRUD
// ------------------------------------------------------------

function renderExerciseLibrary() {
  const container = document.getElementById("exercisesLibraryList");
  if (exercisesLibrary.length === 0) {
    renderEmptyState(container, "No exercises yet.", "Add your first exercise to start building rehabilitation plans.");
    return;
  }
  container.innerHTML = exercisesLibrary.map((ex) => `
    <article class="card">
      <div class="row row--between">
        <h3 style="margin-bottom:0;">${escapeHtml(ex.name)}</h3>
        <span class="status-tag ${ex.active ? "status-tag--completed" : "status-tag--upcoming"}">${ex.active ? "Active" : "Inactive"}</span>
      </div>
      <p style="color:var(--color-text-muted);">${escapeHtml(ex.description || "")}</p>
      <p><strong>Target:</strong> ${ex.targetRepetitions} reps${ex.targetDuration ? ` · ${ex.targetDuration} min` : ""}</p>
      <div class="row">
        <button class="btn btn--ghost btn--sm edit-ex-btn" data-id="${ex.id}">Edit</button>
        <button class="btn btn--danger btn--sm delete-ex-btn" data-id="${ex.id}">Delete</button>
      </div>
    </article>
  `).join("");

  container.querySelectorAll(".edit-ex-btn").forEach((btn) => {
    btn.addEventListener("click", () => openExerciseModal(exercisesLibrary.find((e) => e.id === btn.dataset.id)));
  });
  container.querySelectorAll(".delete-ex-btn").forEach((btn) => {
    btn.addEventListener("click", () => confirmDeleteExercise(btn.dataset.id));
  });
}

function exerciseFormHTML(ex = {}) {
  return `
    <form id="exerciseForm" class="stack">
      <div class="form-field">
        <label for="efName">Exercise name</label>
        <input type="text" id="efName" value="${escapeHtml(ex.name || "")}" required />
      </div>
      <div class="form-field">
        <label for="efDescription">Description</label>
        <textarea id="efDescription">${escapeHtml(ex.description || "")}</textarea>
      </div>
      <div class="form-field">
        <label for="efInstructions">Instructions</label>
        <textarea id="efInstructions" required>${escapeHtml(ex.instructions || "")}</textarea>
      </div>
      <div class="field-grid">
        <div class="form-field">
          <label for="efReps">Target repetitions</label>
          <input type="number" id="efReps" min="0" value="${ex.targetRepetitions ?? 10}" />
        </div>
        <div class="form-field">
          <label for="efDuration">Target duration (min)</label>
          <input type="number" id="efDuration" min="0" value="${ex.targetDuration ?? 0}" />
        </div>
      </div>
      <div class="field-grid">
        <div class="form-field">
          <label for="efImage">Image URL (optional)</label>
          <input type="url" id="efImage" value="${escapeHtml(ex.imageUrl || "")}" />
        </div>
        <div class="form-field">
          <label for="efVideo">Video URL (optional)</label>
          <input type="url" id="efVideo" value="${escapeHtml(ex.videoUrl || "")}" />
        </div>
      </div>
      <label class="row" style="gap:0.5rem;">
        <input type="checkbox" id="efActive" ${ex.active === false ? "" : "checked"} style="width:20px; height:20px;" />
        Active
      </label>
      <button type="submit" class="btn btn--primary btn--block">${ex.id ? "Save Changes" : "Add Exercise"}</button>
    </form>
  `;
}

function openExerciseModal(ex = {}) {
  openModal(ex.id ? "Edit Exercise" : "Add Exercise", exerciseFormHTML(ex));
  document.getElementById("exerciseForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      name: document.getElementById("efName").value,
      description: document.getElementById("efDescription").value,
      instructions: document.getElementById("efInstructions").value,
      targetRepetitions: document.getElementById("efReps").value,
      targetDuration: document.getElementById("efDuration").value,
      imageUrl: document.getElementById("efImage").value,
      videoUrl: document.getElementById("efVideo").value,
      active: document.getElementById("efActive").checked
    };
    try {
      if (ex.id) {
        await updateExercise(ex.id, data);
        showSuccess("Exercise updated.");
      } else {
        await addExercise(currentUser.uid, data);
        showSuccess("Exercise added.");
      }
      closeModal();
      await refreshAll();
    } catch (err) {
      showError(err.message || "Unable to save the exercise. Please try again.");
    }
  });
}

function confirmDeleteExercise(exerciseId) {
  openModal("Delete Exercise?", `
    <p>This will permanently remove the exercise from your library. Rehabilitation plans that reference it will no longer display correctly.</p>
    <div class="row">
      <button class="btn btn--danger" id="confirmDeleteBtn">Delete</button>
      <button class="btn btn--ghost" id="cancelDeleteBtn">Cancel</button>
    </div>
  `);
  document.getElementById("confirmDeleteBtn").addEventListener("click", async () => {
    try {
      await deleteExercise(exerciseId);
      showSuccess("Exercise deleted.");
      closeModal();
      await refreshAll();
    } catch (err) {
      showError("Unable to delete the exercise. Please try again.");
    }
  });
  document.getElementById("cancelDeleteBtn").addEventListener("click", closeModal);
}

// ------------------------------------------------------------
// Rehabilitation Plan wizard
// ------------------------------------------------------------

function wireStaticButtons() {
  document.getElementById("addPatientBtn").addEventListener("click", () => openPatientModal({}));
  document.getElementById("addExerciseBtn").addEventListener("click", () => openExerciseModal({}));
  document.getElementById("createPlanBtn").addEventListener("click", openPlanWizard);
  document.getElementById("progressPatientSelect").addEventListener("change", (e) => {
    if (e.target.value) loadPatientProgress(e.target.value);
    else document.getElementById("progressPatientDetail").innerHTML = `
      <div class="empty-state"><p class="empty-state__title">Select a patient to view progress.</p></div>`;
  });
}

function openPlanWizard() {
  if (patients.length === 0) {
    showError("Add a patient before creating a rehabilitation plan.");
    return;
  }
  if (exercisesLibrary.length === 0) {
    showError("Add an exercise before creating a rehabilitation plan.");
    return;
  }
  openModal("Create Rehabilitation Plan", `
    <div class="wizard-steps">
      <span class="wizard-step active">1. Patient</span>
      <span class="wizard-step">2. Exercise</span>
      <span class="wizard-step">3. Schedule</span>
    </div>
    <form id="planForm" class="stack">
      <div class="form-field">
        <label for="planPatient">Select Patient</label>
        <select id="planPatient" required>
          <option value="">Choose a patient...</option>
          ${patients.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}
        </select>
      </div>
      <div class="form-field">
        <label for="planExercise">Select Exercise</label>
        <select id="planExercise" required>
          <option value="">Choose an exercise...</option>
          ${exercisesLibrary.map((e) => `<option value="${e.id}" data-reps="${e.targetRepetitions}" data-duration="${e.targetDuration}">${escapeHtml(e.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field-grid">
        <div class="form-field">
          <label for="planReps">Repetitions</label>
          <input type="number" id="planReps" min="0" value="10" />
        </div>
        <div class="form-field">
          <label for="planDuration">Duration (min)</label>
          <input type="number" id="planDuration" min="0" value="0" />
        </div>
      </div>
      <div class="form-field">
        <label>Scheduled Days</label>
        <div class="checkbox-group">
          ${DAY_NAMES.map((d) => `
            <label class="checkbox-pill">
              <input type="checkbox" name="planDays" value="${d}" />
              ${d.slice(0, 3)}
            </label>
          `).join("")}
        </div>
      </div>
      <div class="form-field">
        <label for="planTime">Scheduled Time</label>
        <input type="time" id="planTime" required />
      </div>
      <button type="submit" class="btn btn--primary btn--block">Save Rehabilitation Plan</button>
    </form>
  `);

  document.getElementById("planExercise").addEventListener("change", (e) => {
    const opt = e.target.selectedOptions[0];
    if (opt?.value) {
      document.getElementById("planReps").value = opt.dataset.reps || 0;
      document.getElementById("planDuration").value = opt.dataset.duration || 0;
    }
  });

  document.getElementById("planForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const scheduledDays = Array.from(document.querySelectorAll('input[name="planDays"]:checked')).map((el) => el.value);
    try {
      await createPlan(currentUser.uid, {
        patientId: document.getElementById("planPatient").value,
        exerciseId: document.getElementById("planExercise").value,
        targetRepetitions: document.getElementById("planReps").value,
        targetDuration: document.getElementById("planDuration").value,
        scheduledDays,
        scheduledTime: document.getElementById("planTime").value
      });
      showSuccess("Rehabilitation plan saved.");
      closeModal();
      await refreshAll();
    } catch (err) {
      showError(err.message || "Unable to save the plan. Please try again.");
    }
  });
}

async function renderPlansTable() {
  const tbody = document.querySelector("#plansTable tbody");
  if (allPlans.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">No rehabilitation plans yet.</td></tr>`;
    return;
  }
  const rows = [];
  for (const plan of allPlans) {
    const exercise = exercisesLibrary.find((e) => e.id === plan.exerciseId) || await getExercise(plan.exerciseId);
    rows.push(`
      <tr>
        <td>${escapeHtml(plan.patientName)}</td>
        <td>${escapeHtml(exercise?.name || "—")}</td>
        <td>${(plan.scheduledDays || []).map((d) => d.slice(0, 3)).join(", ")}</td>
        <td>${formatTime12h(plan.scheduledTime)}</td>
        <td>${plan.active ? "Active" : "Inactive"}</td>
        <td><button class="btn btn--ghost btn--sm deactivate-plan-btn" data-id="${plan.id}">${plan.active ? "Deactivate" : "Reactivate"}</button></td>
      </tr>
    `);
  }
  tbody.innerHTML = rows.join("");
  tbody.querySelectorAll(".deactivate-plan-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const plan = allPlans.find((p) => p.id === btn.dataset.id);
      try {
        await updatePlan(plan.id, { ...plan, active: !plan.active });
        showSuccess(plan.active ? "Plan deactivated." : "Plan reactivated.");
        await refreshAll();
      } catch {
        showError("Unable to update the plan. Please try again.");
      }
    });
  });
}

// ------------------------------------------------------------
// Progress view
// ------------------------------------------------------------

function populateProgressPatientSelect() {
  const select = document.getElementById("progressPatientSelect");
  const currentValue = select.value;
  select.innerHTML = `<option value="">Select a patient...</option>` +
    patients.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (currentValue) select.value = currentValue;
}

async function loadPatientProgress(patientId) {
  const container = document.getElementById("progressPatientDetail");
  container.innerHTML = `<div class="loading-state"><div class="spinner"></div><p>Loading progress...</p></div>`;

  const patient = patients.find((p) => p.id === patientId);
  const history = await getRecordHistoryForPatient(patientId, 30);
  const weekRecords = filterToCurrentWeek(history);
  const stats = computeProgressStats(weekRecords);
  const conditionLogs = await getConditionLogsForPatient(patientId, 10);

  const labelFor = (v) => CONDITION_OPTIONS.find((c) => c.value === v) || { label: v, icon: "fa-regular fa-circle" };

  container.innerHTML = `
    <div class="card section">
      <h3 style="margin-bottom:0.2rem;">${escapeHtml(patient?.name || "")}</h3>
      <p style="color:var(--color-text-muted);">Current Week · Completion ${stats.completionRate}%</p>
      <div class="progress-bar"><div class="progress-bar__fill" style="width:${stats.completionRate}%;"></div></div>
    </div>
    <div class="card-grid section">
      <div class="stat-card"><span class="stat-value">${stats.assigned}</span><span class="stat-label">Assigned</span></div>
      <div class="stat-card"><span class="stat-value">${stats.completed}</span><span class="stat-label">Completed</span></div>
      <div class="stat-card"><span class="stat-value">${stats.missed}</span><span class="stat-label">Missed</span></div>
    </div>
    <div class="card section">
      <h4>Exercise History</h4>
      <ul class="history-list">
        ${history.length === 0 ? "<li>No records yet.</li>" : history.slice(0, 12).map((r) => `
          <li class="history-item">
            <span class="status-tag status-tag--${r.status === "completed" ? "completed" : "missed"}"><i class="fa-solid ${r.status === "completed" ? "fa-circle-check" : "fa-triangle-exclamation"}" aria-hidden="true"></i></span>
            <div>
              <div>${relativeDayLabel(r.date)}</div>
              <div class="meta">${r.status === "completed" ? `${r.completedRepetitions} reps · ${r.completedDuration} min · ${escapeHtml(r.difficulty || "")}` : "Missed"}</div>
            </div>
          </li>
        `).join("")}
      </ul>
    </div>
    <div class="card">
      <h4>Condition Logs</h4>
      <ul class="history-list">
        ${conditionLogs.length === 0 ? "<li>No condition logs yet.</li>" : conditionLogs.map((log) => {
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
        }).join("")}
      </ul>
    </div>
  `;
}

// ------------------------------------------------------------
// Notifications
// ------------------------------------------------------------

async function renderNotifications() {
  const list = document.getElementById("notificationsList");
  if (patients.length === 0) {
    renderEmptyState(list, "No notifications yet.");
    return;
  }
  let all = [];
  for (const p of patients) {
    const notes = await listNotificationsForPatient(p.id, 10);
    all.push(...notes.map((n) => ({ ...n, patientName: p.name })));
  }
  all.sort((a, b) => {
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  if (all.length === 0) {
    renderEmptyState(list, "No notifications yet.");
    return;
  }
  const iconFor = { reminder: "fa-regular fa-bell", missed: "fa-solid fa-triangle-exclamation", new_plan: "fa-solid fa-clipboard-list", schedule_update: "fa-regular fa-calendar" };
  list.innerHTML = all.slice(0, 30).map((n) => `
    <li class="notification-item ${n.read ? "" : "unread"}">
      <span class="n-icon" aria-hidden="true"><i class="${iconFor[n.type] || "fa-regular fa-bell"}"></i></span>
      <div>
        <div><strong>${escapeHtml(n.patientName)}</strong> — ${escapeHtml(n.title)}</div>
        <div>${escapeHtml(n.message)}</div>
      </div>
    </li>
  `).join("");
}

async function updateNotificationBadge() {
  const unreadCounts = await Promise.all(patients.map((patient) => countUnreadNotifications(patient.id)));
  const unread = unreadCounts.reduce((total, count) => total + count, 0);
  const badge = document.getElementById("notifBadge");
  badge.textContent = String(unread);
  badge.classList.toggle("hidden", unread === 0);
}

/** Viewing the therapist notification panel acknowledges notifications for patients in their care. */
async function openNotifications() {
  await markNotificationsReadForPatients(patients.map((patient) => patient.id));
  const badge = document.getElementById("notifBadge");
  badge.textContent = "0";
  badge.classList.add("hidden");
  await renderNotifications();
}

// ------------------------------------------------------------
// Profile
// ------------------------------------------------------------

function renderProfileView() {
  const card = document.getElementById("profileCard");
  card.innerHTML = `
    <div><strong>Name:</strong> ${escapeHtml(currentProfile.name)}</div>
    <div><strong>Email:</strong> ${escapeHtml(currentProfile.email)}</div>
    <div><strong>Role:</strong> Healthcare Worker</div>
    <div><strong>Patients:</strong> ${patients.length}</div>
  `;
}

// ------------------------------------------------------------
// Generic modal
// ------------------------------------------------------------

function initModal() {
  document.getElementById("closeModal").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
}

function openModal(title, bodyHTML) {
  document.getElementById("modalTitle").textContent = title;
  document.getElementById("modalBody").innerHTML = bodyHTML;
  document.getElementById("modalBackdrop").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.add("hidden");
  document.getElementById("modalBody").innerHTML = "";
}
