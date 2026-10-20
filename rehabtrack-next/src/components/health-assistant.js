"use client";

import { useEffect, useRef, useState } from "react";

const welcomeMessage = {
  role: "assistant",
  content: "Hi! I can answer general health and stroke rehabilitation questions. I can’t diagnose or give personal treatment advice.",
};

export default function HealthAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([welcomeMessage]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef(null);
  const conversationRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    inputRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busy) setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, open]);

  useEffect(() => {
    if (open && conversationRef.current) {
      conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function handleSubmit(event) {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;

    const userMessage = { role: "user", content: text };
    const conversation = [...messages, userMessage].slice(-8);
    setMessages(conversation);
    setQuestion("");
    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The assistant could not answer. Please try again.");
      setMessages((current) => [...current, { role: "assistant", content: result.answer }].slice(-8));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The assistant could not answer. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="health-assistant">
      {open && (
        <section className="health-assistant-panel" aria-label="Health information assistant">
          <header className="health-assistant-header">
            <div><span className="health-assistant-eyebrow">REHABTRACK</span><h2>Health assistant</h2></div>
            <button className="health-assistant-close" type="button" aria-label="Close assistant" onClick={() => !busy && setOpen(false)}>×</button>
          </header>
          <p className="health-assistant-notice">General information only. Don’t share your name, contact details, or personal medical records.</p>
          <div className="health-assistant-messages" ref={conversationRef} aria-live="polite" aria-relevant="additions text">
            {messages.map((message, index) => (
              <p className={`health-assistant-message health-assistant-message--${message.role}`} key={`${index}-${message.role}`}>
                {message.content}
              </p>
            ))}
            {busy && <p className="health-assistant-thinking" role="status">Thinking…</p>}
          </div>
          {error && <p className="health-assistant-error" role="alert">{error}</p>}
          <form className="health-assistant-form" onSubmit={handleSubmit}>
            <label className="visually-hidden" htmlFor="health-assistant-question">Ask a general health question</label>
            <textarea
              id="health-assistant-question"
              ref={inputRef}
              rows="2"
              maxLength="1200"
              placeholder="Type your question…"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              disabled={busy}
            />
            <button className="btn btn--primary btn--sm" type="submit" disabled={busy || !question.trim()}>{busy ? "Sending…" : "Send"}</button>
          </form>
          <p className="health-assistant-footer">For personal care, ask your healthcare worker. For urgent symptoms, contact local emergency services.</p>
        </section>
      )}
      <button
        className={`health-assistant-launcher${open ? " is-open" : ""}`}
        type="button"
        aria-label={open ? "Close health assistant" : "Open health assistant"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? <span aria-hidden="true">×</span> : <><span className="health-assistant-launcher__icon" aria-hidden="true">✦</span><span className="health-assistant-launcher__label">Ask assistant</span></>}
      </button>
    </div>
  );
}
