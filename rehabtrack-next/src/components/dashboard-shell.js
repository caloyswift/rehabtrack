"use client";

import Link from "next/link";
import { useState } from "react";
import SignOutButton from "@/components/sign-out-button";

function Brand() {
  return <Link className="brand dashboard-brand" href="/"><span className="brand-mark" aria-hidden="true">R</span><span className="brand-name">RehabTrack</span></Link>;
}

function NavIcon({ id }) {
  const shapes = {
    dashboard: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    overview: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    patients: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.6V20" /></>,
    exercises: <><path d="M6 4v16M18 4v16M3 8v8M21 8v8M6 12h12" /></>,
    plans: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2h6v2M8 10h8M8 14h3m2 2 1.5 1.5L18 14" /></>,
    activity: <><path d="M3 3v18h18" /><path d="m7 14 4-4 3 3 6-7" /><path d="M16 6h4v4" /></>,
    progress: <><path d="M4 19V5M10 19v-8M16 19V8M22 19H2" /></>,
    condition: <><path d="M20.8 8.6c0 5.2-8.8 11-8.8 11s-8.8-5.8-8.8-11A4.6 4.6 0 0 1 12 6a4.6 4.6 0 0 1 8.8 2.6Z" /><path d="M3 12h4l2-3 3 6 2-3h7" /></>,
    notifications: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  };

  return <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[id] || shapes.dashboard}</svg>;
}

export default function DashboardShell({
  authenticated,
  displayName,
  eyebrow,
  intro,
  summary,
  roleLabel,
  navItems,
  panes,
  notificationCount = 0,
  onPaneChange,
}) {
  const [activeId, setActiveId] = useState(navItems[0].id);
  const activePane = panes[activeId] || panes[navItems[0].id];
  const initial = displayName.charAt(0).toUpperCase();

  function selectPane(id) {
    setActiveId(id);
    onPaneChange?.(id);
  }

  function renderNavigationItems(mobile = false) {
    return navItems.slice(0, mobile ? 5 : navItems.length).map((item) => (
      <li key={item.id}>
        <button
          type="button"
          aria-current={activeId === item.id ? "page" : undefined}
          onClick={() => selectPane(item.id)}
        >
          {mobile ? <><NavIcon id={item.id} /><span>{item.label.split(" ")[0]}</span>{item.id === "notifications" && notificationCount > 0 && <span className="nav-badge" aria-label={`${notificationCount} unread`}>{notificationCount}</span>}</> : <><span className="icon"><NavIcon id={item.id} /></span>{item.label}{item.id === "notifications" && notificationCount > 0 && <span className="nav-badge" aria-label={`${notificationCount} unread`}>{notificationCount}</span>}</>}
        </button>
      </li>
    ));
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Brand />
        <p className="role-label">{roleLabel}</p>
        <nav aria-label={`${roleLabel} navigation`}>
          <ul className="nav-list">{renderNavigationItems()}</ul>
        </nav>
        <div className="sidebar-footer">
          <p className="sidebar-footer__label">Account</p>
          {authenticated ? <SignOutButton /> : <Link className="btn btn--ghost btn--block" href="/login">Sign in</Link>}
        </div>
      </aside>
      <main className="main-content">
        <div className="container dashboard-container">
          <header className="topbar">
            <div><p className="topbar-eyebrow">{eyebrow}</p><h1 className="dashboard-heading">{intro}, {displayName}</h1><p className="today-date">{summary}</p></div>
            <div className="topbar-actions">{onPaneChange && <button type="button" className="icon-btn" aria-label={`Notifications${notificationCount ? `, ${notificationCount} unread` : ""}`} onClick={() => selectPane("notifications")}><NavIcon id="notifications" />{notificationCount > 0 && <span className="badge">{notificationCount}</span>}</button>}<div className="profile-chip"><span className="avatar">{initial}</span><span>{displayName}</span></div></div>
          </header>
          <div className="dashboard-pane" key={activeId} role="region" aria-label={navItems.find((item) => item.id === activeId)?.label}>
            {activePane}
          </div>
          <p className="disclaimer disclaimer-footer">RehabTrack is a rehabilitation monitoring and record-keeping tool. It does not provide medical diagnosis or replace professional medical advice.</p>
        </div>
      </main>
      <nav className="bottom-nav" aria-label={`${roleLabel} navigation`}>
        <ul>{renderNavigationItems(true)}</ul>
      </nav>
    </div>
  );
}
