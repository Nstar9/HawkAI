"use client";

import { Label, Dot } from "./atoms";
import type { Investigation } from "@/lib/types";

type RiskLevel = "CRIT" | "HIGH" | "MED" | "LOW";

function riskColor(level: string | undefined): string {
  if (level === "critical") return "var(--hk-red)";
  if (level === "high")     return "var(--hk-red)";
  if (level === "medium")   return "var(--hk-amber)";
  return "var(--hk-green)";
}

function shortId(inv: Investigation): string {
  return inv.entity_name.slice(0, 3).toUpperCase() + "-" + inv.id.slice(-4).toUpperCase();
}

interface LeftNavProps {
  investigations: Investigation[];
  activeView: string;
  onNav: (view: string) => void;
  onSelectRecent: (inv: Investigation) => void;
  entityCount: number;
  entityPct?: number;
}

const NAV_ITEMS = [
  { k: "Q", label: "NEW QUERY",       view: "query" },
  { k: "I", label: "INVESTIGATIONS",  view: "investigations" },
  { k: "D", label: "DOSSIER VAULT",   view: "dossiers" },
  { k: "W", label: "WATCHLISTS",      view: "watchlists" },
  { k: "S", label: "SIGNALS LIBRARY", view: "signals" },
  { k: "C", label: "CORRELATIONS",    view: "correlations" },
  { k: "X", label: "EXPORTS",         view: "exports" },
] as const;

export function LeftNav({
  investigations,
  activeView,
  onNav,
  onSelectRecent,
  entityCount,
  entityPct = 0.62,
}: LeftNavProps) {
  const recentCompleted = investigations
    .filter(i => i.status === "completed")
    .slice(0, 7);

  return (
    <aside style={{
      width: "var(--hk-nav-w)", flex: "none",
      background: "var(--hk-bg)", borderRight: "1px solid var(--hk-rule)",
      padding: "18px 14px", overflow: "hidden",
      display: "flex", flexDirection: "column",
      position: "relative", zIndex: 2,
    }}>
      <Label>Session</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 10 }}>
        {NAV_ITEMS.map((n) => {
          const active = n.view === activeView;
          const count = n.view === "investigations" ? investigations.length : undefined;
          return (
            <button
              key={n.k}
              type="button"
              onClick={() => onNav(n.view)}
              className="hk-bare-btn"
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "7px 10px", borderRadius: 3,
                background: active ? "var(--hk-surface)" : "transparent",
                borderLeft: active ? "2px solid var(--hk-amber)" : "2px solid transparent",
                color: active ? "var(--hk-text)" : "var(--hk-text-dim)",
                fontSize: 11, fontFamily: "var(--hk-mono)", letterSpacing: "0.06em",
              }}
            >
              <span style={{
                width: 18, height: 18, borderRadius: 2,
                border: `1px solid ${active ? "var(--hk-amber)" : "var(--hk-rule)"}`,
                color: active ? "var(--hk-amber)" : "var(--hk-text-mute)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, flexShrink: 0,
              }}>{n.k}</span>
              <span style={{ flex: 1 }}>{n.label}</span>
              {count != null && (
                <span style={{ color: "var(--hk-text-mute)", fontSize: 10 }}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ height: 24 }} />
      <Label>Recent · {recentCompleted.length}</Label>
      <div style={{ display: "flex", flexDirection: "column", gap: 1, fontSize: 11, marginTop: 10 }}>
        {recentCompleted.length === 0 ? (
          <span style={{ color: "var(--hk-text-mute)", fontSize: 10, paddingLeft: 8 }}>
            No completed investigations
          </span>
        ) : (
          recentCompleted.map((inv) => (
            <button
              key={inv.id}
              type="button"
              onClick={() => onSelectRecent(inv)}
              className="hk-bare-btn"
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 8px", borderRadius: 2, color: "var(--hk-text-dim)",
              }}
            >
              <Dot color={riskColor(inv.result?.report?.risk_level)} size={5} />
              <span style={{ color: "var(--hk-text-mute)", fontFamily: "var(--hk-mono)", fontSize: 10, flexShrink: 0 }}>
                {shortId(inv)}
              </span>
              <span style={{
                flex: 1, color: "var(--hk-text)", fontSize: 11,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{inv.entity_name}</span>
            </button>
          ))
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Storage card */}
      <div style={{
        marginTop: 14, padding: "10px 12px", borderRadius: 3,
        border: "1px solid var(--hk-rule)", background: "var(--hk-surface)",
      }}>
        <Label tone="mute">Storage · Atlas</Label>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
          <span style={{ fontFamily: "var(--hk-mono)", color: "var(--hk-text)", fontSize: 18, fontWeight: 600 }}>
            {entityCount.toLocaleString()}
          </span>
          <span style={{ color: "var(--hk-text-mute)", fontSize: 10 }}>entities</span>
        </div>
        <div style={{ height: 4, background: "var(--hk-bg)", borderRadius: 1, marginTop: 8, overflow: "hidden" }}>
          <div style={{ width: `${Math.min(entityPct * 100, 100)}%`, height: "100%", background: "var(--hk-amber)" }} />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between", marginTop: 6,
          fontSize: 10, color: "var(--hk-text-mute)", fontFamily: "var(--hk-mono)",
        }}>
          <span>{Math.round(entityPct * 100)}% · 768d vec</span>
          <span>Atlas</span>
        </div>
      </div>
    </aside>
  );
}
