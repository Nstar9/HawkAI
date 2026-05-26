import { RiskBadge } from "@/components/RiskBadge";
import { SignalList } from "@/components/SignalList";
import type { InvestigationResult, RiskLevel } from "@/lib/types";

const LEVEL_COLORS: Record<RiskLevel, {
  score: string; border: string; bg: string; glow: string; stroke: string;
}> = {
  low:      { score: "#10b981", border: "rgba(16,185,129,0.25)",  bg: "rgba(16,185,129,0.06)",  glow: "rgba(16,185,129,0.2)",  stroke: "#10b981" },
  medium:   { score: "#f59e0b", border: "rgba(245,158,11,0.25)",  bg: "rgba(245,158,11,0.06)",  glow: "rgba(245,158,11,0.2)",  stroke: "#f59e0b" },
  high:     { score: "#ef4444", border: "rgba(239,68,68,0.25)",   bg: "rgba(239,68,68,0.06)",   glow: "rgba(239,68,68,0.25)",  stroke: "#ef4444" },
  critical: { score: "#c084fc", border: "rgba(124,58,237,0.35)",  bg: "rgba(124,58,237,0.08)",  glow: "rgba(124,58,237,0.45)", stroke: "#7c3aed" },
};

function RiskGauge({ score, level }: { score: number; level: RiskLevel }) {
  const r = 46;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;
  const c = LEVEL_COLORS[level];

  return (
    <div style={{ position: "relative", width: 128, height: 128, flexShrink: 0 }}>
      <svg width="128" height="128" viewBox="0 0 128 128" style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle cx="64" cy="64" r={r} fill="none" stroke="var(--border)" strokeWidth="8" />
        {/* Progress */}
        <circle
          cx="64" cy="64" r={r}
          fill="none"
          stroke={c.stroke}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ filter: `drop-shadow(0 0 6px ${c.glow})`, transition: "stroke-dashoffset 1.2s ease" }}
        />
      </svg>
      {/* Center text */}
      <div style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <span style={{
          fontSize: "2rem",
          fontWeight: 900,
          color: c.score,
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.05em",
          textShadow: `0 0 20px ${c.glow}`,
        }}>
          {Math.round(score)}
        </span>
        <span style={{ fontSize: "0.65rem", color: "var(--muted-3)", fontWeight: 600 }}>/ 100</span>
      </div>
    </div>
  );
}

function ActionIcon({ text }: { text: string }) {
  const lower = text.toLowerCase();
  if (lower.includes("decline") || lower.includes("do not") || lower.includes("reject")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <circle cx="12" cy="12" r="10"/><line x1="4.9" y1="4.9" x2="19.1" y2="19.1"/>
      </svg>
    );
  }
  if (lower.includes("sar") || lower.includes("file") || lower.includes("report")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
      </svg>
    );
  }
  if (lower.includes("clear") || lower.includes("proceed") || lower.includes("approve")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    );
  }
  if (lower.includes("escalate") || lower.includes("mlro") || lower.includes("enhanced")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <polyline points="18 15 12 9 6 15"/>
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
  );
}

export function RiskReport({ result }: { result: InvestigationResult }) {
  const report = result.report;
  if (!report) {
    return <p style={{ color: "var(--muted)" }}>No report available.</p>;
  }

  const level = report.risk_level;
  const c = LEVEL_COLORS[level] ?? LEVEL_COLORS.medium;

  return (
    <article style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

      {/* ── Score + Summary hero card ── */}
      <div
        className="card-elevated"
        style={{
          borderColor: c.border,
          background: c.bg,
          boxShadow: `0 0 40px ${c.glow}, 0 8px 32px rgba(0,0,0,0.3)`,
        }}
      >
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <RiskGauge score={report.overall_risk_score} level={level} />
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
              <p style={{ margin: 0, fontSize: "0.65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--muted-2)" }}>
                Risk Assessment
              </p>
              <RiskBadge level={level} />
            </div>
            <p style={{
              margin: 0,
              fontSize: "1.05rem",
              lineHeight: 1.65,
              color: "var(--text)",
              fontWeight: 500,
            }}>
              {report.executive_summary}
            </p>
            <div style={{ display: "flex", gap: "1.5rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <div>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-3)", marginBottom: 2 }}>Signals</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: c.score }}>{result.signals.length}</div>
              </div>
              <div>
                <div style={{ fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted-3)", marginBottom: 2 }}>Findings</div>
                <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text)" }}>{report.key_findings.length}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Recommended Action ── */}
      {report.recommendations.length > 0 && (
        <div style={{
          background: "var(--surface)",
          border: `1px solid ${c.border}`,
          borderRadius: "var(--radius-card)",
          padding: "1.25rem 1.5rem",
        }}>
          <p style={{ margin: "0 0 0.85rem", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-2)" }}>
            Recommended Action
          </p>
          {report.recommendations.map((r, i) => (
            <div key={i} style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.85rem",
              padding: "0.9rem 1rem",
              background: "var(--surface-2)",
              borderRadius: 8,
              border: "1px solid var(--border-light)",
              marginBottom: i < report.recommendations.length - 1 ? "0.5rem" : 0,
            }}>
              <ActionIcon text={r} />
              <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text)", lineHeight: 1.55 }}>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Key Findings ── */}
      {report.key_findings.length > 0 && (
        <div className="card">
          <p style={{ margin: "0 0 1rem", fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-2)" }}>
            Key Findings
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {report.key_findings.map((f, i) => (
              <div key={i} style={{
                display: "flex",
                gap: "0.85rem",
                alignItems: "flex-start",
                padding: "0.75rem 0.9rem",
                background: "var(--surface-2)",
                borderRadius: 8,
                borderLeft: `3px solid ${c.stroke}66`,
              }}>
                <span style={{
                  minWidth: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: `${c.stroke}22`,
                  border: `1px solid ${c.stroke}44`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.68rem",
                  fontWeight: 800,
                  color: c.score,
                  flexShrink: 0,
                }}>
                  {i + 1}
                </span>
                <p style={{ margin: 0, fontSize: "0.875rem", lineHeight: 1.6, color: "var(--text)" }}>{f}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Risk Signals ── */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
          <p style={{ margin: 0, fontSize: "0.68rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted-2)" }}>
            Risk Signals
          </p>
          <span style={{
            background: result.signals.length > 0 ? `${c.stroke}22` : "var(--surface-2)",
            border: `1px solid ${result.signals.length > 0 ? c.stroke + "44" : "var(--border)"}`,
            borderRadius: 999,
            padding: "0.1rem 0.55rem",
            fontSize: "0.68rem",
            fontWeight: 700,
            color: result.signals.length > 0 ? c.score : "var(--muted-2)",
          }}>
            {result.signals.length}
          </span>
        </div>
        <SignalList signals={result.signals} />
      </div>
    </article>
  );
}
