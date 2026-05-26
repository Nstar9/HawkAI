import type { RiskLevel } from "@/lib/types";

const LABEL: Record<RiskLevel, string> = {
  low:      "Low Risk",
  medium:   "Medium Risk",
  high:     "High Risk",
  critical: "Critical",
};

// Dot icon for the badge
function RiskDot({ level }: { level: RiskLevel }) {
  const colors: Record<RiskLevel, string> = {
    low:      "#10b981",
    medium:   "#f59e0b",
    high:     "#ef4444",
    critical: "#c084fc",
  };
  return (
    <span style={{
      display: "inline-block",
      width: 5,
      height: 5,
      borderRadius: "50%",
      background: colors[level],
      flexShrink: 0,
    }} />
  );
}

export function RiskBadge({ level }: { level: RiskLevel }) {
  return (
    <span className={`badge badge-${level}`}>
      <RiskDot level={level} />
      {LABEL[level]}
    </span>
  );
}
