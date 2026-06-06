"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getEntity, getInvestigation, streamInvestigation, addEntityNote, deleteInvestigation } from "@/lib/api";
import type { Entity, Investigation, RiskLevel, RiskSignal } from "@/lib/types";
import { TopBar } from "./TopBar";
import { StatusBar } from "./StatusBar";
import { Pipeline, PIPELINE_STEPS } from "./Pipeline";
import { Label, Dot, Level } from "./atoms";
import type { PipelineStep, QueueRow } from "./types";

// ── Tool → pipeline step ───────────────────────────────────────
const TOOL_TO_STEP_IDX: Record<string, number> = {
  "extract_and_store_entity":     1,
  "run_vector_similarity_search": 2,
  "find_correlated_entities":     3,
  "classify_and_store_signals":   4,
  "synthesize_risk_report":       5,
};

// ── Risk gauge SVG ─────────────────────────────────────────────
function RiskGauge({ score, level }: { score: number; level: string }) {
  const r = 38, cx = 50, cy = 50;
  const circ = 2 * Math.PI * r;
  const dash = circ * Math.min(score / 100, 1);
  const color =
    level === "critical" ? "var(--hk-red)"   :
    level === "high"     ? "var(--hk-red)"   :
    level === "medium"   ? "var(--hk-amber)" :
    "var(--hk-green)";
  return (
    <svg viewBox="0 0 100 100" width={100} height={100} aria-label={`Risk ${Math.round(score)}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        transform="rotate(-90 50 50)"
        style={{ transition: "stroke-dasharray 0.8s ease", filter: `drop-shadow(0 0 8px ${color})` }}
      />
      <text x={cx} y={cy - 2} textAnchor="middle" fill={color}
        fontFamily="var(--hk-mono)" fontSize={24} fontWeight={800}>
        {Math.round(score)}
      </text>
      <text x={cx} y={cy + 13} textAnchor="middle" fill="rgba(255,255,255,0.3)"
        fontFamily="var(--hk-mono)" fontSize={9} letterSpacing={2}>
        /100
      </text>
    </svg>
  );
}

// ── Color helpers ──────────────────────────────────────────────
function riskColor(level: string) {
  return level === "critical" || level === "high" ? "var(--hk-red)"
    : level === "medium" ? "var(--hk-amber)"
    : "var(--hk-green)";
}

function sigAbbrev(type: string) {
  const m: Record<string, string> = {
    reputational: "REPU", financial: "FINC", regulatory: "REGL",
    litigation: "LITN", sanctions: "SANC", governance: "GOVN",
    fraud: "FRAD", other: "OTHR",
  };
  return m[type] ?? type.slice(0, 4).toUpperCase();
}

// Category tag color for findings
function catColor(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("sanc"))  return "var(--hk-red)";
  if (lower.includes("fraud")) return "var(--hk-red)";
  if (lower.includes("regu"))  return "#f4a242";
  if (lower.includes("gover")) return "var(--hk-purple)";
  if (lower.includes("finan")) return "var(--hk-blue)";
  if (lower.includes("litig")) return "var(--hk-amber)";
  if (lower.includes("repu"))  return "var(--hk-text-dim)";
  return "var(--hk-amber)";
}

// Extract [CATEGORY] tag from finding text
function extractCategory(text: string): { tag: string | null; rest: string } {
  const m = text.match(/^\[([A-Z]+)\]\s*/);
  if (m) return { tag: m[1], rest: text.slice(m[0].length) };
  return { tag: null, rest: text };
}

// Extract "PRIMARY ACTION:" / "MONITORING:" / "PERIODIC REVIEW:" prefix
function extractActionType(text: string): { type: string | null; rest: string } {
  const prefixes = ["PRIMARY ACTION", "MONITORING", "PERIODIC REVIEW"];
  for (const p of prefixes) {
    if (text.toUpperCase().startsWith(p)) {
      const rest = text.slice(p.length).replace(/^\s*:\s*/, "");
      return { type: p, rest };
    }
  }
  return { type: null, rest: text };
}

// ── Pipeline helpers ───────────────────────────────────────────
function derivePipelineIdx(inv: Investigation): number {
  if (inv.status === "completed") return PIPELINE_STEPS.length;
  if (inv.status === "failed")    return -1;
  const steps = inv.steps ?? [];
  if (steps.some(s => s.name === "intelligence" && s.status === "completed")) return 5;
  if (steps.some(s => s.name === "intelligence" && s.status === "running"))   return 2;
  if (steps.some(s => s.name === "research"     && s.status === "completed")) return 1;
  return 0;
}

function buildPipelineSteps(activeIdx: number): PipelineStep[] {
  return PIPELINE_STEPS.map((s, i) => ({
    ...s,
    state: i < activeIdx ? "done" : i === activeIdx ? "active" : "queued",
    time: "—",
  }));
}

function nowTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
  });
}

// ── Props ──────────────────────────────────────────────────────
export interface InvestigationDetailProps {
  id: string;
  initialInvestigation: Investigation | null;
  initialEntity: Entity | null;
}

// ── Component ──────────────────────────────────────────────────
export function InvestigationDetail({ id, initialInvestigation, initialEntity }: InvestigationDetailProps) {
  const router = useRouter();

  const [inv,         setInv]         = useState<Investigation | null>(initialInvestigation);
  const [entity,      setEntity]      = useState<Entity | null>(initialEntity);
  const [liveQueue,   setLiveQueue]   = useState<QueueRow[]>([]);
  const [pipelineIdx, setPipelineIdx] = useState<number>(
    initialInvestigation ? derivePipelineIdx(initialInvestigation) : -1
  );
  const [noteText,    setNoteText]    = useState("");
  const [savingNote,  setSavingNote]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const closeSSERef = useRef<(() => void) | null>(null);

  function pushQueue(time: string, source: string, msg: string, color = "var(--hk-text-dim)") {
    setLiveQueue(q => [...q.slice(-30), [time, source, msg, color]]);
  }

  const loadEntity = useCallback(async (entityId: string) => {
    try { setEntity(await getEntity(entityId)); } catch { /* entity may not exist yet */ }
  }, []);

  useEffect(() => {
    if (closeSSERef.current) { closeSSERef.current(); closeSSERef.current = null; }
    const close = streamInvestigation(id, (event) => {
      const t = nowTime();
      if (event.event === "snapshot" || event.event === "investigation_completed") {
        const data = event.data as unknown as Investigation;
        setInv(data);
        setPipelineIdx(derivePipelineIdx(data));
        if (data.result?.entity_id) loadEntity(data.result.entity_id);
      }
      if (event.event === "step") {
        const d = event.data as { name?: string; status?: string; message?: string };
        if (d.name === "research" && d.status === "running")  { setPipelineIdx(0); pushQueue(t, "web", "OSINT research started"); }
        if (d.name === "research" && d.status === "completed") { setPipelineIdx(1); pushQueue(t, "web", "research complete", "var(--hk-green)"); }
        if (d.name === "intelligence" && d.status === "running" && d.message) pushQueue(t, "intel", d.message.slice(0, 50), "var(--hk-text)");
        if (d.name === "complete" && d.status === "completed") { setPipelineIdx(PIPELINE_STEPS.length); pushQueue(t, "synth", "report ready ✓", "var(--hk-green)"); }
        getInvestigation(id).then(u => { setInv(u); if (u.result?.entity_id) loadEntity(u.result.entity_id); }).catch(() => undefined);
      }
      if (event.event === "tool_call") {
        const d = event.data as { tool?: string };
        const toolName = d.tool ?? "";
        const stepIdx = TOOL_TO_STEP_IDX[toolName];
        if (stepIdx !== undefined) setPipelineIdx(stepIdx);
        pushQueue(t, toolName.slice(0, 10), `calling ${toolName.slice(0, 34)}`, "var(--hk-amber)");
      }
      if (event.event === "agent_text") {
        const d = event.data as { agent?: string; text?: string };
        pushQueue(t, (d.agent ?? "").slice(0, 10).toLowerCase(), (d.text ?? "").slice(0, 52), "var(--hk-text)");
      }
      if (event.event === "error") {
        const d = event.data as { message?: string };
        pushQueue(t, "error", (d.message ?? "").slice(0, 52), "var(--hk-red)");
        getInvestigation(id).then(setInv).catch(() => undefined);
      }
      if (event.event === "done") {
        closeSSERef.current = null;
        getInvestigation(id).then(u => { setInv(u); setPipelineIdx(derivePipelineIdx(u)); if (u.result?.entity_id) loadEntity(u.result.entity_id); }).catch(() => undefined);
      }
    }, () => { closeSSERef.current = null; });
    closeSSERef.current = close;
    return () => { close(); closeSSERef.current = null; };
  }, [id, loadEntity]);

  useEffect(() => () => { closeSSERef.current?.(); }, []);

  const isRunning = inv?.status === "running" || inv?.status === "pending";
  const report    = inv?.result?.report;
  const signals   = inv?.result?.signals ?? [];
  const sevOrder  = { critical: 0, high: 1, medium: 2, low: 3 };
  const sortedSignals = [...signals].sort((a, b) => (sevOrder[a.severity] ?? 4) - (sevOrder[b.severity] ?? 4));
  const pipelineSteps: PipelineStep[] = buildPipelineSteps(pipelineIdx);

  async function handleAddNote() {
    if (!noteText.trim() || !entity) return;
    setSavingNote(true);
    try { const u = await addEntityNote(entity.id, noteText.trim()); setEntity(u); setNoteText(""); } catch { /* ignore */ }
    setSavingNote(false);
  }

  async function handleDelete() {
    if (!window.confirm(`Delete investigation for "${inv?.entity_name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try { await deleteInvestigation(id); router.push("/"); } catch { setDeleting(false); }
  }

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="hk-shell">
      <TopBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>
        <main style={{
          flex: 1, display: "flex", flexDirection: "column", minWidth: 0,
          overflowY: "auto", padding: "24px 36px 56px",
          position: "relative", zIndex: 2,
        }}>

          {/* ── ENTITY IDENTITY — the very first thing you read ── */}
          {inv && (
            <div style={{ marginBottom: 20, paddingBottom: 22, borderBottom: "1px solid var(--hk-rule)" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 28 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Chips row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                    <span style={{
                      fontFamily: "var(--hk-mono)", fontSize: 10, letterSpacing: "0.14em",
                      color: "var(--hk-text-mute)", padding: "2px 8px",
                      border: "1px solid var(--hk-rule)", borderRadius: 2,
                    }}>{inv.entity_type.toUpperCase()}</span>

                    <span style={{
                      fontFamily: "var(--hk-mono)", fontSize: 10, letterSpacing: "0.12em",
                      color: isRunning ? "var(--hk-amber)" : inv.status === "failed" ? "var(--hk-red)" : "var(--hk-green)",
                      padding: "2px 8px",
                      border: `1px solid ${isRunning ? "var(--hk-amber-dim)" : inv.status === "failed" ? "rgba(255,80,80,0.3)" : "rgba(80,255,140,0.3)"}`,
                      borderRadius: 2,
                    }}>
                      {isRunning ? <><span className="hk-pulse">◐</span> RUNNING</> : inv.status.toUpperCase()}
                    </span>

                    {report && (
                      <span style={{
                        fontFamily: "var(--hk-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em",
                        color: riskColor(report.risk_level), padding: "2px 10px",
                        border: `1px solid ${riskColor(report.risk_level)}`,
                        borderRadius: 2, background: `${riskColor(report.risk_level)}12`,
                      }}>
                        {report.risk_level.toUpperCase()} RISK
                      </span>
                    )}
                  </div>

                  {/* THE NAME — the headline */}
                  <h1 style={{
                    fontFamily: "var(--hk-mono)", fontSize: 44, fontWeight: 900,
                    color: "var(--hk-text)", letterSpacing: "-0.025em", lineHeight: 1,
                    margin: "0 0 16px 0",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                  }}>
                    {inv.entity_name}
                  </h1>

                  {/* Meta row */}
                  <div style={{
                    display: "flex", gap: 20, flexWrap: "wrap",
                    fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-mute)",
                    letterSpacing: "0.04em",
                  }}>
                    <span>ID · {inv.id.slice(-8).toUpperCase()}</span>
                    <span>{new Date(inv.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC</span>
                    {signals.length > 0 && <span style={{ color: "var(--hk-amber)" }}>{signals.length} SIGNALS</span>}
                    {report?.analyst_confidence != null && (
                      <span>CONFIDENCE · {Math.round(report.analyst_confidence * 100)}%</span>
                    )}
                  </div>
                </div>

                {/* Risk gauge */}
                {report && (
                  <div style={{ flexShrink: 0 }}>
                    <RiskGauge score={report.overall_risk_score} level={report.risk_level} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Action bar (secondary) ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 22 }}>
            <button type="button" onClick={() => router.push("/")} className="hk-bare-btn" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.08em",
              color: "var(--hk-text-dim)", padding: "5px 12px",
              border: "1px solid var(--hk-rule)", borderRadius: 2,
            }}>← TERMINAL</button>

            <span style={{ flex: 1 }} />

            <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)", padding: "4px 10px", border: "1px solid var(--hk-rule)", borderRadius: 2 }}>
              ⚠ KYC/AML · NOT INVESTMENT ADVICE
            </span>

            {inv?.status === "completed" && (
              <button type="button" onClick={() => window.print()} className="hk-bare-btn" style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.08em",
                color: "var(--hk-bg)", padding: "5px 14px",
                background: "var(--hk-amber)", borderRadius: 2, fontWeight: 700,
              }}>↓ EXPORT PDF</button>
            )}

            <button type="button" onClick={handleDelete} disabled={deleting} className="hk-bare-btn" style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              fontFamily: "var(--hk-mono)", fontSize: 11,
              color: "var(--hk-red)", padding: "5px 12px",
              border: "1px solid rgba(255,85,98,0.3)", borderRadius: 2,
              opacity: deleting ? 0.5 : 1,
            }}>{deleting ? "…" : "✕ DELETE"}</button>
          </div>

          {/* ── Pipeline (compact when complete) ── */}
          {(!report || isRunning) && (
            <div style={{ marginBottom: 18 }}>
              <Pipeline steps={pipelineSteps} />
            </div>
          )}
          {report && !isRunning && (
            <div style={{ marginBottom: 18, padding: "8px 16px", background: "var(--hk-surface)", border: "1px solid var(--hk-rule)", borderRadius: 3, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "var(--hk-green)", fontSize: 11, fontFamily: "var(--hk-mono)", letterSpacing: "0.1em" }}>✓</span>
              <span style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-dim)", letterSpacing: "0.06em" }}>ALL 6 PIPELINE STEPS COMPLETE</span>
              <span style={{ flex: 1 }} />
              {[...PIPELINE_STEPS].map((s, i) => (
                <span key={i} style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-green)", opacity: 0.6 }}>
                  {s.k}
                </span>
              ))}
            </div>
          )}

          {/* ── Report content ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 28, minWidth: 0 }}>

            {/* LEFT: The actual report */}
            <div style={{ display: "flex", flexDirection: "column" }}>

              {/* EXECUTIVE SUMMARY */}
              {report?.executive_summary && (
                <ReportSection label="EXECUTIVE SUMMARY" accent={riskColor(report.risk_level)}>
                  <div style={{
                    paddingLeft: 20,
                    borderLeft: `3px solid ${riskColor(report.risk_level)}`,
                  }}>
                    <p style={{
                      fontFamily: "var(--hk-mono)", fontSize: 15, color: "var(--hk-text)",
                      lineHeight: 2.0, margin: 0, fontWeight: 400,
                    }}>
                      {report.executive_summary}
                    </p>
                  </div>
                </ReportSection>
              )}

              {/* KEY FINDINGS */}
              {report?.key_findings && report.key_findings.length > 0 && (
                <ReportSection label="KEY FINDINGS" accent="var(--hk-amber)">
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {report.key_findings.map((f, i) => {
                      const { tag, rest } = extractCategory(f);
                      const color = tag ? catColor(tag) : "var(--hk-amber)";
                      const isLast = i === report.key_findings.length - 1;
                      return (
                        <div key={i} style={{
                          display: "flex", gap: 20, alignItems: "flex-start",
                          paddingBottom: isLast ? 0 : 22,
                          marginBottom: isLast ? 0 : 22,
                          borderBottom: isLast ? "none" : "1px solid var(--hk-rule-soft)",
                        }}>
                          {/* Large dim index number */}
                          <div style={{
                            fontFamily: "var(--hk-mono)", fontSize: 30, fontWeight: 900,
                            color: "rgba(255,255,255,0.05)", letterSpacing: "-0.02em",
                            lineHeight: 1, flexShrink: 0, width: 40, paddingTop: 2,
                            textAlign: "right",
                          }}>
                            {String(i + 1).padStart(2, "0")}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {tag && (
                              <div style={{
                                fontFamily: "var(--hk-mono)", fontSize: 10, fontWeight: 700,
                                letterSpacing: "0.14em", color, marginBottom: 8,
                              }}>▸ {tag}</div>
                            )}
                            <p style={{
                              fontFamily: "var(--hk-mono)", fontSize: 14, color: "var(--hk-text)",
                              lineHeight: 1.85, margin: 0,
                            }}>{rest}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ReportSection>
              )}

              {/* RECOMMENDATIONS */}
              {report?.recommendations && report.recommendations.length > 0 && (
                <ReportSection label="RECOMMENDED ACTIONS" accent="var(--hk-green)">
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {report.recommendations.map((rec, i) => {
                      const { type, rest } = extractActionType(rec);
                      const typeColor =
                        type === "PRIMARY ACTION" ? riskColor(report.risk_level)
                        : type === "MONITORING"   ? "var(--hk-amber)"
                        : "var(--hk-blue)";
                      return (
                        <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                          <div style={{
                            flexShrink: 0, width: 5, height: 5, borderRadius: "50%",
                            background: typeColor, marginTop: 7,
                          }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            {type && (
                              <div style={{
                                fontFamily: "var(--hk-mono)", fontSize: 10, fontWeight: 700,
                                letterSpacing: "0.14em", color: typeColor, marginBottom: 7,
                              }}>{type}</div>
                            )}
                            <p style={{
                              fontFamily: "var(--hk-mono)", fontSize: 14, color: "var(--hk-text)",
                              lineHeight: 1.85, margin: 0,
                            }}>{rest}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ReportSection>
              )}

              {/* Running / Failed states */}
              {isRunning && (
                <ReportSection label="INTELLIGENCE REPORT" accent="var(--hk-amber)">
                  <div style={{ fontFamily: "var(--hk-mono)", fontSize: 13, color: "var(--hk-amber)", padding: "20px 0", display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="hk-pulse">◐</span>
                    PIPELINE RUNNING — REPORT GENERATING…
                  </div>
                </ReportSection>
              )}
              {!report && !isRunning && inv && (
                <ReportSection label="REPORT" accent="var(--hk-rule)">
                  <div style={{ fontFamily: "var(--hk-mono)", fontSize: 13, color: "var(--hk-text-mute)", padding: "20px 0", textAlign: "center" }}>
                    {inv.status === "failed" ? `INVESTIGATION FAILED — ${inv.error ?? "Unknown error"}` : "REPORT NOT AVAILABLE"}
                  </div>
                </ReportSection>
              )}

              {/* ANALYST NOTES */}
              {entity && (
                <ReportSection label={`ANALYST NOTES · ${entity.analyst_notes.length}`} accent="var(--hk-blue)" style={{ marginTop: 4 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: entity.analyst_notes.length > 0 ? 14 : 0 }}>
                    {entity.analyst_notes.length === 0 ? (
                      <div style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-mute)", paddingBottom: 4 }}>
                        No analyst notes yet. Add your observations below.
                      </div>
                    ) : (
                      entity.analyst_notes.slice().reverse().map((note) => (
                        <div key={note.id} style={{ padding: "12px 14px", background: "var(--hk-bg-2)", border: "1px solid var(--hk-rule)", borderRadius: 3 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                            <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-blue)", letterSpacing: "0.1em", fontWeight: 700 }}>
                              {note.author.toUpperCase()}
                            </span>
                            <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)" }}>
                              {new Date(note.created_at).toISOString().slice(0, 16).replace("T", " ")} UTC
                            </span>
                          </div>
                          <p style={{ fontFamily: "var(--hk-mono)", fontSize: 13, color: "var(--hk-text)", lineHeight: 1.7, margin: 0 }}>
                            {note.content}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <input
                      type="text" value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddNote(); } }}
                      placeholder="add analyst note…"
                      style={{
                        flex: 1, fontFamily: "var(--hk-mono)", fontSize: 12,
                        background: "var(--hk-bg-2)", border: "1px solid var(--hk-rule)",
                        borderRadius: 2, padding: "8px 12px",
                        color: "var(--hk-text)", outline: "none", caretColor: "var(--hk-amber)",
                      }}
                    />
                    <button type="button" onClick={handleAddNote} disabled={!noteText.trim() || savingNote} className="hk-bare-btn" style={{
                      padding: "7px 16px", fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.08em",
                      background: "var(--hk-amber)", color: "var(--hk-bg)", fontWeight: 700, borderRadius: 2,
                      opacity: (!noteText.trim() || savingNote) ? 0.5 : 1,
                    }}>
                      {savingNote ? "…" : "ADD"}
                    </button>
                  </div>
                </ReportSection>
              )}
            </div>

            {/* RIGHT: Sidebar */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

              {/* Risk breakdown */}
              {report?.risk_breakdown && Object.keys(report.risk_breakdown).length > 0 && (
                <SideSection label="RISK BREAKDOWN">
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {Object.entries(report.risk_breakdown)
                      .sort((a, b) => {
                        const o = { critical: 4, high: 3, medium: 2, low: 1 };
                        return (o[b[1].max_severity as keyof typeof o] ?? 0) - (o[a[1].max_severity as keyof typeof o] ?? 0);
                      })
                      .map(([cat, data]) => {
                        const color = riskColor(data.max_severity);
                        return (
                          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{
                              fontFamily: "var(--hk-mono)", fontSize: 10, fontWeight: 700,
                              color, padding: "1px 5px", border: `1px solid ${color}`,
                              borderRadius: 2, flexShrink: 0, width: 46, textAlign: "center",
                              opacity: 0.85,
                            }}>{sigAbbrev(cat)}</span>
                            <div style={{ flex: 1, height: 2, background: "var(--hk-rule)", borderRadius: 1, position: "relative" }}>
                              <div style={{
                                position: "absolute", left: 0, top: 0, bottom: 0,
                                width: `${Math.min(data.count * 22, 100)}%`,
                                background: color, borderRadius: 1, opacity: 0.75,
                              }} />
                            </div>
                            <span style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-mute)", flexShrink: 0, minWidth: 16, textAlign: "right" }}>
                              {data.count}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </SideSection>
              )}

              {/* Risk signals */}
              <SideSection label={`RISK SIGNALS · ${sortedSignals.length}`}>
                {sortedSignals.length === 0 ? (
                  <div style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-mute)", textAlign: "center", padding: "12px 0" }}>
                    {isRunning ? <><span className="hk-pulse">◐</span> CLASSIFYING…</> : "NO SIGNALS"}
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {sortedSignals.map(sig => <SignalRow key={sig.id} signal={sig} />)}
                  </div>
                )}
              </SideSection>

              {/* Entity profile */}
              {entity && (
                <SideSection label="ENTITY PROFILE">
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {entity.summary && (
                      <p style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text)", lineHeight: 1.7, margin: 0 }}>
                        {entity.summary}
                      </p>
                    )}
                    {entity.aliases.length > 0 && (
                      <div>
                        <div style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)", letterSpacing: "0.1em", marginBottom: 5 }}>ALIASES</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {entity.aliases.map((a, i) => (
                            <span key={i} style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-dim)", padding: "2px 7px", border: "1px solid var(--hk-rule)", borderRadius: 2 }}>
                              {a}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 2 }}>
                      {[
                        ["TYPE",    entity.entity_type.toUpperCase()],
                        ["SIGNALS", String(signals.length)],
                        ["SCORE",   entity.risk_score != null ? String(Math.round(entity.risk_score)) : "—"],
                        ["LEVEL",   entity.risk_level?.toUpperCase() ?? "—"],
                      ].map(([l, v]) => (
                        <div key={l} style={{ padding: "9px 11px", background: "var(--hk-bg-2)", border: "1px solid var(--hk-rule)", borderRadius: 2 }}>
                          <div style={{ fontFamily: "var(--hk-mono)", fontSize: 9, color: "var(--hk-text-mute)", letterSpacing: "0.1em", marginBottom: 3 }}>{l}</div>
                          <div style={{ fontFamily: "var(--hk-mono)", fontSize: 15, color: "var(--hk-text)", fontWeight: 700 }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </SideSection>
              )}

              {/* Live feed — only show while running */}
              {isRunning && liveQueue.length > 0 && (
                <SideSection label="LIVE FEED">
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {liveQueue.slice(-10).map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, fontFamily: "var(--hk-mono)", fontSize: 10 }}>
                        <span style={{ color: "var(--hk-text-mute)", flexShrink: 0, width: 52 }}>{r[0]}</span>
                        <span style={{ color: "var(--hk-amber-dim)", flexShrink: 0, width: 50 }}>{r[1]}</span>
                        <span style={{ color: r[3] as string, flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r[2]}</span>
                      </div>
                    ))}
                  </div>
                </SideSection>
              )}
            </div>
          </div>
        </main>
      </div>
      <StatusBar queueCount={isRunning ? 1 : 0} />
    </div>
  );
}

// ── Report section (left column) ────────────────────────────────
function ReportSection({
  label, accent, children, style,
}: {
  label: string;
  accent: string;
  children: ReactNode;
  elevated?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ marginBottom: 36, ...style }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 22, paddingBottom: 12,
        borderBottom: "1px solid var(--hk-rule)",
      }}>
        <div style={{ width: 3, height: 13, background: accent, borderRadius: 2, flexShrink: 0 }} />
        <span style={{
          fontFamily: "var(--hk-mono)", fontSize: 10, fontWeight: 700,
          letterSpacing: "0.18em", color: "var(--hk-text-mute)",
          textTransform: "uppercase",
        }}>{label}</span>
      </div>
      {children}
    </div>
  );
}

// ── Sidebar section (right column) ──────────────────────────────
function SideSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--hk-rule)", borderRadius: 3, background: "var(--hk-surface)", overflow: "hidden" }}>
      <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--hk-rule)", background: "var(--hk-bg-2)" }}>
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: "var(--hk-text-mute)", textTransform: "uppercase" }}>
          {label}
        </span>
      </div>
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </div>
  );
}

