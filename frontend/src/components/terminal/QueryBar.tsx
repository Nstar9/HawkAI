"use client";

import { Label } from "./atoms";
import type { EntityType } from "@/lib/types";

const ENTITY_TYPES: { value: EntityType; label: string }[] = [
  { value: "company", label: "COMPANY" },
  { value: "person",  label: "PERSON"  },
  { value: "fund",    label: "FUND"    },
];

export interface QueryBarProps {
  query: string;
  entityType: EntityType;
  isRunning: boolean;
  onQueryChange: (v: string) => void;
  onEntityTypeChange: (v: EntityType) => void;
  onRun: () => void;
}

export function QueryBar({
  query,
  entityType,
  isRunning,
  onQueryChange,
  onEntityTypeChange,
  onRun,
}: QueryBarProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (query.trim() && !isRunning) onRun();
    }
    if (e.key === "Escape") onQueryChange("");
  }

  const showPlaceholder = !query;

  return (
    <div style={{ padding: "24px 28px 0", position: "relative", zIndex: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Label tone="amber">&gt; QUERY</Label>
        <span style={{ flex: 1, height: 1, background: "var(--hk-rule)" }} />
        <Label tone="mute">type any company, person, or fund</Label>
      </div>

      <div style={{
        display: "flex", alignItems: "stretch",
        background: "var(--hk-surface)", border: "1px solid var(--hk-rule)", borderRadius: 4,
        boxShadow: "0 0 0 1px var(--hk-bg-2), inset 0 0 24px rgba(244,185,66,0.04)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "18px 22px", flex: 1, position: "relative",
        }}>
          <span style={{ color: "var(--hk-amber)", fontFamily: "var(--hk-mono)", fontSize: 22, flexShrink: 0 }}>›</span>
          <span style={{ fontFamily: "var(--hk-mono)", fontSize: 20, color: "var(--hk-text)", flexShrink: 0 }}>
            investigate
          </span>
          <div style={{ flex: 1, position: "relative" }}>
            <input
              type="text"
              value={query}
              onChange={e => onQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder=""
              autoFocus
              style={{
                all: "unset",
                display: "block",
                width: "100%",
                fontFamily: "var(--hk-mono)",
                fontSize: 20,
                color: "var(--hk-text)",
                caretColor: "var(--hk-amber)",
              }}
            />
            {showPlaceholder && (
              <span style={{
                position: "absolute", left: 0, top: 0,
                fontFamily: "var(--hk-mono)", fontSize: 20,
                color: "var(--hk-text-mute)", fontStyle: "italic",
                pointerEvents: "none",
              }}>
                company, person, or fund name…
              </span>
            )}
          </div>
          {!query && (
            <span style={{ width: 2, height: 22, background: "var(--hk-amber)" }} className="hk-cursor" />
          )}
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={!query.trim() || isRunning}
          className="hk-bare-btn"
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "0 20px",
            background: isRunning ? "var(--hk-amber-dim)" : "var(--hk-amber)",
            color: "var(--hk-bg)",
            fontFamily: "var(--hk-mono)", fontWeight: 700, fontSize: 13, letterSpacing: "0.1em",
            opacity: (!query.trim() || isRunning) ? 0.6 : 1,
            transition: "background 0.15s",
            minWidth: 100,
          }}
        >
          {isRunning ? (
            <><span className="hk-pulse">◐</span>&nbsp;RUNNING</>
          ) : (
            <>RUN <span style={{ fontSize: 14 }}>▸</span></>
          )}
          <span style={{ fontSize: 10, color: "var(--hk-bg-2)", marginLeft: 6, opacity: 0.7 }}>⌘↵</span>
        </button>
      </div>

      {/* Filter chips */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {ENTITY_TYPES.map((t) => {
          const on = entityType === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => onEntityTypeChange(t.value)}
              className="hk-bare-btn"
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 10px",
                border: `1px solid ${on ? "var(--hk-amber-dim)" : "var(--hk-rule)"}`,
                background: on ? "var(--hk-amber-soft)" : "transparent",
                color: on ? "var(--hk-text)" : "var(--hk-text-dim)",
                fontFamily: "var(--hk-mono)", fontSize: 10, letterSpacing: "0.06em",
                borderRadius: 2,
              }}
            >
              <span style={{ color: "var(--hk-text-mute)" }}>TYPE</span>
              <span style={{ color: on ? "var(--hk-amber)" : "var(--hk-text-dim)", fontWeight: 600 }}>
                {t.label}
              </span>
            </button>
          );
        })}
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "5px 10px",
          border: "1px solid var(--hk-rule)",
          color: "var(--hk-text-dim)",
          fontFamily: "var(--hk-mono)", fontSize: 10, letterSpacing: "0.06em", borderRadius: 2,
        }}>
          <span style={{ color: "var(--hk-text-mute)" }}>DEPTH</span>
          <span style={{ fontWeight: 600 }}>STANDARD</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)" }}>
          ⌘K&nbsp;FOCUS · /&nbsp;FILTER · ESC&nbsp;CLEAR
        </span>
      </div>
    </div>
  );
}
