"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { TopBar }       from "./TopBar";
import { LeftNav }      from "./LeftNav";
import { QueryBar }     from "./QueryBar";
import { Pipeline, PIPELINE_STEPS } from "./Pipeline";
import { DossierTable } from "./DossierTable";
import { RightRail }    from "./RightRail";
import { StatusBar }    from "./StatusBar";
import { Label }        from "./atoms";

import {
  createInvestigation,
  deleteInvestigation,
  getInvestigation,
  listInvestigations,
  streamInvestigation,
  getWatchlists,
  listAllSignals,
} from "@/lib/api";
import type { Investigation, EntityType } from "@/lib/types";
import type { WatchlistPattern, SignalRow } from "@/lib/api";
import type { PipelineStep, QueueRow } from "./types";

// ── Tool → pipeline step index ─────────────────────────────────
const TOOL_TO_STEP_IDX: Record<string, number> = {
  "extract_and_store_entity":     1,
  "run_vector_similarity_search": 2,
  "find_correlated_entities":     3,
  "classify_and_store_signals":   4,
  "synthesize_risk_report":       5,
};

function buildPipelineSteps(
  activeIdx: number,
  stepTimes: Record<number, number>,
  now: number,
): PipelineStep[] {
  return PIPELINE_STEPS.map((s, i) => {
    const startMs = stepTimes[i];
    const elapsed = startMs ? Math.round((now - startMs) / 1000) + "s" : "—";
    const state =
      i < activeIdx   ? "done"   :
      i === activeIdx ? "active" :
      "queued";
    return {
      ...s,
      state,
      time: state === "done" ? elapsed : state === "active" ? elapsed : "—",
      progress: state === "active" ? 0.5 : undefined,
    };
  });
}

// ── Sidebar view types ──────────────────────────────────────────
type NavView = "query" | "investigations" | "dossiers" | "watchlists" | "signals" | "correlations" | "exports";

// ── Props ───────────────────────────────────────────────────────
export interface TerminalHomeProps {
  initialInvestigations: Investigation[];
  entityCount: number;
}

// ============================================================
// Main component
// ============================================================

