import Image from "next/image";
import Link from "next/link";

const benefits = [
  {
    icon: "◫",
    title: "Structured Rehabilitation",
    description: "Keep exercises organized and scheduled, so every session has clear instructions and targets.",
  },
  {
    icon: "✓",
    title: "Easy Activity Tracking",
    description: "Record completed rehabilitation activities in a few taps, right beside the patient.",
  },
  {
    icon: "↗",
    title: "Progress Monitoring",
    description: "Track activity in one place, so patients, caregivers, and therapists share the same picture.",
  },
];

function Brand() {
  return (
    <Link className="brand" href="/" aria-label="RehabTrack home">
      <span className="brand-mark" aria-hidden="true">R</span>
      RehabTrack
    </Link>
  );
}

export default function Home() {
  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="site-header">
        <Brand />
        <nav aria-label="Main navigation" className="row">
          <Link className="btn btn--ghost" href="/login">Log in</Link>
        </nav>
      </header>

      <main id="main-content" tabIndex="-1">
        <section className="hero">
          <div className="hero-copy">
            <p className="panel-kicker">CARE THAT MOVES WITH YOU</p>
            <h1>Rehabilitation monitoring made simpler.</h1>
            <p className="lede">Helping stroke patients, caregivers, and healthcare workers stay connected throughout the rehabilitation process.</p>
            <div className="hero-actions">
              <Link className="btn btn--primary" href="/login?mode=register">Get started</Link>
              <Link className="btn btn--secondary" href="/login">I already have an account</Link>
            </div>
          </div>
          <div className="hero-media">
            <div className="hero-image-frame">
              <Image className="hero-image" src="/assets/images/hero.jpg" alt="Caregiver supporting a patient through a rehabilitation exercise" width={1200} height={900} priority />
            </div>
          </div>
        </section>

        <section className="benefits" aria-label="How RehabTrack helps">
          <article className="hero-panel benefit-panel">
            <p className="panel-kicker">TODAY&apos;S PLAN</p>
            <h2>Small steps, clear progress.</h2>
            <div className="mini-card"><span className="dot" />Arm Raise <span className="mini-card-meta">9:00 AM</span></div>
            <div className="mini-card"><span className="dot dot--success" />Hand Grip <span className="mini-card-meta">Completed</span></div>
            <div className="mini-card"><span className="dot dot--blue" />Weekly progress <span className="mini-card-meta">86%</span></div>
          </article>
          {benefits.map((benefit) => (
            <article className="benefit" key={benefit.title}>
              <div className="benefit-heading">
                <span className="benefit-icon" aria-hidden="true">{benefit.icon}</span>
                <h2>{benefit.title}</h2>
              </div>
              <p>{benefit.description}</p>
            </article>
          ))}
        </section>

        <div className="container">
          <p className="disclaimer">RehabTrack is a rehabilitation monitoring and record-keeping tool. It does not provide medical diagnosis or replace professional medical advice.</p>
        </div>
      </main>

      <footer className="site-footer">
        <p>© 2026 RehabTrack. Built for care teams and the people they support.</p>
      </footer>
    </>
  );
}
