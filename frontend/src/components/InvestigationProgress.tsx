"use client";

import type { Investigation, InvestigationStepName } from "@/lib/types";

const STEP_ORDER: InvestigationStepName[] = ["research", "intelligence", "complete"];

const STEP_META: Record<InvestigationStepName, { label: string; detail: string; icon: React.ReactNode }> = {
  research: {
    label: "Web Research",
    detail: "Google Search OSINT",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
      </svg>
    ),
  },
  intelligence: {
    label: "Intelligence Analysis",
    detail: "MongoDB MCP · vector tools",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    ),
  },
  complete: {
    label: "Report Synthesis",
    detail: "Gemini reasoning",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
};

interface Props {
  investigation: Investigation | null;
  liveMessage?: string;
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function StepDot({ status, icon }: { status: string; icon: React.ReactNode }) {
  return (
    <div className={`step-dot step-dot-${status}`}>
      {status === "completed" ? <CheckIcon /> :
       status === "failed"    ? <XIcon /> :
       status === "running"   ? <span style={{ color: "var(--accent)", display: "flex" }}>{icon}</span> :
       <span style={{ color: "var(--muted-3)", display: "flex" }}>{icon}</span>}
    </div>
  );
}

function formatTime(ts?: string) {
  if (!ts) return null;
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; label: string; dot?: boolean }> = {
    pending:   { bg: "rgba(107,114,128,0.12)", color: "#6b7280",  label: "Pending" },
    running:   { bg: "rgba(59,130,246,0.12)",  color: "#93c5fd",  label: "Running", dot: true },
    completed: { bg: "rgba(16,185,129,0.12)",  color: "#10b981",  label: "Completed" },
    failed:    { bg: "rgba(239,68,68,0.12)",   color: "#ef4444",  label: "Failed" },
  };
  const c = map[status] ?? map.pending;
  return (
    <span className="status-pill" style={{ background: c.bg, color: c.color }}>
      {c.dot && (
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.color, animation: "blink 1.5s ease-in-out infinite", display: "inline-block" }} />
      )}
      {c.label}
    </span>
  );
}

export function InvestigationProgress({ investigation, liveMessage }: Props) {
  if (!investigation) return null;

  const overallRunning = investigation.status === "running";
  const overallFailed  = investigation.status === "failed";

  return (
    <div className="card" style={{ marginTop: "1.5rem" }}>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: "1.5rem" }}>
        <h2 style={{
          margin: 0,
          fontSize: "0.72rem",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--muted)",
        }}>
          Investigation Progress
        </h2>
        <StatusPill status={investigation.status} />
      </div>

      {/* Timeline */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {STEP_ORDER.map((stepName, idx) => {
          const step = investigation.steps.find((s) => s.name === stepName);
          const status = step?.status ?? "pending";
          const isLast = idx === STEP_ORDER.length - 1;
          const meta = STEP_META[stepName];

          return (
            <div key={stepName} style={{ display: "flex", gap: "1rem" }}>
              {/* Left rail: dot + line */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                <StepDot status={status} icon={meta.icon} />
                {!isLast && (
                  <div style={{
                    width: 2,
                    flex: 1,
                    minHeight: 28,
                    marginTop: 4,
                    background: status === "completed"
                      ? "linear-gradient(to bottom, var(--low), rgba(16,185,129,0.2))"
                      : "var(--border)",
                    opacity: status === "completed" ? 0.6 : 0.4,
                    borderRadius: 1,
                  }} />
                )}
              </div>

              {/* Right content */}
              <div style={{
                paddingBottom: isLast ? 0 : "1.25rem",
                flex: 1,
                paddingTop: 4,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.9rem", color: status === "pending" ? "var(--muted)" : "var(--text)" }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "var(--muted-3)" }}>
                    {meta.detail}
                  </span>
                  {step?.completed_at && (
                    <span style={{ fontSize: "0.72rem", color: "var(--low)", marginLeft: "auto" }}>
                      {formatTime(step.completed_at)}
                    </span>
                  )}
                  {status === "running" && (
                    <span style={{ fontSize: "0.72rem", color: "var(--accent)", marginLeft: "auto" }}>
                      {formatTime(step?.started_at)} →
                    </span>
                  )}
                </div>

                {step?.message && status !== "pending" && (
                  <p style={{
                    margin: "0.3rem 0 0",
                    fontSize: "0.8rem",
                    color: "var(--muted)",
                    lineHeight: 1.5,
                  }}>
                    {step.message}
                  </p>
                )}

                {/* Live message under running step */}
                {status === "running" && overallRunning && liveMessage && (
                  <div className="terminal" style={{ marginTop: "0.6rem", fontSize: "0.75rem" }}>
                    {liveMessage}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error block */}
      {overallFailed && investigation.error && (
        <div style={{
          marginTop: "1.25rem",
          padding: "0.85rem 1rem",
          background: "rgba(239,68,68,0.07)",
          border: "1px solid rgba(239,68,68,0.2)",
          borderRadius: 8,
        }}>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <p style={{ margin: 0, color: "#fca5a5", fontSize: "0.82rem", lineHeight: 1.6 }}>
              {investigation.error.replace(/\n/g, " ").slice(0, 300)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
