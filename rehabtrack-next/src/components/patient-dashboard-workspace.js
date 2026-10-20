"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DashboardShell from "@/components/dashboard-shell";
import HealthAssistant from "@/components/health-assistant";
import { createClient } from "@/lib/supabase/client";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const CONDITIONS = [
  { value: "great", label: "Great", icon: "😊" },
  { value: "good", label: "Good", icon: "🙂" },
  { value: "okay", label: "Okay", icon: "😐" },
  { value: "tired", label: "Tired", icon: "😔" },
  { value: "unwell", label: "Unwell", icon: "🤒" },
];
const DIFFICULTIES = ["easy", "moderate", "difficult"];
const navItems = [
  { id: "dashboard", icon: "⌂", label: "Dashboard" },
  { id: "exercises", icon: "↗", label: "My exercises" },
  { id: "progress", icon: "▥", label: "Progress" },
  { id: "condition", icon: "♡", label: "Condition history" },
  { id: "notifications", icon: "◉", label: "Notifications" },
  { id: "profile", icon: "○", label: "Profile" },
];

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value, now) {
  const date = new Date(value);
  if (!now || Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  const dateKey = localDateKey(date);
  const todayKey = localDateKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dateKey === todayKey) return "Today";
  if (dateKey === localDateKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatTime(value) {
  const [hourText, minuteText] = String(value || "").split(":");
  if (hourText === undefined || minuteText === undefined) return "";
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minuteText} ${suffix}`;
}

function getPlanRecord(plan, records, now) {
  if (!now) return null;
  const today = localDateKey(now);
  return records.find((record) => record.plan_id === plan.id && localDateKey(new Date(record.completed_at)) === today) || null;
}

function getPlanStatus(plan, records, now) {
  if (!now || !(plan.scheduled_days || []).includes(DAYS[now.getDay()])) return "upcoming";
  const record = getPlanRecord(plan, records, now);
  if (record) return record.status;
  const [hour, minute] = String(plan.scheduled_time || "00:00").split(":").map(Number);
  const scheduled = new Date(now);
  scheduled.setHours(hour || 0, minute || 0, 0, 0);
  const difference = now.getTime() - scheduled.getTime();
  if (difference < -30 * 60 * 1000) return "upcoming";
  if (difference <= 30 * 60 * 1000) return "due";
  return "missed";
}

function statusLabel(status) {
  return { upcoming: "Upcoming", due: "Due now", completed: "Completed", missed: "Missed" }[status] || "Upcoming";
}

function errorText(error, fallback) {
  const fields = [error?.message, error?.details, error?.hint, error?.code ? `Error code: ${error.code}` : ""];
  const message = [...new Set(fields.filter((field) => typeof field === "string" && field.trim()))].join(" ");
  return message || fallback;
}

function getExercise(plan) {
  return Array.isArray(plan.exercise) ? plan.exercise[0] : plan.exercise;
}

function EmptyState({ children }) {
  return <div className="card empty-state"><p>{children}</p></div>;
}

function WeeklyChart({ records, now }) {
  if (!now) return <div className="card empty-state"><p>Loading this week&apos;s activity…</p></div>;
  const start = new Date(now);
  start.setDate(now.getDate() - now.getDay());
  start.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const key = localDateKey(date);
    const dayRecords = records.filter((record) => localDateKey(new Date(record.completed_at)) === key);
    return { key, label: date.toLocaleDateString(undefined, { weekday: "short" }), completed: dayRecords.filter((record) => record.status === "completed").length, missed: dayRecords.filter((record) => record.status === "missed").length };
  });
  const max = Math.max(1, ...days.map((day) => day.completed + day.missed));
  return <div className="bar-chart" aria-label="Daily completed and missed activity this week">{days.map((day) => {
    const totalHeight = (day.completed + day.missed) / max * 100;
    const completedHeight = day.completed / max * 100;
    const missedHeight = day.missed / max * 100;
    return <div className="bar-col" key={day.key}>
      <div className="patient-chart-stack" title={`${day.completed} completed, ${day.missed} missed`}>
        {day.missed > 0 && <span className="patient-chart-bar patient-chart-bar--missed" style={{ height: `${missedHeight}%` }} />}
        {day.completed > 0 && <span className="patient-chart-bar" style={{ height: `${completedHeight}%` }} />}
        {day.completed + day.missed === 0 && <span className="patient-chart-empty" style={{ height: `${Math.max(4, totalHeight)}%` }} />}
      </div>
      <span className="bar-label">{day.label}</span>
    </div>;
  })}</div>;
}

function ActivityList({ records, plans, now }) {
  if (!records.length) return <EmptyState>No activity recorded yet. Completed and missed exercises will appear here.</EmptyState>;
  return <ul className="history-list">{records.slice(0, 10).map((record) => <li className="history-item" key={record.id}>
    <span className={`status-tag status-tag--${record.status}`}>{record.status === "completed" ? "✓" : "!"}</span>
    <div><strong>{getExercise(plans.find((plan) => plan.id === record.plan_id) || {})?.name || "Rehabilitation exercise"}</strong><div className="meta">{formatDate(record.completed_at, now)} · {record.status === "completed" ? `${record.repetitions} reps · ${record.duration} min` : "Marked missed"}</div></div>
  </li>)}</ul>;
}

export default function PatientDashboardWorkspace({
  profile,
  patient,
  plans = [],
  initialRecords = [],
  initialConditionLogs = [],
  initialNotifications = [],
  loadError = "",
  linkForm = null,
}) {
  const [records, setRecords] = useState(initialRecords);
  const [conditionLogs, setConditionLogs] = useState(initialConditionLogs);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [now, setNow] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [modalStep, setModalStep] = useState("exercise");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const displayName = profile?.full_name || "Patient";
  const supabase = useMemo(() => profile ? createClient() : null, [profile]);
  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  useEffect(() => {
    setNow(new Date());
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const generateScheduleNotifications = useCallback(async (recordList) => {
    if (!patient || !profile || !now) return;
    const todayKey = localDateKey(now);
    const todayPlans = plans.filter((plan) => (plan.scheduled_days || []).includes(DAYS[now.getDay()]));
    const todayNotifications = notifications.filter((notification) => notification.created_at && localDateKey(new Date(notification.created_at)) === todayKey);
    const sent = new Set(todayNotifications.map((notification) => `${notification.type}:${notification.message}`));
    const candidates = [];
    for (const plan of todayPlans) {
      const status = getPlanStatus(plan, recordList, now);
      if (status !== "due" && status !== "missed") continue;
      const exerciseName = getExercise(plan)?.name || "Your exercise";
      const time = formatTime(plan.scheduled_time);
      const type = status === "due" ? "reminder" : "missed";
      const message = status === "due" ? `${exerciseName} is scheduled for ${time}.` : `The ${exerciseName} exercise scheduled for today has not been recorded.`;
      if (sent.has(`${type}:${message}`)) continue;
      sent.add(`${type}:${message}`);
      candidates.push({
        user_id: profile.id,
        patient_id: patient.id,
        type,
        title: status === "due" ? "Rehabilitation reminder" : "Missed activity",
        message,
      });
    }
    if (!candidates.length) return;
    const { data, error } = await supabase.from("notifications").insert(candidates).select("id, type, title, message, read_at, created_at");
    if (error) {
      setFeedback(errorText(error, "A reminder could not be saved."));
      return;
    }
    setNotifications((current) => [...(data || []), ...current]);
  }, [now, notifications, patient, plans, profile, supabase]);

  useEffect(() => {
    if (!now) return;
    void generateScheduleNotifications(records);
  }, [generateScheduleNotifications, now, records]);

  const todayPlans = useMemo(() => now ? plans.filter((plan) => (plan.scheduled_days || []).includes(DAYS[now.getDay()])) : [], [now, plans]);
  const todayRecords = useMemo(() => now ? todayPlans.map((plan) => getPlanRecord(plan, records, now)).filter(Boolean) : [], [now, records, todayPlans]);
  const currentWeekRecords = useMemo(() => {
    if (!now) return [];
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0, 0, 0, 0);
    return records.filter((record) => new Date(record.completed_at) >= start && new Date(record.completed_at) <= now);
  }, [now, records]);
  const completedThisWeek = currentWeekRecords.filter((record) => record.status === "completed").length;
  const missedThisWeek = currentWeekRecords.filter((record) => record.status === "missed").length;
  const weeklyRate = currentWeekRecords.length ? Math.round(completedThisWeek / currentWeekRecords.length * 100) : 0;
  const todayCompleted = todayRecords.filter((record) => record.status === "completed").length;
  const todayRemaining = Math.max(0, todayPlans.length - todayRecords.length);

  async function handlePaneChange(id) {
    if (id !== "notifications" || !profile) return;
    const unreadIds = notifications.filter((notification) => !notification.read_at && notification.id).map((notification) => notification.id);
    if (!unreadIds.length) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: readAt }).in("id", unreadIds);
    if (error) {
      setFeedback(errorText(error, "Notifications could not be marked as read."));
      return;
    }
    setNotifications((current) => current.map((notification) => unreadIds.includes(notification.id) ? { ...notification, read_at: readAt } : notification));
  }

  function openPlan(plan) {
    setSelectedPlan(plan);
    setModalStep("exercise");
    setFeedback("");
  }

  async function saveActivity(event, status) {
    event.preventDefault();
    if (!patient || !profile || !selectedPlan) return;
    setBusy(true);
    setFeedback("");
    const formElement = event.currentTarget instanceof HTMLFormElement ? event.currentTarget : event.currentTarget.form;
    const form = new FormData(formElement);
    const exercise = getExercise(selectedPlan);
    const insert = {
      patient_id: patient.id,
      plan_id: selectedPlan.id,
      exercise_id: exercise?.id || null,
      logged_by: profile.id,
      recorded_as: String(form.get("recorded_as") || "patient"),
      status,
      repetitions: status === "completed" ? Number(form.get("repetitions") || 0) : 0,
      duration: status === "completed" ? Number(form.get("duration") || 0) : 0,
      difficulty: status === "completed" ? String(form.get("difficulty") || "moderate") : null,
      notes: status === "completed" ? String(form.get("activity_note") || "").trim() : "",
    };
    try {
      const { data, error } = await supabase.from("exercise_records").insert(insert)
        .select("id, plan_id, exercise_id, status, repetitions, duration, notes, difficulty, recorded_as, completed_at")
        .single();
      if (error) throw error;
      const nextRecords = [data, ...records];
      setRecords(nextRecords);
      await generateScheduleNotifications(nextRecords);
      setModalStep("condition");
    } catch (error) {
      setFeedback(errorText(error, "Activity could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function saveCondition(event) {
    event.preventDefault();
    if (!patient || !profile) return;
    setBusy(true);
    setFeedback("");
    const form = new FormData(event.currentTarget);
    const condition = String(form.get("feeling") || "");
    const note = String(form.get("condition_note") || "").trim();
    const recordedAs = String(form.get("recorded_as") || "patient");
    try {
      const { data, error } = await supabase.from("condition_logs").insert({
        patient_id: patient.id,
        logged_by: profile.id,
        feeling: condition,
        notes: note,
        recorded_as: recordedAs,
      }).select("id, feeling, notes, recorded_as, created_at").single();
      if (error) throw error;
      setConditionLogs((current) => [data, ...current]);
      setSelectedPlan(null);
      setModalStep("exercise");
    } catch (error) {
      setFeedback(errorText(error, "Your check-in could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  async function markNotificationRead(notification) {
    if (notification.read_at || !notification.id) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("notifications").update({ read_at: readAt }).eq("id", notification.id);
    if (error) {
      setFeedback(errorText(error, "The notification could not be updated."));
      return;
    }
    setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read_at: readAt } : item));
  }

  function planCard(plan) {
    const exercise = getExercise(plan);
    const status = getPlanStatus(plan, records, now);
    const time = formatTime(plan.scheduled_time);
    const record = getPlanRecord(plan, records, now);
    return <article className={`exercise-card exercise-card--${status}`} key={plan.id}>
      <span className={`status-tag status-tag--${status}`}>{statusLabel(status)}</span>
      <h3>{exercise?.name || "Assigned exercise"}</h3>
      <p className="patient-plan-target">{plan.target_repetitions ? `${plan.target_repetitions} repetitions` : ""}{plan.target_repetitions && plan.target_duration ? " · " : ""}{plan.target_duration ? `${plan.target_duration} min` : ""}</p>
      <p className="patient-plan-time">{(plan.scheduled_days || []).join(", ")}{time ? ` · ${time}` : ""}</p>
      {record && <p className="patient-plan-record">{record.status === "completed" ? `Recorded ${record.repetitions} reps · ${record.duration} min` : "You marked this exercise as missed."}</p>}
      <button type="button" className="btn btn--primary btn--sm view-exercise-btn" onClick={() => openPlan(plan)}>{record ? "View / check in" : "View exercise"}</button>
    </article>;
  }

  function linkNotice() {
    return <div className="stack"><EmptyState>Link your patient record to see assigned exercises, reminders, and progress.</EmptyState>{linkForm}</div>;
  }

  const dashboardPane = <section id="dashboard" className="section" aria-labelledby="today-heading">
    <div className="card-grid patient-stats">
      <div className="stat-card"><span className="stat-value">{todayPlans.length}</span><span className="stat-label">Today&apos;s exercises</span></div>
      <div className="stat-card stat-card--success"><span className="stat-value">{todayCompleted}</span><span className="stat-label">Completed</span></div>
      <div className="stat-card stat-card--warning"><span className="stat-value">{todayRemaining}</span><span className="stat-label">Remaining</span></div>
      <div className="stat-card stat-card--blue"><span className="stat-value">{weeklyRate}%</span><span className="stat-label">Weekly progress</span></div>
    </div>
    <div className="section-header"><div><h2 id="today-heading">Today&apos;s rehabilitation</h2><p>{now ? now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }) : "Your scheduled exercises and reminders."}</p></div></div>
    {loadError && <p className="workspace-feedback workspace-feedback--error" role="alert">Could not load your care data: {loadError}</p>}
    {!patient ? linkNotice() : todayPlans.length ? <div className="card-grid">{todayPlans.map(planCard)}</div> : <EmptyState>No exercises scheduled for today. Check My exercises for your full rehabilitation plan.</EmptyState>}
  </section>;

  const allExercisesPane = <section id="exercises" className="section" aria-labelledby="exercises-heading">
    <div className="section-header"><div><h2 id="exercises-heading">My exercises</h2><p>Everything currently assigned to your rehabilitation plan.</p></div></div>
    {!patient ? linkNotice() : plans.length ? <div className="card-grid">{plans.map(planCard)}</div> : <EmptyState>No exercises assigned yet. Your healthcare worker will add exercises to your plan.</EmptyState>}
  </section>;

  const progressPane = <section id="progress" className="section" aria-labelledby="progress-heading">
    <div className="section-header"><div><h2 id="progress-heading">Your progress</h2><p>Activity recorded during the current week.</p></div></div>
    {!patient ? linkNotice() : <>
      <div className="card-grid patient-stats">
        <div className="stat-card"><span className="stat-value">{currentWeekRecords.length}</span><span className="stat-label">Recorded activities</span></div>
        <div className="stat-card stat-card--success"><span className="stat-value">{completedThisWeek}</span><span className="stat-label">Completed</span></div>
        <div className="stat-card stat-card--warning"><span className="stat-value">{missedThisWeek}</span><span className="stat-label">Missed</span></div>
        <div className="stat-card stat-card--blue"><span className="stat-value">{weeklyRate}%</span><span className="stat-label">Completion rate</span></div>
      </div>
      <div className="card section"><h3>This week</h3><WeeklyChart records={records} now={now} /><p className="chart-caption"><span className="patient-legend patient-legend--done" /> Completed <span className="patient-legend patient-legend--missed" /> Missed</p></div>
      <div className="card section"><h3>Recent activity</h3><ActivityList records={records} plans={plans} now={now} /></div>
    </>}
  </section>;

  const conditionPane = <section id="condition" className="section" aria-labelledby="condition-heading">
    <div className="section-header"><div><h2 id="condition-heading">Condition history</h2><p>Check-ins recorded after rehabilitation sessions.</p></div></div>
    {!patient ? linkNotice() : conditionLogs.length ? <div className="card"><ul className="history-list">{conditionLogs.map((log) => {
      const feeling = CONDITIONS.find((option) => option.value === log.feeling);
      return <li className="history-item" key={log.id}><span className="emoji" aria-hidden="true">{feeling?.icon || "♡"}</span><div><strong>{feeling?.label || log.feeling}</strong><div className="meta">{formatDate(log.created_at, now)}{log.recorded_as ? ` · Recorded by ${log.recorded_as}` : ""}</div>{log.notes && <p className="patient-history-note">{log.notes}</p>}</div></li>;
    })}</ul></div> : <EmptyState>No condition check-ins yet. After recording an exercise, you can tell your care team how you felt.</EmptyState>}
  </section>;

  const notificationsPane = <section id="notifications" className="section" aria-labelledby="notifications-heading">
    <div className="section-header"><div><h2 id="notifications-heading">Notifications</h2><p>Plan updates, scheduled reminders, and missed activity notices.</p></div></div>
    {!patient ? linkNotice() : notifications.length ? <div className="card patient-notifications"><ul className="notification-list">{notifications.map((notification) => <li className={`notification-item ${notification.read_at ? "" : "unread"}`} key={notification.id || `${notification.type}-${notification.message}`}>
      <span className="n-icon" aria-hidden="true">{notification.type === "missed" ? "!" : notification.type === "new_plan" ? "▤" : "◉"}</span>
      <div className="patient-notification-body"><strong>{notification.title}</strong><p>{notification.message}</p><span className="n-time">{formatDate(notification.created_at, now)}</span></div>
      {!notification.read_at && notification.id && <button type="button" className="btn btn--ghost btn--sm" onClick={() => markNotificationRead(notification)}>Mark read</button>}
    </li>)}</ul></div> : <EmptyState>No notifications yet. Reminders appear when an exercise is due or missed.</EmptyState>}
  </section>;

  const profilePane = <section id="profile" className="section" aria-labelledby="profile-heading">
    <div className="section-header"><div><h2 id="profile-heading">Profile</h2><p>Account and care team details.</p></div></div>
    {patient ? <div className="card profile-preview"><div className="avatar avatar--large">{patient.full_name.charAt(0).toUpperCase()}</div><div><h3>{patient.full_name}</h3><p>Patient code: {patient.patient_code}</p><p>{patient.age == null ? "Age not provided" : `${patient.age} years old`}{patient.caregiver_name ? ` · Caregiver: ${patient.caregiver_name}` : ""}</p><p>Account: {displayName}</p></div></div> : <div className="stack"><EmptyState>Your account is not linked to a patient record yet.</EmptyState>{linkForm}</div>}
  </section>;

  const panes = { dashboard: dashboardPane, exercises: allExercisesPane, progress: progressPane, condition: conditionPane, notifications: notificationsPane, profile: profilePane };
  const currentRecord = selectedPlan ? getPlanRecord(selectedPlan, records, now) : null;
  const selectedExercise = selectedPlan ? getExercise(selectedPlan) : null;

  return <>
    <DashboardShell
      authenticated={Boolean(profile)}
      displayName={displayName}
      eyebrow="PATIENT SPACE"
      intro="Hello"
      summary="Your rehabilitation information at a glance."
      roleLabel="Patient / Caregiver"
      navItems={navItems}
      panes={panes}
      notificationCount={unreadCount}
      onPaneChange={handlePaneChange}
    />
    {profile && <HealthAssistant />}
    {feedback && <div className="patient-toast workspace-feedback workspace-feedback--error" role="alert">{feedback}<button type="button" aria-label="Dismiss message" onClick={() => setFeedback("")}>×</button></div>}
    {selectedPlan && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setSelectedPlan(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="patient-exercise-title">
        <header className="modal-header"><h2 id="patient-exercise-title">{modalStep === "condition" ? "How did you feel today?" : selectedExercise?.name || "Exercise"}</h2><button type="button" className="modal-close" aria-label="Close" onClick={() => !busy && setSelectedPlan(null)}>×</button></header>
        {modalStep === "condition" ? <form className="stack" onSubmit={saveCondition}>
          <p>Share how the session felt so your healthcare worker can follow your recovery.</p>
          <fieldset className="patient-condition-options"><legend>Choose how you feel</legend>{CONDITIONS.map((condition, index) => <label className="choice-card" key={condition.value}><input type="radio" name="feeling" value={condition.value} defaultChecked={index === 0} required /><span aria-hidden="true">{condition.icon}</span>{condition.label}</label>)}</fieldset>
          <div className="form-field"><label htmlFor="condition-note">Note (optional)</label><textarea id="condition-note" name="condition_note" rows="3" placeholder="Anything worth mentioning to your healthcare worker?" /></div>
          <div className="form-field"><label htmlFor="condition-recorded-as">Recorded by</label><select id="condition-recorded-as" name="recorded_as" defaultValue="patient"><option value="patient">Patient</option><option value="caregiver">Caregiver</option></select></div>
          <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save check-in"}</button>
        </form> : <>
          {selectedExercise?.image_url && <img className="patient-exercise-image" src={selectedExercise.image_url} alt={selectedExercise.name} />}
          {selectedExercise?.description && <p>{selectedExercise.description}</p>}
          {selectedExercise?.instructions && <p><strong>Instructions:</strong> {selectedExercise.instructions}</p>}
          {selectedExercise?.video_url && <p><a href={selectedExercise.video_url} target="_blank" rel="noopener noreferrer">Watch exercise demonstration</a></p>}
          <p><strong>Target:</strong> {selectedPlan.target_repetitions} repetitions{selectedPlan.target_duration ? ` · ${selectedPlan.target_duration} min` : ""}</p>
          <p><strong>Scheduled:</strong> {(selectedPlan.scheduled_days || []).join(", ")} at {formatTime(selectedPlan.scheduled_time)}</p>
          {currentRecord ? <div className="card patient-record-summary"><strong>{currentRecord.status === "completed" ? "Activity recorded today" : "Marked as missed today"}</strong>{currentRecord.status === "completed" && <p>{currentRecord.repetitions} repetitions · {currentRecord.duration} min{currentRecord.difficulty ? ` · ${currentRecord.difficulty}` : ""}</p>}<p>You can add a condition check-in below.</p></div> : <form className="stack" onSubmit={(event) => saveActivity(event, "completed")}>
            <h3>Record activity</h3>
            <div className="field-grid"><div className="form-field"><label htmlFor="completed-repetitions">Repetitions completed</label><input id="completed-repetitions" name="repetitions" type="number" min="0" defaultValue={selectedPlan.target_repetitions || 0} required /></div><div className="form-field"><label htmlFor="completed-duration">Duration completed (min)</label><input id="completed-duration" name="duration" type="number" min="0" defaultValue={selectedPlan.target_duration || 0} required /></div></div>
            <fieldset className="patient-radio-group"><legend>How difficult was the exercise?</legend>{DIFFICULTIES.map((difficulty, index) => <label className="checkbox-pill" key={difficulty}><input type="radio" name="difficulty" value={difficulty} defaultChecked={index === 1} required />{difficulty[0].toUpperCase() + difficulty.slice(1)}</label>)}</fieldset>
            <div className="form-field"><label htmlFor="activity-note">Activity note (optional)</label><textarea id="activity-note" name="activity_note" rows="2" /></div>
            <div className="form-field"><label htmlFor="activity-recorded-as">Recorded by</label><select id="activity-recorded-as" name="recorded_as" defaultValue="patient"><option value="patient">Patient</option><option value="caregiver">Caregiver</option></select></div>
            <div className="patient-modal-actions"><button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Mark as completed"}</button><button className="btn btn--danger" type="button" disabled={busy} onClick={(event) => saveActivity(event, "missed")}>Mark as missed</button></div>
          </form>}
          {currentRecord && <form className="stack patient-condition-followup" onSubmit={saveCondition}>
            <h3>How did you feel today?</h3>
            <fieldset className="patient-condition-options"><legend>Choose how you feel</legend>{CONDITIONS.map((condition, index) => <label className="choice-card" key={condition.value}><input type="radio" name="feeling" value={condition.value} defaultChecked={index === 0} required /><span aria-hidden="true">{condition.icon}</span>{condition.label}</label>)}</fieldset>
            <div className="form-field"><label htmlFor="condition-note-existing">Note (optional)</label><textarea id="condition-note-existing" name="condition_note" rows="2" /></div>
            <div className="form-field"><label htmlFor="condition-recorded-as-existing">Recorded by</label><select id="condition-recorded-as-existing" name="recorded_as" defaultValue="patient"><option value="patient">Patient</option><option value="caregiver">Caregiver</option></select></div>
            <button className="btn btn--primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save check-in"}</button>
          </form>}
        </>}
      </section>
    </div>}
  </>;
}