export function TerminalHome({ initialInvestigations, entityCount }: TerminalHomeProps) {
  const router = useRouter();

  // Nav
  const [activeView, setActiveView] = useState<NavView>("query");

  // Query state
  const [query,      setQuery]      = useState("");
  const [entityType, setEntityType] = useState<EntityType>("company");
  const [context,    setContext]    = useState("");

  // Investigations
  const [investigations, setInvestigations] = useState<Investigation[]>(initialInvestigations);

  // Active running investigation
  const [activeId,  setActiveId]  = useState<string | null>(null);
  const [activeInv, setActiveInv] = useState<Investigation | null>(null);

  // Pipeline display
  const [pipelineIdx,    setPipelineIdx]    = useState(-1);
  const [stepTimes,      setStepTimes]      = useState<Record<number, number>>({});
  const [pipelineStatus, setPipelineStatus] = useState<string | undefined>();

  // Live queue
  const [liveQueue, setLiveQueue] = useState<QueueRow[]>([]);

  // Sidebar data
  const [watchlists,  setWatchlists]  = useState<WatchlistPattern[]>([]);
  const [signals,     setSignals]     = useState<SignalRow[]>([]);
  const [sideLoading, setSideLoading] = useState(false);

  // Ticker
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const closeSSERef = useRef<(() => void) | null>(null);

  // ── Load sidebar data when view changes ────────────────────
  useEffect(() => {
    async function loadView() {
      if (activeView === "watchlists" && watchlists.length === 0) {
        setSideLoading(true);
        try { setWatchlists(await getWatchlists()); } catch { /* ignore */ }
        setSideLoading(false);
      }
      if ((activeView === "signals" || activeView === "correlations") && signals.length === 0) {
        setSideLoading(true);
        try { setSignals(await listAllSignals(200)); } catch { /* ignore */ }
        setSideLoading(false);
      }
    }
    loadView();
  }, [activeView]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh investigations list ────────────────────────────
  const refreshInvestigations = useCallback(async () => {
    try { setInvestigations(await listInvestigations(30)); } catch { /* ignore */ }
  }, []);

  // ── Push to live queue ─────────────────────────────────────
  function pushQueue(time: string, source: string, msg: string, color = "var(--hk-text-dim)") {
    setLiveQueue(q => [...q.slice(-20), [time, source, msg, color]]);
  }

  function nowTime() {
    return new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
    });
  }

  // ── Start investigation ────────────────────────────────────
  async function handleRun() {
    if (!query.trim() || activeId) return;
    if (closeSSERef.current) { closeSSERef.current(); closeSSERef.current = null; }

    // Switch to query view if on another view
    setActiveView("query");

    try {
      const inv = await createInvestigation({
        entity_name: query.trim(),
        entity_type: entityType,
        context: (context.trim() || undefined),
      });
      setActiveId(inv.id);
      setActiveInv(inv);
      setPipelineIdx(0);
      setStepTimes({ 0: Date.now() });
      setLiveQueue([]);
      pushQueue(nowTime(), "init", `scan begin · ${inv.entity_name}`, "var(--hk-text-dim)");
      setPipelineStatus(undefined);

      const close = streamInvestigation(
        inv.id,
        (event) => {
          const t = nowTime();

          if (event.event === "snapshot" || event.event === "investigation_completed") {
            const data = event.data as unknown as Investigation;
            setActiveInv(data);
            setInvestigations(prev => {
              const without = prev.filter(i => i.id !== data.id);
              return [data, ...without];
            });
          }

          if (event.event === "step") {
            const d = event.data as { name?: string; status?: string; message?: string };
            if (d.name === "research" && d.status === "running") {
              setPipelineIdx(0);
              setStepTimes(s => ({ ...s, 0: Date.now() }));
              pushQueue(t, "web", "OSINT research starting", "var(--hk-text-dim)");
            }
            if (d.name === "research" && d.status === "completed") {
              setPipelineIdx(1);
              setStepTimes(s => ({ ...s, 1: Date.now() }));
              pushQueue(t, "web", "research complete", "var(--hk-green)");
            }
            if (d.name === "intelligence" && d.status === "running") {
              if (d.message) pushQueue(t, "intel", d.message.slice(0, 44), "var(--hk-text)");
            }
            if (d.name === "complete" && d.status === "completed") {
              setPipelineIdx(PIPELINE_STEPS.length);
              setPipelineStatus(`ALL ${PIPELINE_STEPS.length} STEPS COMPLETE`);
              pushQueue(t, "synth", "report ready ✓", "var(--hk-green)");
            }
            getInvestigation(inv.id).then(u => {
              setActiveInv(u);
              setInvestigations(prev => {
                const w = prev.filter(i => i.id !== u.id);
                return [u, ...w];
              });
            }).catch(() => undefined);
          }

          if (event.event === "tool_call") {
            const d = event.data as { tool?: string };
            const toolName = d.tool ?? "";
            const stepIdx = TOOL_TO_STEP_IDX[toolName];
            if (stepIdx !== undefined) {
              setPipelineIdx(stepIdx);
              setStepTimes(s => ({ ...s, [stepIdx]: Date.now() }));
            }
            pushQueue(t, toolName.slice(0, 12), `calling ${toolName.slice(0, 30)}`, "var(--hk-amber)");
          }

          if (event.event === "agent_text") {
            const d = event.data as { agent?: string; text?: string };
            const src = (d.agent ?? "agent").slice(0, 12).toLowerCase();
            pushQueue(t, src, (d.text ?? "").slice(0, 44), "var(--hk-text)");
          }

          if (event.event === "done") {
            setActiveId(null);
            closeSSERef.current = null;
            refreshInvestigations();
            // refresh signals if signals view was open
            listAllSignals(200).then(setSignals).catch(() => undefined);
          }

          if (event.event === "error") {
            const d = event.data as { message?: string };
            pushQueue(t, "error", (d.message ?? "unknown error").slice(0, 44), "var(--hk-red)");
            setActiveId(null);
            refreshInvestigations();
          }
        },
        () => { setActiveId(null); refreshInvestigations(); },
      );

      closeSSERef.current = close;
    } catch (err) {
      pushQueue(nowTime(), "error", err instanceof Error ? err.message.slice(0, 44) : "failed", "var(--hk-red)");
    }
  }

  useEffect(() => () => { closeSSERef.current?.(); }, []);

  // Build pipeline
  const pipelineSteps: PipelineStep[] = pipelineIdx < 0
    ? PIPELINE_STEPS.map(s => ({ ...s, state: "queued" as const, time: "—" }))
    : buildPipelineSteps(pipelineIdx, stepTimes, Date.now() + tick * 0);

  const isRunning = !!activeId;

  // ── Nav handler ────────────────────────────────────────────
  function handleNav(view: string) {
    setActiveView(view as NavView);
  }

  // ── Download report JSON ───────────────────────────────────
  function downloadReport(inv: Investigation) {
    const blob = new Blob([JSON.stringify(inv, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `hawkai-${inv.entity_name.replace(/\s+/g, "-")}-${inv.id.slice(-6)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleDeleteInvestigation(invId: string) {
    try {
      await deleteInvestigation(invId);
      setInvestigations(prev => prev.filter(i => i.id !== invId));
    } catch { /* ignore */ }
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="hk-shell">
      <TopBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <LeftNav
          investigations={investigations}
          activeView={activeView}
          onNav={handleNav}
          onSelectRecent={(inv) => router.push(`/investigations/${inv.id}`)}
          entityCount={entityCount}
          entityPct={Math.min(entityCount / 50, 1)}
        />

        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 2 }}>

          {/* ── QUERY VIEW (home) ── */}
          {(activeView === "query" || activeView === "investigations" || activeView === "dossiers") && (
            <>
              <QueryBar
                query={query}
                entityType={entityType}
                context={context}
                isRunning={isRunning}
                onQueryChange={setQuery}
                onEntityTypeChange={(t) => { setEntityType(t); setContext(""); }}
                onContextChange={setContext}
                onRun={handleRun}
              />
              <Pipeline steps={pipelineSteps} status={pipelineStatus} />
              <DossierTable investigations={investigations} highlightId={activeId ?? undefined} onDelete={handleDeleteInvestigation} />
            </>
          )}

          {/* ── SIGNALS LIBRARY ── */}
          {activeView === "signals" && (
            <SignalsLibraryView signals={signals} loading={sideLoading} />
          )}

          {/* ── WATCHLISTS ── */}
          {activeView === "watchlists" && (
            <WatchlistsView watchlists={watchlists} loading={sideLoading} />
          )}

          {/* ── CORRELATIONS ── */}
          {activeView === "correlations" && (
            <CorrelationsView investigations={investigations} signals={signals} />
          )}

          {/* ── EXPORTS ── */}
          {activeView === "exports" && (
            <ExportsView investigations={investigations} onDownload={downloadReport} />
          )}
        </main>

        <RightRail
          investigations={investigations}
          liveQueue={liveQueue}
          activeInvestigationName={activeInv?.entity_name}
        />
      </div>
      <StatusBar queueCount={isRunning ? 1 : 0} />
    </div>
  );
}

// ============================================================
// ── SIGNALS LIBRARY VIEW ──
// ============================================================

function SignalsLibraryView({ signals, loading }: { signals: SignalRow[]; loading: boolean }) {
  const [filter, setFilter] = useState("ALL");
  const sevColor = (s: string) =>
    s === "critical" || s === "high" ? "var(--hk-red)"
    : s === "medium" ? "var(--hk-amber)"
    : "var(--hk-green)";

  const types = ["ALL", "SANCTIONS", "FRAUD", "REGULATORY", "GOVERNANCE", "FINANCIAL", "LITIGATION", "REPUTATIONAL"];
  const filtered = filter === "ALL"
    ? signals
    : signals.filter(s => s.signal_type.toUpperCase() === filter);

  return (
    <div style={{ padding: "20px 28px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <Label tone="amber">&gt; SIGNALS LIBRARY · {signals.length} TOTAL</Label>
        <span style={{ flex: 1, height: 1, background: "var(--hk-rule)" }} />
      </div>

      {/* Type filter chips */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
        {types.map(t => (
          <button key={t} type="button" onClick={() => setFilter(t)} className="hk-bare-btn" style={{
            padding: "4px 10px", fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.08em",
            border: `1px solid ${t === filter ? "var(--hk-amber-dim)" : "var(--hk-rule)"}`,
            color: t === filter ? "var(--hk-amber)" : "var(--hk-text-dim)",
            background: t === filter ? "var(--hk-amber-soft)" : "transparent", borderRadius: 2,
          }}>{t}</button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--hk-rule)", borderRadius: 3, background: "var(--hk-surface)", overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-amber)" }}>
            <span className="hk-pulse">◐</span> LOADING SIGNALS…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-mute)" }}>
            NO SIGNALS — RUN INVESTIGATIONS TO POPULATE
          </div>
        ) : filtered.map((sig, i) => (
          <div key={sig.id ?? i} style={{
            display: "grid", gridTemplateColumns: "100px 80px 70px 1fr 80px 60px",
            gap: 14, padding: "12px 16px",
            borderBottom: i < filtered.length - 1 ? "1px solid var(--hk-rule-soft)" : "none",
            fontFamily: "var(--hk-mono)", fontSize: 13,
          }}>
            <span style={{ color: "var(--hk-text-mute)", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sig.entity_name}
            </span>
            <span style={{ color: sevColor(sig.signal_type), fontSize: 11, letterSpacing: "0.08em" }}>
              {sig.signal_type.toUpperCase().slice(0, 4)}
            </span>
            <span style={{
              color: sevColor(sig.severity), fontSize: 11, fontWeight: 700,
              padding: "1px 6px", border: `1px solid ${sevColor(sig.severity)}`, borderRadius: 2,
              alignSelf: "start",
            }}>
              {sig.severity.toUpperCase()}
            </span>
            <span style={{ color: "var(--hk-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sig.title}
            </span>
            <span style={{ color: "var(--hk-text-dim)", fontSize: 11 }}>
              {Math.round(sig.confidence * 100)}% conf.
            </span>
            <span style={{ color: "var(--hk-text-mute)", fontSize: 11 }}>
              {new Date(sig.created_at).toLocaleDateString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ── WATCHLISTS VIEW ──
// ============================================================

function WatchlistsView({ watchlists, loading }: { watchlists: WatchlistPattern[]; loading: boolean }) {
  const sevColor = (s: string) =>
    s === "critical" ? "var(--hk-red)"
    : s === "high" ? "var(--hk-red)"
    : s === "medium" ? "var(--hk-amber)"
    : "var(--hk-green)";

  return (
    <div style={{ padding: "20px 28px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Label tone="amber">&gt; WATCHLIST PATTERNS · {watchlists.length} ACTIVE</Label>
        <span style={{ flex: 1, height: 1, background: "var(--hk-rule)" }} />
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-green)", letterSpacing: "0.1em" }}>● LIVE</span>
      </div>

      <div style={{
        marginBottom: 14, padding: "12px 16px",
        background: "var(--hk-amber-soft)", border: "1px solid var(--hk-amber-dim)", borderRadius: 3,
      }}>
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-dim)" }}>
          These patterns are matched against every research brief during signal classification. Each match generates a risk signal automatically.
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--hk-rule)", borderRadius: 3, background: "var(--hk-surface)", overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-amber)" }}>
            <span className="hk-pulse">◐</span> LOADING…
          </div>
        ) : watchlists.map((w, i) => (
          <div key={i} style={{
            padding: "14px 16px",
            borderBottom: i < watchlists.length - 1 ? "1px solid var(--hk-rule-soft)" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <span style={{
                fontFamily: "var(--hk-mono)", fontWeight: 700, fontSize: 13,
                color: "var(--hk-text)", letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}>{w.pattern}</span>
              <span style={{
                fontFamily: "var(--hk-mono)", fontSize: 11, fontWeight: 700,
                color: sevColor(w.severity), padding: "1px 7px",
                border: `1px solid ${sevColor(w.severity)}`, borderRadius: 2,
              }}>{w.severity.toUpperCase()}</span>
              <span style={{
                fontFamily: "var(--hk-mono)", fontSize: 11,
                color: "var(--hk-text-mute)", padding: "1px 7px",
                border: "1px solid var(--hk-rule)", borderRadius: 2,
              }}>{w.signal_type}</span>
            </div>
            <div style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-dim)", marginBottom: 8, lineHeight: 1.6 }}>
              {w.description}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {w.keywords.map((k, j) => (
                <span key={j} style={{
                  fontFamily: "var(--hk-mono)", fontSize: 11,
                  color: "var(--hk-amber-dim)", padding: "2px 7px",
                  border: "1px solid var(--hk-amber-dim)", borderRadius: 2,
                  background: "var(--hk-amber-soft)",
                }}>{k}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// ── CORRELATIONS VIEW ──
// ============================================================

function CorrelationsView({ investigations, signals }: { investigations: Investigation[]; signals: SignalRow[] }) {
  const completed = investigations.filter(i => i.status === "completed" && i.result?.report);

  const sevColor = (s: string) =>
    s === "critical" || s === "high" ? "var(--hk-red)"
    : s === "medium" ? "var(--hk-amber)"
    : "var(--hk-green)";

  // Build entity risk matrix from completed investigations
  const entities = completed.map(inv => ({
    name: inv.entity_name,
    type: inv.entity_type,
    score: inv.result!.report!.overall_risk_score,
    level: inv.result!.report!.risk_level,
    signals: inv.result?.signals?.length ?? 0,
    id: inv.id,
    breakdown: inv.result?.report?.risk_breakdown ?? {},
  })).sort((a, b) => b.score - a.score);

  return (
    <div style={{ padding: "20px 28px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Label tone="amber">&gt; ENTITY CORRELATION MATRIX · {entities.length} ENTITIES</Label>
        <span style={{ flex: 1, height: 1, background: "var(--hk-rule)" }} />
      </div>

      <div style={{
        marginBottom: 14, padding: "12px 16px",
        background: "rgba(126,182,255,0.04)", border: "1px solid rgba(126,182,255,0.15)", borderRadius: 3,
      }}>
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-dim)" }}>
          Entities are connected via 768-dimensional vector embeddings (gemini-embedding-001).
          Entities with similar risk profiles, jurisdictions, and adverse patterns cluster together in vector space.
        </span>
      </div>

      {entities.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-mute)" }}>
          NO ENTITIES — RUN INVESTIGATIONS TO BUILD THE CORRELATION MATRIX
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entities.map((e, i) => {
            const barW = `${Math.min(e.score, 100)}%`;
            const color = sevColor(e.level);
            return (
              <div key={e.id} style={{
                padding: "14px 16px", background: "var(--hk-surface)",
                border: "1px solid var(--hk-rule)", borderRadius: 3,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <span style={{
                    fontFamily: "var(--hk-mono)", fontWeight: 700, fontSize: 14, color: "var(--hk-text)",
                  }}>{e.name}</span>
                  <span style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-mute)" }}>
                    {e.type.toUpperCase()}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span style={{
                    fontFamily: "var(--hk-mono)", fontSize: 22, fontWeight: 700, color,
                  }}>{Math.round(e.score)}</span>
                  <span style={{
                    fontFamily: "var(--hk-mono)", fontSize: 11, fontWeight: 700, color,
                    padding: "2px 8px", border: `1px solid ${color}`, borderRadius: 2,
                  }}>{e.level.toUpperCase()}</span>
                  <span style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-mute)" }}>
                    {e.signals} signals
                  </span>
                </div>
                <div style={{ height: 3, background: "var(--hk-bg)", borderRadius: 2, marginBottom: 8 }}>
                  <div style={{ height: "100%", width: barW, background: color, borderRadius: 2, opacity: 0.8 }} />
                </div>
                {Object.keys(e.breakdown).length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {Object.entries(e.breakdown).map(([cat, data]: [string, { count: number; max_severity: string }]) => (
                      <span key={cat} style={{
                        fontFamily: "var(--hk-mono)", fontSize: 11,
                        color: sevColor(data.max_severity), padding: "1px 7px",
                        border: `1px solid ${sevColor(data.max_severity)}`, borderRadius: 2,
                        opacity: 0.8,
                      }}>
                        {cat.slice(0, 4).toUpperCase()}·{data.count}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// ── EXPORTS VIEW ──
// ============================================================

function ExportsView({ investigations, onDownload }: {
  investigations: Investigation[];
  onDownload: (inv: Investigation) => void;
}) {
  const completed = investigations.filter(i => i.status === "completed");

  const sevColor = (l: string) =>
    l === "critical" || l === "high" ? "var(--hk-red)"
    : l === "medium" ? "var(--hk-amber)"
    : "var(--hk-green)";

  return (
    <div style={{ padding: "20px 28px", flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <Label tone="amber">&gt; EXPORTS · {completed.length} REPORTS AVAILABLE</Label>
        <span style={{ flex: 1, height: 1, background: "var(--hk-rule)" }} />
      </div>

      <div style={{
        marginBottom: 14, padding: "12px 16px",
        background: "var(--hk-surface)", border: "1px solid var(--hk-rule)", borderRadius: 3,
        display: "flex", gap: 20, alignItems: "center",
      }}>
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-dim)" }}>
          Download full investigation reports as structured JSON — includes risk score, all signals, findings, and recommendations.
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, border: "1px solid var(--hk-rule)", borderRadius: 3, background: "var(--hk-surface)", overflowY: "auto" }}>
        {completed.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontFamily: "var(--hk-mono)", fontSize: 12, color: "var(--hk-text-mute)" }}>
            NO COMPLETED REPORTS TO EXPORT
          </div>
        ) : completed.map((inv, i) => {
          const rep = inv.result?.report;
          const level = rep?.risk_level ?? "low";
          const color = sevColor(level);
          return (
            <div key={inv.id} style={{
              display: "flex", alignItems: "center", gap: 16,
              padding: "14px 16px",
              borderBottom: i < completed.length - 1 ? "1px solid var(--hk-rule-soft)" : "none",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--hk-mono)", fontSize: 14, color: "var(--hk-text)", fontWeight: 500, marginBottom: 3 }}>
                  {inv.entity_name}
                </div>
                <div style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-mute)" }}>
                  {inv.entity_type.toUpperCase()} · {new Date(inv.created_at).toLocaleString()} UTC
                </div>
              </div>
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div style={{ fontFamily: "var(--hk-mono)", fontSize: 20, fontWeight: 700, color }}>
                  {rep ? Math.round(rep.overall_risk_score) : "—"}
                </div>
                <div style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color }}>
                  {level.toUpperCase()}
                </div>
              </div>
              <div style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-mute)", flexShrink: 0 }}>
                {inv.result?.signals?.length ?? 0} signals
              </div>
              <button
                type="button"
                onClick={() => onDownload(inv)}
                className="hk-bare-btn"
                style={{
                  padding: "7px 16px",
                  fontFamily: "var(--hk-mono)", fontSize: 12, letterSpacing: "0.06em",
                  background: "var(--hk-amber)", color: "var(--hk-bg)",
                  fontWeight: 700, borderRadius: 2, flexShrink: 0,
                }}
              >
                ↓ JSON
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TerminalHome;
