import { RiskBadge } from "@/components/RiskBadge";
import type { Entity, RiskLevel } from "@/lib/types";

function RiskBar({ score, level }: { score: number; level: RiskLevel }) {
  const colors: Record<RiskLevel, string> = {
    low: "#10b981", medium: "#f59e0b", high: "#ef4444", critical: "#7c3aed",
  };
  return (
    <div style={{ marginTop: "0.85rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
        <span style={{ fontSize: "0.68rem", color: "var(--muted-3)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 600 }}>
          Risk Score
        </span>
        <span style={{ fontSize: "0.78rem", fontWeight: 700, color: colors[level], fontVariantNumeric: "tabular-nums" }}>
          {Math.round(score)}<span style={{ color: "var(--muted-3)", fontWeight: 400 }}>/100</span>
        </span>
      </div>
      <div style={{ height: 5, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{
          height: "100%",
          width: `${score}%`,
          background: `linear-gradient(90deg, ${colors[level]}88, ${colors[level]})`,
          borderRadius: 3,
          transition: "width 1s ease",
        }} />
      </div>
    </div>
  );
}

export function EntityCard({ entity }: { entity: Entity }) {
  const hasRisk = entity.risk_level && entity.risk_score != null;

  return (
    <div className="card" style={{ transition: "border-color 0.18s, box-shadow 0.18s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text)" }}>
              {entity.name}
            </h3>
          </div>
          <span className="badge-type">{entity.entity_type}</span>
        </div>
        {entity.risk_level && (
          <RiskBadge level={entity.risk_level as RiskLevel} />
        )}
      </div>

      {entity.summary && (
        <p style={{
          marginTop: "0.85rem",
          marginBottom: 0,
          color: "var(--muted)",
          lineHeight: 1.65,
          fontSize: "0.875rem",
        }}>
          {entity.summary.slice(0, 300)}{entity.summary.length > 300 ? "…" : ""}
        </p>
      )}

      {hasRisk && (
        <RiskBar score={entity.risk_score!} level={entity.risk_level as RiskLevel} />
      )}

      {entity.aliases.length > 0 && (
        <div style={{ marginTop: "0.85rem", display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
          {entity.aliases.slice(0, 4).map((alias) => (
            <span key={alias} style={{
              fontSize: "0.72rem",
              color: "var(--muted-2)",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              padding: "0.15rem 0.5rem",
              borderRadius: 4,
            }}>
              {alias}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
