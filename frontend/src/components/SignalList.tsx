import { RiskBadge } from "@/components/RiskBadge";
import type { RiskSignal, SignalType } from "@/lib/types";

const TYPE_COLORS: Record<SignalType, string> = {
  sanctions:     "var(--sanctions-color)",
  reputational:  "var(--reputational-color)",
  regulatory:    "var(--regulatory-color)",
  litigation:    "var(--litigation-color)",
  financial:     "var(--financial-color)",
  governance:    "var(--governance-color)",
  fraud:         "var(--fraud-color)",
  other:         "var(--other-color)",
};

const TYPE_BG: Record<SignalType, string> = {
  sanctions:     "rgba(239,68,68,0.08)",
  reputational:  "rgba(245,158,11,0.08)",
  regulatory:    "rgba(139,92,246,0.08)",
  litigation:    "rgba(99,102,241,0.08)",
  financial:     "rgba(236,72,153,0.08)",
  governance:    "rgba(20,184,166,0.08)",
  fraud:         "rgba(239,68,68,0.08)",
  other:         "rgba(156,163,175,0.08)",
};

const TYPE_ICONS: Record<SignalType, React.ReactNode> = {
  sanctions: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>
    </svg>
  ),
  reputational: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  ),
  regulatory: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
    </svg>
  ),
  litigation: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    </svg>
  ),
  financial: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  ),
  governance: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  fraud: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>
    </svg>
  ),
  other: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  ),
};

function SignalTypeBadge({ type }: { type: SignalType }) {
  const color = TYPE_COLORS[type] ?? TYPE_COLORS.other;
  const bg = TYPE_BG[type] ?? TYPE_BG.other;
  const icon = TYPE_ICONS[type] ?? TYPE_ICONS.other;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "0.3rem",
      padding: "0.18rem 0.55rem",
      borderRadius: 6,
      background: bg,
      color,
      fontSize: "0.68rem",
      fontWeight: 700,
      textTransform: "capitalize",
      letterSpacing: "0.03em",
      border: `1px solid ${color}22`,
    }}>
      <span style={{ color, display: "flex" }}>{icon}</span>
      {type}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 90 ? "var(--low)" : pct >= 60 ? "var(--medium)" : "var(--high)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div className="confidence-bar-bg">
        <div className="confidence-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontVariantNumeric: "tabular-nums", minWidth: 28 }}>
        {pct}%
      </span>
    </div>
  );
}

export function SignalList({ signals }: { signals: RiskSignal[] }) {
  if (signals.length === 0) {
    return (
      <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--muted)", fontSize: "0.875rem" }}>
        No risk signals recorded for this investigation.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {signals.map((signal) => {
        const leftColor = TYPE_COLORS[signal.signal_type] ?? TYPE_COLORS.other;
        return (
          <div
            key={signal.id}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderLeft: `3px solid ${leftColor}`,
              borderRadius: "0 8px 8px 0",
              padding: "0.9rem 1rem",
              transition: "border-color 0.15s",
            }}
          >
            {/* Top row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.4rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <SignalTypeBadge type={signal.signal_type} />
                <span style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--text)" }}>
                  {signal.title}
                </span>
              </div>
              <RiskBadge level={signal.severity} />
            </div>

            {/* Description */}
            <p style={{ margin: "0 0 0.6rem", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.6 }}>
              {signal.description}
            </p>

            {/* Footer row */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <span style={{ fontSize: "0.68rem", color: "var(--muted-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Confidence</span>
                <ConfidenceBar value={signal.confidence} />
              </div>
              {signal.sources.length > 0 && (
                <span style={{ fontSize: "0.72rem", color: "var(--muted-3)", marginLeft: "auto" }}>
                  {signal.sources.slice(0, 2).map(s =>
                    s.startsWith("http") ? new URL(s).hostname : s
                  ).join(", ")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
