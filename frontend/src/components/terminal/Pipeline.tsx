import { Label } from "./atoms";
import type { PipelineStep } from "./types";

// The 6-step display model mapped from our 3 backend steps + tool events
export const PIPELINE_STEPS: readonly Omit<PipelineStep, "state" | "time">[] = [
  { n: "01", k: "WEB",       label: "web research"    },
  { n: "02", k: "PROFILE",   label: "entity profile"  },
  { n: "03", k: "STORE",     label: "atlas write"     },
  { n: "04", k: "CORRELATE", label: "vector correlate"},
  { n: "05", k: "SIGNALS",   label: "risk signals"    },
  { n: "06", k: "SYNTH",     label: "synthesize"      },
] as const;

export interface PipelineProps {
  steps: readonly PipelineStep[];
  status?: string;
}

export function Pipeline({ steps, status }: PipelineProps) {
  const activeDoneCount = steps.filter(s => s.state === "done").length;
  const activeIdx = steps.findIndex(s => s.state === "active");
  const defaultStatus = activeDoneCount === steps.length
    ? `ALL ${steps.length} STEPS COMPLETE`
    : activeIdx >= 0
    ? `STEP ${String(activeIdx + 1).padStart(2, "0")} / ${String(steps.length).padStart(2, "0")} · RUNNING`
    : `PIPELINE READY`;

  return (
    <div style={{ padding: "22px 28px 0", position: "relative", zIndex: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Label tone="amber">&gt; PIPELINE</Label>
        <span style={{ flex: 1, height: 1, background: "var(--hk-rule)" }} />
        <Label tone="mute">{status ?? defaultStatus}</Label>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
        border: "1px solid var(--hk-rule)",
        borderRadius: 3,
        overflow: "hidden",
        background: "var(--hk-surface)",
      }}>
        {steps.map((s, i) => {
          const done   = s.state === "done";
          const active = s.state === "active";
          const color  = active ? "var(--hk-amber)" : done ? "var(--hk-text)" : "var(--hk-text-dim)";
          return (
            <div
              key={s.k}
              style={{
                padding: "12px 14px",
                borderRight: i < steps.length - 1 ? "1px solid var(--hk-rule)" : "none",
                background: active ? "rgba(244,185,66,0.06)" : "transparent",
                position: "relative",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{
                  fontFamily: "var(--hk-mono)", fontSize: 10,
                  color: done ? "var(--hk-green)" : active ? "var(--hk-amber)" : "var(--hk-text-mute)",
                }}>
                  {done ? "✓" : active ? <span className="hk-pulse">◐</span> : "○"} {s.n}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)" }}>
                  {s.time}
                </span>
              </div>
              <div style={{
                marginTop: 6, fontFamily: "var(--hk-mono)", fontSize: 12,
                fontWeight: 600, color, letterSpacing: "0.06em",
              }}>
                {s.k}
              </div>
              <div style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)", marginTop: 2 }}>
                {s.label}
              </div>

              {active && (
                <div style={{
                  position: "absolute", left: 0, bottom: 0, height: 2,
                  width: `${(s.progress ?? 0.5) * 100}%`,
                  background: "var(--hk-amber)",
                  boxShadow: "0 0 8px var(--hk-amber)",
                  transition: "width 0.5s ease",
                }} />
              )}
              {done && (
                <div style={{
                  position: "absolute", left: 0, bottom: 0, height: 2, width: "100%",
                  background: "var(--hk-green-dim)",
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
