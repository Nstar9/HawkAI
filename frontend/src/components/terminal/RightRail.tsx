import { Label } from "./atoms";
import type { QueueRow } from "./types";
import type { Investigation } from "@/lib/types";

function Sparkline() {
  const pts = [40,32,38,28,30,22,24,18,26,16,20,12,14,8,16,12,18,14,10,6,12,8,14,10,6,4,8,10,6,8];
  const w = 280 / (pts.length - 1);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${i * w} ${p + 8}`).join(" ");
  const area = `${path} L 280 56 L 0 56 Z`;
  return (
    <svg viewBox="0 0 280 56" width="100%" height="56" style={{ marginTop: 6 }} aria-hidden>
      <defs>
        <linearGradient id="hk-spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%"   stopColor="var(--hk-amber)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--hk-amber)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#hk-spark)" />
      <path d={path} stroke="var(--hk-amber)" strokeWidth="1.2" fill="none" />
      <circle cx={280} cy={16} r={2.5} fill="var(--hk-amber)" />
    </svg>
  );
}

interface RightRailProps {
  investigations: Investigation[];
  liveQueue: QueueRow[];
  activeInvestigationName?: string;
}

export function RightRail({ investigations, liveQueue, activeInvestigationName }: RightRailProps) {
  const completed   = investigations.filter(i => i.status === "completed");
  const highCritical = completed.filter(i => {
    const l = i.result?.report?.risk_level;
    return l === "critical" || l === "high";
  }).length;

  const stats = [
    ["DOSSIERS",     String(completed.length || 0), "var(--hk-text)"],
    ["HIGH-RISK",    String(highCritical),           "var(--hk-red)"],
    ["AVG PIPELINE", "~90s",                         "var(--hk-amber)"],
    ["SIGNALS",      String(
       completed.reduce((acc, i) => acc + (i.result?.signals?.length ?? 0), 0)
     ), "var(--hk-text)"],
  ] as const;

  const queueTitle = activeInvestigationName
    ? `LIVE QUEUE · ${activeInvestigationName.slice(0, 12).toUpperCase()}`
    : "LIVE QUEUE · IDLE";

  const displayQueue = liveQueue.length > 0
    ? liveQueue
    : ([
        ["—", "idle", "awaiting next investigation", "var(--hk-text-mute)"],
      ] as QueueRow[]);

  return (
    <aside style={{
      width: "var(--hk-rail-w)", flex: "none",
      background: "var(--hk-bg)", borderLeft: "1px solid var(--hk-rule)",
      padding: "18px 16px", overflow: "hidden",
      display: "flex", flexDirection: "column",
      position: "relative", zIndex: 2,
    }}>
      <Label tone="amber">NETWORK PULSE · 30D</Label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        {stats.map(([l, v, c]) => (
          <div key={l} style={{
            border: "1px solid var(--hk-rule)", padding: "10px 12px",
            background: "var(--hk-surface)", borderRadius: 3,
          }}>
            <Label tone="mute" style={{ fontSize: 9 }}>{l}</Label>
            <div style={{ fontFamily: "var(--hk-mono)", fontSize: 18, color: c, fontWeight: 600, marginTop: 2 }}>
              {v}
            </div>
          </div>
        ))}
      </div>

      <div style={{
        marginTop: 12,
        border: "1px solid var(--hk-rule)", background: "var(--hk-surface)",
        borderRadius: 3, padding: "10px 12px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Label tone="mute" style={{ fontSize: 9 }}>RISK SIGNALS / DAY</Label>
          <span style={{ fontFamily: "var(--hk-mono)", fontSize: 9, color: "var(--hk-green)", letterSpacing: "0.14em" }}>
            LIVE
          </span>
        </div>
        <Sparkline />
      </div>

      <div style={{ height: 18 }} />
      <Label tone="amber">{queueTitle}</Label>
      <div style={{
        marginTop: 10,
        border: "1px solid var(--hk-rule)", background: "var(--hk-surface)",
        borderRadius: 3, padding: "10px 12px",
        fontFamily: "var(--hk-mono)", fontSize: 11, lineHeight: 1.55,
        flex: 1, overflow: "hidden",
      }}>
        {displayQueue.slice(-8).map((r, i) => (
          <div key={i} style={{ display: "flex", gap: 8, color: "var(--hk-text-dim)" }}>
            <span style={{ color: "var(--hk-text-mute)", width: 50, flex: "none", fontSize: 10 }}>{r[0]}</span>
            <span style={{ color: "var(--hk-amber-dim)", width: 58, flex: "none", fontSize: 10 }}>{r[1]}</span>
            <span style={{
              color: r[3] as string, flex: 1, fontSize: 10,
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{r[2]}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 16 }} />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Label tone="mute">HOTKEYS</Label>
        {([
          ["⌘ K", "focus query"],
          ["⌘ ↵", "run investigation"],
          ["/",   "filter table"],
          ["G D", "go to dossiers"],
        ] as const).map(([k, l]) => (
          <div key={k} style={{
            display: "flex", alignItems: "center", gap: 10,
            fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-dim)",
          }}>
            <span style={{
              padding: "2px 8px", border: "1px solid var(--hk-rule)",
              background: "var(--hk-surface)", color: "var(--hk-text)",
              minWidth: 36, textAlign: "center", borderRadius: 2,
            }}>{k}</span>
            <span>{l}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
