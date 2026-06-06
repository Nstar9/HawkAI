"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteInvestigation } from "@/lib/api";
import { Label, Dot, Level, Chip } from "./atoms";
import type { DossierRow, DossierFilter, RiskLevel, SignalChip, EntityKind } from "./types";
import type { Investigation } from "@/lib/types";

// ── Mappers ────────────────────────────────────────────────

function toRiskLevel(level: string | undefined): RiskLevel {
  const m: Record<string, RiskLevel> = { critical: "CRIT", high: "HIGH", medium: "MED", low: "LOW" };
  return m[level ?? ""] ?? "LOW";
}

function toEntityKind(type: string): EntityKind {
  const m: Record<string, EntityKind> = { company: "CORP", person: "PERSON", fund: "FUND" };
  return m[type] ?? "CORP";
}

function toRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ago`;
  if (h > 0) return `${h}h ago`;
  if (m > 0) return `${m}m ago`;
  return "just now";
}

function levelColor(level: RiskLevel): string {
  return level === "CRIT" || level === "HIGH" ? "var(--hk-red)"
       : level === "MED"  ? "var(--hk-amber)"
       : "var(--hk-green)";
}

export function invToDossierRow(inv: Investigation, idx: number): DossierRow & { _invId: string } {
  const report  = inv.result?.report;
  const signals = inv.result?.signals ?? [];
  const level   = toRiskLevel(report?.risk_level);
  const shortId = inv.entity_name.slice(0, 3).toUpperCase() + "-" + inv.id.slice(-4).toUpperCase();

  // Group signals by type abbreviation
  const sigCounts = signals.reduce<Record<string, number>>((acc, sig) => {
    const abbrev = sig.signal_type.slice(0, 4).toUpperCase();
    acc[abbrev] = (acc[abbrev] ?? 0) + 1;
    return acc;
  }, {});
  const sig: SignalChip[] = Object.entries(sigCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([name, count]) => [name, count]);

  return {
    id:         shortId,
    t:          toRelativeTime(inv.created_at),
    name:       inv.entity_name,
    kind:       toEntityKind(inv.entity_type),
    juris:      "—",
    risk:       Math.round(report?.overall_risk_score ?? 0),
    level,
    sig,
    confidence: report?.analyst_confidence != null
      ? Math.round(report.analyst_confidence * 100)
      : null,
    color: levelColor(level),
    _invId: inv.id,
  };
}

// ── Component ──────────────────────────────────────────────

const COLUMNS = ["", "ID", "TIME", "ENTITY", "TYPE", "JURIS", "RISK", "LEVEL", "SIGNALS", "CONF", "", ""] as const;
const GRID = "16px 80px 60px 1fr 70px 60px 70px 70px 1.1fr 52px 24px 28px";
const FILTERS: readonly DossierFilter[] = ["ALL", "CRIT", "HIGH", "MED", "LOW"] as const;

export interface DossierTableProps {
  investigations: Investigation[];
  highlightId?: string;
  onDelete?: (investigationId: string) => void;
  watchedIds?: Set<string>;
  onToggleWatch?: (id: string) => void;
}

export function DossierTable({ investigations, highlightId, onDelete, watchedIds, onToggleWatch }: DossierTableProps) {
  const [activeFilter, setActiveFilter] = useState<DossierFilter>("ALL");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete(e: React.MouseEvent, invId: string, entityName: string) {
    e.stopPropagation();
    if (!window.confirm(`Delete "${entityName}"? This cannot be undone.`)) return;
    setDeletingId(invId);
    try {
      await deleteInvestigation(invId);
      onDelete?.(invId);
    } catch {
      // ignore
    } finally {
      setDeletingId(null);
    }
  }

  const allRows = investigations
    .filter(i => i.status === "completed" || i.status === "running")
    .map(invToDossierRow);

  const filtered = activeFilter === "ALL"
    ? allRows
    : allRows.filter(r => r.level === activeFilter);

  return (
    <div style={{
      padding: "22px 28px 28px", flex: 1,
      display: "flex", flexDirection: "column", minHeight: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Label tone="amber">&gt; DOSSIERS · LAST 7D</Label>
        <span style={{ flex: 1, height: 1, background: "var(--hk-rule)" }} />
        <div style={{ display: "flex", gap: 6 }}>
          {FILTERS.map((f) => {
            const on = f === activeFilter;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className="hk-bare-btn"
                style={{
                  padding: "4px 10px",
                  fontFamily: "var(--hk-mono)", fontSize: 10, letterSpacing: "0.08em",
                  border: `1px solid ${on ? "var(--hk-amber-dim)" : "var(--hk-rule)"}`,
                  color: on ? "var(--hk-amber)" : "var(--hk-text-dim)",
                  background: on ? "var(--hk-amber-soft)" : "transparent",
                  borderRadius: 2,
                }}
              >
                {f}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{
        flex: 1, minHeight: 0,
        border: "1px solid var(--hk-rule)", borderRadius: 3,
        background: "var(--hk-surface)", overflow: "auto",
      }}>
        {/* Header */}
        <div style={{
          display: "grid", gridTemplateColumns: GRID, gap: 14, padding: "10px 16px",
          borderBottom: "1px solid var(--hk-rule)",
          fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.1em",
          color: "var(--hk-text-mute)", background: "var(--hk-bg-2)",
          position: "sticky", top: 0,
        }}>
          {COLUMNS.map((c, i) => <span key={i}>{c}</span>)}
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div style={{
            padding: "40px 16px", textAlign: "center",
            fontFamily: "var(--hk-mono)", fontSize: 13, color: "var(--hk-text-mute)",
          }}>
            NO DOSSIERS · RUN AN INVESTIGATION TO POPULATE
          </div>
        )}

        {/* Rows */}
        {filtered.map((r, i) => {
          const isHighlighted = highlightId && r._invId === highlightId;
          return (
            <div
              key={r.id}
              onClick={() => router.push(`/investigations/${r._invId}`)}
              style={{
                display: "grid", gridTemplateColumns: GRID, gap: 14, padding: "12px 16px",
                borderBottom: i < filtered.length - 1 ? "1px solid var(--hk-rule-soft)" : "none",
                alignItems: "center",
                background: isHighlighted
                  ? "rgba(244,185,66,0.05)"
                  : i === 0 ? "rgba(244,185,66,0.02)" : "transparent",
                fontFamily: "var(--hk-mono)", fontSize: 13, color: "var(--hk-text)",
                cursor: "pointer",
                transition: "background 0.12s",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(244,185,66,0.04)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = isHighlighted ? "rgba(244,185,66,0.05)" : i === 0 ? "rgba(244,185,66,0.02)" : "transparent"; }}
            >
              <Dot color={r.color} size={7} />
              <span style={{ color: "var(--hk-text-dim)", fontSize: 11 }}>{r.id}</span>
              <span style={{ color: "var(--hk-text-mute)", fontSize: 11 }}>{r.t}</span>
              <span style={{
                color: "var(--hk-text)", fontWeight: 500, letterSpacing: "0.02em",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{r.name}</span>
              <span style={{ color: "var(--hk-text-dim)", fontSize: 11 }}>{r.kind}</span>
              <span style={{ color: "var(--hk-text-dim)", fontSize: 11 }}>{r.juris}</span>

              <div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ color: r.color, fontWeight: 700, fontSize: 13 }}>{r.risk}</span>
                  <span style={{ color: "var(--hk-text-mute)", fontSize: 9 }}>/100</span>
                </div>
                <div style={{ height: 2, background: "var(--hk-bg)", marginTop: 3 }}>
                  <div style={{ height: "100%", width: `${r.risk}%`, background: r.color, opacity: 0.7 }} />
                </div>
              </div>

              <span style={{ alignSelf: "start" }}><Level level={r.level} /></span>

              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {r.sig.length === 0 ? (
                  <span style={{ color: "var(--hk-green-dim)", fontSize: 10 }}>— clean</span>
                ) : (
                  r.sig.map(([s, n]) => <Chip key={s}>{s}·{n}</Chip>)
                )}
              </div>

              <span style={{
                color: r.confidence != null
                  ? (r.confidence >= 85 ? "var(--hk-green)" : r.confidence >= 65 ? "var(--hk-amber)" : "var(--hk-text-mute)")
                  : "var(--hk-text-mute)",
                fontSize: 12, fontFamily: "var(--hk-mono)",
              }}>
                {r.confidence != null ? `${r.confidence}%` : "—"}
              </span>

              {/* Watch toggle */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleWatch?.(r._invId); }}
                className="hk-bare-btn"
                title={watchedIds?.has(r._invId) ? "Remove from watchlist" : "Add to watchlist"}
                style={{
                  fontFamily: "var(--hk-mono)", fontSize: 13,
                  color: watchedIds?.has(r._invId) ? "var(--hk-amber)" : "var(--hk-text-mute)",
                  opacity: watchedIds?.has(r._invId) ? 1 : 0.35,
                  padding: "2px 3px", borderRadius: 2,
                  transition: "opacity 0.12s, color 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = watchedIds?.has(r._invId) ? "1" : "0.35"; }}
              >
                {watchedIds?.has(r._invId) ? "★" : "☆"}
              </button>

              <button
                type="button"
                onClick={(e) => handleDelete(e, r._invId, r.name)}
                disabled={deletingId === r._invId}
                className="hk-bare-btn"
                title="Delete investigation"
                style={{
                  fontFamily: "var(--hk-mono)", fontSize: 12,
                  color: "var(--hk-red)", opacity: deletingId === r._invId ? 0.5 : 0.35,
                  padding: "2px 4px", borderRadius: 2,
                  transition: "opacity 0.12s",
                }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = deletingId === r._invId ? "0.5" : "0.35"; }}
              >
                {deletingId === r._invId ? "…" : "✕"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
