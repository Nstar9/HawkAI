"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getEntity, getInvestigation, streamInvestigation, addEntityNote } from "@/lib/api";
import type { Entity, Investigation, RiskLevel, RiskSignal } from "@/lib/types";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { Pipeline, PIPELINE_STEPS } from "./Pipeline";
import { Label, Dot, Level } from "./atoms";
import type { PipelineStep, QueueRow } from "./types";

// ── Tool → pipeline step index ────────────────────────────────
const TOOL_TO_STEP_IDX: Record<string, number> = {
  "extract_and_store_entity":     1,
  "run_vector_similarity_search": 2,
  "find_correlated_entities":     3,
  "classify_and_store_signals":   4,
  "synthesize_risk_report":       5,
};

// ── Risk gauge SVG ─────────────────────────────────────────────
function RiskGauge({ score, level }: { score: number; level: string }) {
  const r    = 36;
  const cx   = 50;
  const cy   = 50;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(score / 100, 1);
  const color =
    level === "critical" ? "var(--hk-red)"   :
    level === "high"     ? "var(--hk-red)"   :
    level === "medium"   ? "var(--hk-amber)" :
    "var(--hk-green)";

  return (
    <svg viewBox="0 0 100 100" width={110} height={110} aria-label={`Risk score ${Math.round(score)}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--hk-rule)" strokeWidth={5} />
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 0.6s ease", filter: `drop-shadow(0 0 6px ${color})` }}
      />
      <text x={cx} y={cy - 3} textAnchor="middle" fill={color}
        fontFamily="var(--hk-mono)" fontSize={22} fontWeight={700}>
        {Math.round(score)}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="var(--hk-text-mute)"
        fontFamily="var(--hk-mono)" fontSize={9} letterSpacing={2}>
        /100
      </text>
    </svg>
  );
}

// ── Signal severity color ──────────────────────────────────────
function sigColor(sev: string) {
  return sev === "critical" ? "var(--hk-red)"   :
         sev === "high"     ? "var(--hk-red)"   :
         sev === "medium"   ? "var(--hk-amber)" :
         "var(--hk-green)";
}

function sigAbbrev(type: string) {
  const m: Record<string, string> = {
    reputational: "REPU", financial: "FINC", regulatory: "REGL",
    litigation: "LITN", sanctions: "SANC", governance: "GOVN",
    fraud: "FRAD", other: "OTHR",
  };
  return m[type] ?? type.slice(0, 4).toUpperCase();
}

// ── Pipeline helpers ───────────────────────────────────────────
function derivePipelineIdx(inv: Investigation): number {
  if (inv.status === "completed") return PIPELINE_STEPS.length;
  if (inv.status === "failed")    return -1;
  const steps = inv.steps ?? [];
  const hasResearchDone = steps.some(s => s.name === "research"     && s.status === "completed");
  const hasIntelRun     = steps.some(s => s.name === "intelligence" && s.status === "running");
  const hasIntelDone    = steps.some(s => s.name === "intelligence" && s.status === "completed");
  if (hasIntelDone)  return 5;
  if (hasIntelRun)   return 2;
  if (hasResearchDone) return 1;
  return 0;
}

function buildPipelineSteps(activeIdx: number): PipelineStep[] {
  return PIPELINE_STEPS.map((s, i) => ({
    ...s,
    state: i < activeIdx ? "done" : i === activeIdx ? "active" : "queued",
    time:  "—",
  }));
}

// ── Now-time ──────────────────────────────────────────────────
function nowTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
}

// ── Props ─────────────────────────────────────────────────────
export interface InvestigationDetailProps {
  id: string;
  initialInvestigation: Investigation | null;
  initialEntity: Entity | null;
}

// ── Component ─────────────────────────────────────────────────
export function InvestigationDetail({ id, initialInvestigation, initialEntity }: InvestigationDetailProps) {
  const router = useRouter();

  const [inv,          setInv]          = useState<Investigation | null>(initialInvestigation);
  const [entity,       setEntity]       = useState<Entity | null>(initialEntity);
  const [liveQueue,    setLiveQueue]    = useState<QueueRow[]>([]);
  const [pipelineIdx,  setPipelineIdx]  = useState<number>(
    initialInvestigation ? derivePipelineIdx(initialInvestigation) : -1
  );
  const [noteText,     setNoteText]     = useState("");
  const [savingNote,   setSavingNote]   = useState(false);
  const closeSSERef = useRef<(() => void) | null>(null);

  function pushQueue(time: string, source: string, msg: string, color = "var(--hk-text-dim)") {
    setLiveQueue(q => [...q.slice(-30), [time, source, msg, color]]);
  }

  const loadEntity = useCallback(async (entityId: string) => {
    try {
      const e = await getEntity(entityId);
      setEntity(e);
    } catch { /* entity may not exist yet */ }
  }, []);

  // Subscribe to SSE stream
  useEffect(() => {
    if (closeSSERef.current) { closeSSERef.current(); closeSSERef.current = null; }

    const close = streamInvestigation(
      id,
      (event) => {
        const t = nowTime();

        if (event.event === "snapshot" || event.event === "investigation_completed") {
          const data = event.data as unknown as Investigation;
          setInv(data);
          const idx = derivePipelineIdx(data);
          setPipelineIdx(idx);
          if (data.result?.entity_id) loadEntity(data.result.entity_id);
        }

        if (event.event === "step") {
          const d = event.data as { name?: string; status?: string; message?: string };
          if (d.name === "research" && d.status === "running") {
            setPipelineIdx(0);
            pushQueue(t, "web", "OSINT research starting", "var(--hk-text-dim)");
          }
          if (d.name === "research" && d.status === "completed") {
            setPipelineIdx(1);
            pushQueue(t, "web", "research complete", "var(--hk-green)");
          }
          if (d.name === "intelligence" && d.status === "running") {
            if (d.message) pushQueue(t, "intel", d.message.slice(0, 48), "var(--hk-text)");
          }
          if (d.name === "complete" && d.status === "completed") {
            setPipelineIdx(PIPELINE_STEPS.length);
            pushQueue(t, "synth", "report ready", "var(--hk-green)");
          }
          getInvestigation(id).then(u => {
            setInv(u);
            if (u.result?.entity_id) loadEntity(u.result.entity_id);
          }).catch(() => undefined);
        }

        if (event.event === "tool_call") {
          const d = event.data as { tool?: string };
          const toolName = d.tool ?? "";
          const stepIdx = TOOL_TO_STEP_IDX[toolName];
          if (stepIdx !== undefined) setPipelineIdx(stepIdx);
          pushQueue(t, toolName.slice(0, 10), `calling ${toolName.slice(0, 32)}`, "var(--hk-amber)");
        }

        if (event.event === "agent_text") {
          const d = event.data as { agent?: string; text?: string };
          const src = (d.agent ?? "agent").slice(0, 10).toLowerCase();
          const msg = (d.text ?? "").slice(0, 50);
          pushQueue(t, src, msg, "var(--hk-text)");
        }

        if (event.event === "error") {
          const d = event.data as { message?: string };
          pushQueue(t, "error", (d.message ?? "unknown error").slice(0, 48), "var(--hk-red)");
          getInvestigation(id).then(setInv).catch(() => undefined);
        }

        if (event.event === "done") {
          closeSSERef.current = null;
          getInvestigation(id).then(u => {
            setInv(u);
            setPipelineIdx(derivePipelineIdx(u));
            if (u.result?.entity_id) loadEntity(u.result.entity_id);
          }).catch(() => undefined);
        }
      },
      () => { closeSSERef.current = null; },
    );

    closeSSERef.current = close;
    return () => { close(); closeSSERef.current = null; };
  }, [id, loadEntity]);

  // Cleanup on unmount
  useEffect(() => () => { closeSSERef.current?.(); }, []);

  const isRunning = inv?.status === "running" || inv?.status === "pending";
  const report    = inv?.result?.report;
  const signals   = inv?.result?.signals ?? [];

  const pipelineSteps: PipelineStep[] = buildPipelineSteps(pipelineIdx);

  // Sort signals: critical > high > medium > low
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedSignals = [...signals].sort((a, b) =>
    (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4)
  );

  function handleExportPDF() {
    window.print();
  }

  async function handleAddNote() {
    if (!noteText.trim() || !entity) return;
    setSavingNote(true);
    try {
      const updated = await addEntityNote(entity.id, noteText.trim());
      setEntity(updated);
      setNoteText("");
    } catch { /* ignore */ }
    setSavingNote(false);
  }

  return (
    <div className="hk-shell">
      <TopBar />

      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        {/* ── Main content ── */}
        <main style={{
          flex: 1, display: "flex", flexDirection: "column", minWidth: 0,
          overflowY: "auto", padding: "24px 28px 32px",
          position: "relative", zIndex: 2,
        }}>
          {/* Back nav + export */}
          <div style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="hk-bare-btn"
              style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.08em",
                color: "var(--hk-text-dim)", padding: "5px 10px",
                border: "1px solid var(--hk-rule)", borderRadius: 2,
              }}
            >
              ← BACK TO TERMINAL
            </button>
            <span style={{ flex: 1 }} />
            {/* KYC disclaimer */}
            <span style={{
              fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-mute)",
              padding: "4px 10px", border: "1px solid var(--hk-rule)", borderRadius: 2,
            }}>
              ⚠ KYC/AML COMPLIANCE SCREEN — NOT INVESTMENT ADVICE
            </span>
            {inv?.status === "completed" && (
              <button
                type="button"
                onClick={handleExportPDF}
                className="hk-bare-btn"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6,
                  fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.08em",
                  color: "var(--hk-bg)", padding: "5px 14px",
                  background: "var(--hk-amber)", borderRadius: 2,
                  fontWeight: 700,
                }}
              >
                ↓ EXPORT PDF
              </button>
            )}
          </div>

          {/* ── Entity header ── */}
          {inv && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 28,
              padding: "20px 24px", marginBottom: 18,
              background: "var(--hk-surface)", border: "1px solid var(--hk-rule)", borderRadius: 3,
              position: "relative", overflow: "hidden",
            }}>
              {/* Amber glow for high/critical */}
              {(report?.risk_level === "critical" || report?.risk_level === "high") && (
                <div style={{
                  position: "absolute", inset: 0, pointerEvents: "none",
                  background: "radial-gradient(ellipse at 0% 50%, rgba(244,185,66,0.06) 0%, transparent 60%)",
                }} />
              )}

              {/* Gauge */}
              {report && (
                <div style={{ flexShrink: 0 }}>
                  <RiskGauge score={report.overall_risk_score} level={report.risk_level} />
                </div>
              )}

              {/* Entity info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                  <span style={{
                    fontFamily: "var(--hk-mono)", fontSize: 9, letterSpacing: "0.12em",
                    color: "var(--hk-text-mute)", padding: "2px 6px",
                    border: "1px solid var(--hk-rule)", borderRadius: 2,
                  }}>
                    {inv.entity_type.toUpperCase()}
                  </span>
                  <span style={{
                    fontFamily: "var(--hk-mono)", fontSize: 9, letterSpacing: "0.12em",
                    color: isRunning ? "var(--hk-amber)" : inv.status === "failed" ? "var(--hk-red)" : "var(--hk-green)",
                    padding: "2px 6px",
                    border: `1px solid ${isRunning ? "var(--hk-amber-dim)" : inv.status === "failed" ? "rgba(255,80,80,0.3)" : "rgba(80,255,140,0.3)"}`,
                    borderRadius: 2,
                  }}>
                    {isRunning ? <><span className="hk-pulse">◐</span> RUNNING</> : inv.status.toUpperCase()}
                  </span>
                  {report && (
                    <span style={{
                      fontFamily: "var(--hk-mono)", fontSize: 9, letterSpacing: "0.12em",
                      color: sigColor(report.risk_level),
                      padding: "2px 6px",
                      border: `1px solid ${sigColor(report.risk_level)}`,
                      borderRadius: 2, opacity: 0.8,
                    }}>
                      {report.risk_level.toUpperCase()} RISK
                    </span>
                  )}
                </div>

                <div style={{
                  fontFamily: "var(--hk-mono)", fontSize: 26, fontWeight: 700,
                  color: "var(--hk-text)", letterSpacing: "-0.02em", lineHeight: 1.1,
                  marginBottom: 8,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {inv.entity_name}
                </div>

                <div style={{
                  fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)",
                  letterSpacing: "0.06em",
                }}>
                  <span>ID: {inv.id.slice(-8).toUpperCase()}</span>
                  <span style={{ margin: "0 10px", color: "var(--hk-rule)" }}>·</span>
                  <span>{new Date(inv.created_at).toISOString().slice(0, 19).replace("T", " ")} UTC</span>
                  {signals.length > 0 && (
                    <>
                      <span style={{ margin: "0 10px", color: "var(--hk-rule)" }}>·</span>
                      <span style={{ color: "var(--hk-amber)" }}>{signals.length} SIGNAL{signals.length !== 1 ? "S" : ""}</span>
                    </>
                  )}
                  {report?.analyst_confidence != null && (
                    <>
                      <span style={{ margin: "0 10px", color: "var(--hk-rule)" }}>·</span>
                      <span style={{ color: "var(--hk-text-mute)" }}>
                        CONFIDENCE {Math.round(report.analyst_confidence * 100)}%
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Correlated entities (right side of header) */}
              {report?.correlated_entities && report.correlated_entities.length > 0 && (
                <div style={{ flexShrink: 0, maxWidth: 200 }}>
                  <Label tone="mute" style={{ fontSize: 9, marginBottom: 6 }}>CORRELATED ENTITIES</Label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {report.correlated_entities.slice(0, 4).map((e, i) => (
                      <div key={i} style={{
                        fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-dim)",
                        padding: "3px 8px", border: "1px solid var(--hk-rule)",
                        borderRadius: 2, background: "var(--hk-bg-2)",
                        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      }}>
                        {e}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Pipeline ── */}
          <div style={{ marginBottom: 18 }}>
            <Pipeline steps={pipelineSteps} />
          </div>

          {/* ── Two-column content area ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, minWidth: 0 }}>
            {/* LEFT: Report content */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>

              {/* Executive summary */}
              {report?.executive_summary && (
                <Section label="EXECUTIVE SUMMARY">
                  <p style={{
                    fontFamily: "var(--hk-mono)", fontSize: 14, color: "var(--hk-text)",
                    lineHeight: 1.8, margin: 0,
                  }}>
                    {report.executive_summary}
                  </p>
                </Section>
              )}

              {/* Key findings */}
              {report?.key_findings && report.key_findings.length > 0 && (
                <Section label="KEY FINDINGS">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.key_findings.map((f, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                      }}>
                        <span style={{
                          fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-amber)",
                          flexShrink: 0, marginTop: 2,
                        }}>
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span style={{
                          fontFamily: "var(--hk-mono)", fontSize: 13, color: "var(--hk-text)",
                          lineHeight: 1.7,
                        }}>
                          {f}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* Recommendations */}
              {report?.recommendations && report.recommendations.length > 0 && (
                <Section label="RECOMMENDATIONS">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {report.recommendations.map((r, i) => (
                      <div key={i} style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                      }}>
                        <span style={{
                          fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-green-dim)",
                          flexShrink: 0, marginTop: 2,
                        }}>
                          ▸
                        </span>
                        <span style={{
                          fontFamily: "var(--hk-mono)", fontSize: 13, color: "var(--hk-text)",
                          lineHeight: 1.7,
                        }}>
                          {r}
                        </span>
                      </div>
                    ))}
                  </div>
                </Section>
              )}

              {/* No report yet */}
              {!report && !isRunning && inv && (
                <Section label="INTELLIGENCE REPORT">
                  <div style={{
                    fontFamily: "var(--hk-mono)", fontSize: 11,
                    color: "var(--hk-text-mute)", padding: "16px 0",
                    textAlign: "center",
                  }}>
                    {inv.status === "failed"
                      ? "INVESTIGATION FAILED — NO REPORT GENERATED"
                      : "REPORT NOT YET AVAILABLE"}
                  </div>
                </Section>
              )}

              {isRunning && (
                <Section label="INTELLIGENCE REPORT">
                  <div style={{
                    fontFamily: "var(--hk-mono)", fontSize: 11,
                    color: "var(--hk-amber)", padding: "16px 0",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <span className="hk-pulse">◐</span>
                    GENERATING REPORT — PIPELINE RUNNING
                  </div>
                </Section>
              )}

              {/* Analyst notes */}
              {entity && (
                <Section label={`ANALYST NOTES · ${entity.analyst_notes.length}`}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                    {entity.analyst_notes.length === 0 ? (
                      <div style={{
                        fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)",
                      }}>
                        NO ANALYST NOTES
                      </div>
                    ) : (
                      entity.analyst_notes.slice().reverse().map((note) => (
                        <div key={note.id} style={{
                          padding: "10px 12px",
                          background: "var(--hk-bg-2)", border: "1px solid var(--hk-rule)",
                          borderRadius: 2,
                        }}>
                          <div style={{
                            display: "flex", justifyContent: "space-between",
                            marginBottom: 4,
                          }}>
                            <span style={{ fontFamily: "var(--hk-mono)", fontSize: 9, color: "var(--hk-amber)", letterSpacing: "0.1em" }}>
                              {note.author.toUpperCase()}
                            </span>
                            <span style={{ fontFamily: "var(--hk-mono)", fontSize: 9, color: "var(--hk-text-mute)" }}>
                              {new Date(note.created_at).toISOString().slice(0, 16).replace("T", " ")}
                            </span>
                          </div>
                          <p style={{
                            fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text)",
                            lineHeight: 1.6, margin: 0,
                          }}>
                            {note.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Note input */}
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text"
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAddNote(); } }}
                      placeholder="add analyst note…"
                      style={{
                        flex: 1,
                        fontFamily: "var(--hk-mono)", fontSize: 11,
                        background: "var(--hk-bg-2)", border: "1px solid var(--hk-rule)",
                        borderRadius: 2, padding: "7px 10px",
                        color: "var(--hk-text)", outline: "none",
                        caretColor: "var(--hk-amber)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddNote}
                      disabled={!noteText.trim() || savingNote}
                      className="hk-bare-btn"
                      style={{
                        padding: "6px 14px",
                        fontFamily: "var(--hk-mono)", fontSize: 10, letterSpacing: "0.08em",
                        background: "var(--hk-amber)", color: "var(--hk-bg)",
                        fontWeight: 700, borderRadius: 2,
                        opacity: (!noteText.trim() || savingNote) ? 0.5 : 1,
                      }}
                    >
                      {savingNote ? "…" : "ADD"}
                    </button>
                  </div>
                </Section>
              )}
            </div>

            {/* RIGHT: Signals + entity profile */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Risk breakdown by category */}
              {report?.risk_breakdown && Object.keys(report.risk_breakdown).length > 0 && (
                <Section label="RISK BREAKDOWN">
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {Object.entries(report.risk_breakdown)
                      .sort((a, b) => {
                        const sevOrd = { critical: 4, high: 3, medium: 2, low: 1 };
                        return (sevOrd[b[1].max_severity] ?? 0) - (sevOrd[a[1].max_severity] ?? 0);
                      })
                      .map(([cat, data]) => (
                        <div key={cat} style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          gap: 8,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
                            <span style={{
                              fontFamily: "var(--hk-mono)", fontSize: 9, letterSpacing: "0.08em",
                              color: sigColor(data.max_severity), padding: "1px 4px",
                              border: `1px solid ${sigColor(data.max_severity)}`,
                              borderRadius: 2, flexShrink: 0, opacity: 0.8,
                            }}>
                              {sigAbbrev(cat)}
                            </span>
                            <div style={{
                              flex: 1, height: 2,
                              background: "var(--hk-rule)",
                              borderRadius: 1,
                              position: "relative",
                            }}>
                              <div style={{
                                position: "absolute", left: 0, top: 0, bottom: 0,
                                width: `${Math.min(100, data.count * 20)}%`,
                                background: sigColor(data.max_severity),
                                borderRadius: 1, opacity: 0.7,
                              }} />
                            </div>
                          </div>
                          <span style={{
                            fontFamily: "var(--hk-mono)", fontSize: 10,
                            color: "var(--hk-text-mute)", flexShrink: 0, minWidth: 20, textAlign: "right",
                          }}>
                            {data.count}
                          </span>
                        </div>
                      ))}
                  </div>
                </Section>
              )}

              {/* Risk signals */}
              <Section label={`RISK SIGNALS · ${sortedSignals.length}`}>
                {sortedSignals.length === 0 ? (
                  <div style={{
                    fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)",
                    padding: "12px 0", textAlign: "center",
                  }}>
                    {isRunning ? <><span className="hk-pulse">◐</span> CLASSIFYING…</> : "NO SIGNALS"}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {sortedSignals.map((sig) => (
                      <SignalRow key={sig.id} signal={sig} />
                    ))}
                  </div>
                )}
              </Section>

              {/* Entity profile */}
              {entity && (
                <Section label="ENTITY PROFILE">
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {entity.summary && (
                      <p style={{
                        fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text)",
                        lineHeight: 1.65, margin: 0,
                      }}>
                        {entity.summary}
                      </p>
                    )}

                    {entity.aliases.length > 0 && (
                      <div>
                        <Label tone="mute" style={{ fontSize: 9, marginBottom: 4 }}>ALIASES</Label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {entity.aliases.map((a, i) => (
                            <span key={i} style={{
                              fontFamily: "var(--hk-mono)", fontSize: 9,
                              color: "var(--hk-text-dim)", padding: "2px 6px",
                              border: "1px solid var(--hk-rule)", borderRadius: 2,
                            }}>
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4,
                    }}>
                      {[
                        ["TYPE",    entity.entity_type.toUpperCase()],
                        ["SIGNALS", String(signals.length)],
                        ["SCORE",   entity.risk_score != null ? String(Math.round(entity.risk_score)) : "—"],
                        ["LEVEL",   entity.risk_level?.toUpperCase() ?? "—"],
                      ].map(([l, v]) => (
                        <div key={l} style={{
                          padding: "8px 10px", background: "var(--hk-bg-2)",
                          border: "1px solid var(--hk-rule)", borderRadius: 2,
                        }}>
                          <div style={{ fontFamily: "var(--hk-mono)", fontSize: 8, color: "var(--hk-text-mute)", letterSpacing: "0.1em", marginBottom: 2 }}>{l}</div>
                          <div style={{ fontFamily: "var(--hk-mono)", fontSize: 14, color: "var(--hk-text)", fontWeight: 600 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </Section>
              )}

              {/* Live queue (compact, in right column of detail view) */}
              <Section label="LIVE FEED">
                {liveQueue.length === 0 ? (
                  <div style={{
                    fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)",
                    textAlign: "center", padding: "8px 0",
                  }}>
                    — idle —
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {liveQueue.slice(-12).map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, fontFamily: "var(--hk-mono)", fontSize: 10 }}>
                        <span style={{ color: "var(--hk-text-mute)", flexShrink: 0, fontSize: 9, width: 52 }}>{r[0]}</span>
                        <span style={{ color: "var(--hk-amber-dim)", flexShrink: 0, width: 50, fontSize: 9 }}>{r[1]}</span>
                        <span style={{
                          color: r[3] as string, flex: 1,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>{r[2]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </div>
          </div>
        </main>
      </div>

      <StatusBar queueCount={isRunning ? 1 : 0} />
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────
function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{
      border: "1px solid var(--hk-rule)", borderRadius: 3,
      background: "var(--hk-surface)", overflow: "hidden",
    }}>
      <div style={{
        padding: "8px 14px", borderBottom: "1px solid var(--hk-rule)",
        background: "var(--hk-bg-2)",
      }}>
        <Label tone="amber" style={{ fontSize: 9 }}>{label}</Label>
      </div>
      <div style={{ padding: "14px 14px" }}>
        {children}
      </div>
    </div>
  );
}

// ── Signal row ─────────────────────────────────────────────────
function SignalRow({ signal }: { signal: RiskSignal }) {
  const [expanded, setExpanded] = useState(false);
  const color = sigColor(signal.severity);

  return (
    <div
      style={{
        border: "1px solid var(--hk-rule)", borderRadius: 2,
        background: "var(--hk-bg-2)", cursor: "pointer",
        transition: "border-color 0.12s",
      }}
      onClick={() => setExpanded(e => !e)}
    >
      <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{
          fontFamily: "var(--hk-mono)", fontSize: 9, letterSpacing: "0.1em",
          color, padding: "1px 5px", border: `1px solid ${color}`,
          borderRadius: 2, flexShrink: 0, opacity: 0.9,
        }}>
          {sigAbbrev(signal.signal_type)}
        </span>
        <span style={{
          fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text)",
          flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {signal.title}
        </span>
        <span style={{
          fontFamily: "var(--hk-mono)", fontSize: 9, color: "var(--hk-text-mute)", flexShrink: 0,
        }}>
          {Math.round(signal.confidence * 100)}%
        </span>
        <span style={{ fontSize: 8, color: "var(--hk-text-mute)", flexShrink: 0 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>
      {expanded && (
        <div style={{
          padding: "0 10px 10px", borderTop: "1px solid var(--hk-rule)",
          paddingTop: 8,
        }}>
          <p style={{
            fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-dim)",
            lineHeight: 1.7, margin: "0 0 6px",
          }}>
            {signal.description}
          </p>
          {signal.sources.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {signal.sources.slice(0, 3).map((src, i) => (
                <a
                  key={i}
                  href={src.startsWith("http") ? src : undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontFamily: "var(--hk-mono)", fontSize: 9, color: "var(--hk-amber-dim)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                    textDecoration: "none",
                    display: "block",
                  }}
                >
                  ↗ {src.slice(0, 60)}
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