// ── Signal row ────────────────────────────────────────────────
function SignalRow({ signal }: { signal: RiskSignal }) {
  const [expanded, setExpanded] = useState(false);
  const color = riskColor(signal.severity);
  return (
    <div
      style={{ border: "1px solid var(--hk-rule)", borderRadius: 2, background: "var(--hk-bg-2)", cursor: "pointer", transition: "border-color 0.12s" }}
      onClick={() => setExpanded(e => !e)}
    >
      <div style={{ padding: "8px 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, letterSpacing: "0.08em", color, padding: "1px 5px", border: `1px solid ${color}`, borderRadius: 2, flexShrink: 0, opacity: 0.9 }}>
          {sigAbbrev(signal.signal_type)}
        </span>
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text)", flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {signal.title}
        </span>
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)", flexShrink: 0 }}>{Math.round(signal.confidence * 100)}%</span>
        <span style={{ fontSize: 8, color: "var(--hk-text-mute)", flexShrink: 0 }}>{expanded ? "▲" : "▼"}</span>
      </div>
      {expanded && (
        <div style={{ padding: "0 10px 10px", borderTop: "1px solid var(--hk-rule)", paddingTop: 8 }}>
          <p style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-dim)", lineHeight: 1.7, margin: "0 0 6px" }}>
            {signal.description}
          </p>
          {signal.sources.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {signal.sources.slice(0, 3).map((src, i) => (
                <a key={i} href={src.startsWith("http") ? src : undefined} target="_blank" rel="noopener noreferrer"
                  style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-amber-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: "none", display: "block" }}>
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
