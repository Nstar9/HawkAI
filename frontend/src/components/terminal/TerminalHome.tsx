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

import { createInvestigation, getInvestigation, listInvestigations, streamInvestigation } from "@/lib/api";
import type { Investigation, EntityType } from "@/lib/types";
import type { PipelineStep, QueueRow } from "./types";

// ── How tool_call events advance the 6-step pipeline display ──
const TOOL_TO_STEP_IDX: Record<string, number> = {
  "extract_and_store_entity":    1,  // step 2 PROFILE
  "run_vector_similarity_search":2,  // step 3 STORE/CORRELATE
  "aggregate":                   3,  // step 4 CORRELATE
  "classify_and_store_signals":  4,  // step 5 SIGNALS
  "synthesize_risk_report":      5,  // step 6 SYNTH
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
      i < activeIdx  ? "done" :
      i === activeIdx ? "active" :
      "queued";
    return {
      ...s,
      state,
      time:     state === "done" ? elapsed : state === "active" ? elapsed : "—",
      progress: state === "active" ? 0.5 : undefined,
    };
  });
}

// ── Props ──────────────────────────────────────────────────────

export interface TerminalHomeProps {
  initialInvestigations: Investigation[];
  entityCount: number;
}

// ── Component ──────────────────────────────────────────────────

export function TerminalHome({ initialInvestigations, entityCount }: TerminalHomeProps) {
  const router = useRouter();

  // Query state
  const [query, setQuery]           = useState("");
  const [entityType, setEntityType] = useState<EntityType>("company");

  // Investigations list (refreshed after each completion)
  const [investigations, setInvestigations] = useState<Investigation[]>(initialInvestigations);

  // Active running investigation
  const [activeId,   setActiveId]   = useState<string | null>(null);
  const [activeInv,  setActiveInv]  = useState<Investigation | null>(null);

  // Pipeline display state (0-based step index)
  const [pipelineIdx,  setPipelineIdx]  = useState(-1);   // -1 = idle
  const [stepTimes,    setStepTimes]    = useState<Record<number, number>>({});
  const [pipelineStatus, setPipelineStatus] = useState<string | undefined>();

  // Right-rail live queue
  const [liveQueue, setLiveQueue] = useState<QueueRow[]>([]);

  // Ticker for elapsed time display
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const closeSSERef = useRef<(() => void) | null>(null);

  // ── Refresh investigations list ────────────────────────────
  const refreshInvestigations = useCallback(async () => {
    try {
      const list = await listInvestigations(30);
      setInvestigations(list);
    } catch { /* ignore */ }
  }, []);

  // ── Push a row to the live queue ──────────────────────────
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

    try {
      const inv = await createInvestigation({ entity_name: query.trim(), entity_type: entityType });
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
            // Add to local list immediately so DossierTable updates
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
              pushQueue(t, "web", "scan begin · OSINT", "var(--hk-text-dim)");
            }
            if (d.name === "research" && d.status === "completed") {
              setPipelineIdx(1);
              setStepTimes(s => ({ ...s, 1: Date.now() }));
              pushQueue(t, "web", "research complete", "var(--hk-green)");
            }
            if (d.name === "intelligence" && d.status === "running") {
              if (d.message) pushQueue(t, "intel", d.message.slice(0, 40), "var(--hk-text)");
            }
            if (d.name === "complete" && d.status === "completed") {
              setPipelineIdx(PIPELINE_STEPS.length); // all done
              setPipelineStatus(`ALL ${PIPELINE_STEPS.length} STEPS COMPLETE`);
              pushQueue(t, "synth", "report ready", "var(--hk-green)");
            }
            // Refresh to get updated step data
            getInvestigation(inv.id).then(u => {
              setActiveInv(u);
              setInvestigations(prev => { const w = prev.filter(i => i.id !== u.id); return [u, ...w]; });
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
            pushQueue(t, toolName.slice(0, 12), `calling ${toolName.slice(0, 28)}`, "var(--hk-amber)");
          }

          if (event.event === "agent_text") {
            const d = event.data as { agent?: string; text?: string };
            const src = (d.agent ?? "agent").slice(0, 12).toLowerCase();
            const msg = (d.text ?? "").slice(0, 42);
            pushQueue(t, src, msg, "var(--hk-text)");
          }

          if (event.event === "done") {
            setActiveId(null);
            closeSSERef.current = null;
            refreshInvestigations();
          }

          if (event.event === "error") {
            const d = event.data as { message?: string };
            pushQueue(t, "error", (d.message ?? "unknown error").slice(0, 42), "var(--hk-red)");
            setActiveId(null);
            refreshInvestigations();
          }
        },
        () => {
          setActiveId(null);
          refreshInvestigations();
        },
      );

      closeSSERef.current = close;
    } catch (err) {
      pushQueue(nowTime(), "error", err instanceof Error ? err.message.slice(0, 42) : "failed", "var(--hk-red)");
    }
  }

  // Cleanup SSE on unmount
  useEffect(() => () => { closeSSERef.current?.(); }, []);

  // Build pipeline display
  const pipelineSteps: PipelineStep[] = pipelineIdx < 0
    ? PIPELINE_STEPS.map(s => ({ ...s, state: "queued" as const, time: "—" }))
    : buildPipelineSteps(pipelineIdx, stepTimes, Date.now() + tick * 0);

  const isRunning = !!activeId;

  return (
    <div className="hk-shell">
      <TopBar />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <LeftNav
          investigations={investigations}
          activeView="query"
          onNav={(view) => {
            if (view === "investigations") router.push("/investigations");
          }}
          onSelectRecent={(inv) => router.push(`/investigations/${inv.id}`)}
          entityCount={entityCount}
          entityPct={Math.min(entityCount / 20, 1)}
        />
        <main style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, position: "relative", zIndex: 2 }}>
          <QueryBar
            query={query}
            entityType={entityType}
            isRunning={isRunning}
            onQueryChange={setQuery}
            onEntityTypeChange={setEntityType}
            onRun={handleRun}
          />
          <Pipeline steps={pipelineSteps} status={pipelineStatus} />
          <DossierTable investigations={investigations} highlightId={activeId ?? undefined} />
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

export default TerminalHome;
