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
  context: string;
  isRunning: boolean;
  onQueryChange: (v: string) => void;
  onEntityTypeChange: (v: EntityType) => void;
  onContextChange: (v: string) => void;
  onRun: () => void;
}

export function QueryBar({
  query,
  entityType,
  context,
  isRunning,
  onQueryChange,
  onEntityTypeChange,
  onContextChange,
  onRun,
}: QueryBarProps) {
  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      if (query.trim() && !isRunning) onRun();
    }
    if (e.key === "Escape") { onQueryChange(""); onContextChange(""); }
  }

  const showPlaceholder = !query;

  return (
    <div style={{ padding: "20px 28px 0", position: "relative", zIndex: 2 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <Label tone="amber">&gt; QUERY</Label>
        <span style={{ flex: 1, height: 1, background: "var(--hk-rule)" }} />
        <Label tone="mute">type any company, person, or fund</Label>
      </div>

      {/* Main search input */}
      <div style={{
        display: "flex", alignItems: "stretch",
        background: "var(--hk-surface)", border: "1px solid var(--hk-rule)", borderRadius: 4,
        boxShadow: "0 0 0 1px var(--hk-bg-2), inset 0 0 24px rgba(244,185,66,0.04)",
      }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 12,
          padding: "16px 22px", flex: 1, position: "relative",
        }}>
          <span style={{ color: "var(--hk-amber)", fontFamily: "var(--hk-mono)", fontSize: 22, flexShrink: 0 }}>›</span>
          <span style={{ fontFamily: "var(--hk-mono)", fontSize: 18, color: "var(--hk-text)", flexShrink: 0 }}>
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
                fontSize: 18,
                color: "var(--hk-text)",
                caretColor: "var(--hk-amber)",
              }}
            />
            {showPlaceholder && (
              <span style={{
                position: "absolute", left: 0, top: 0,
                fontFamily: "var(--hk-mono)", fontSize: 18,
                color: "var(--hk-text-mute)", fontStyle: "italic",
                pointerEvents: "none",
              }}>
                company, person, or fund name…
              </span>
            )}
          </div>
          {!query && (
            <span style={{ width: 2, height: 20, background: "var(--hk-amber)" }} className="hk-cursor" />
          )}
        </div>

        <button
          type="button"
          onClick={onRun}
          disabled={!query.trim() || isRunning}
          className="hk-bare-btn"
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "0 22px",
            background: isRunning ? "var(--hk-amber-dim)" : "var(--hk-amber)",
            color: "var(--hk-bg)",
            fontFamily: "var(--hk-mono)", fontWeight: 700, fontSize: 13, letterSpacing: "0.1em",
            opacity: (!query.trim() || isRunning) ? 0.6 : 1,
            transition: "background 0.15s",
            minWidth: 110,
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

      {/* Person disambiguation context field */}
      {entityType === "person" && (
        <div style={{
          marginTop: 8,
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 14px",
          background: "rgba(244,185,66,0.04)",
          border: "1px solid var(--hk-amber-dim)",
          borderRadius: 3,
        }}>
          <span style={{
            fontFamily: "var(--hk-mono)", fontSize: 11,
            color: "var(--hk-amber-dim)", flexShrink: 0,
          }}>
            CONTEXT ·
          </span>
          <input
            type="text"
            value={context}
            onChange={e => onContextChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="company, role, country, or year to identify the correct person (optional)"
            style={{
              all: "unset",
              flex: 1,
              fontFamily: "var(--hk-mono)", fontSize: 12,
              color: "var(--hk-text)",
              caretColor: "var(--hk-amber)",
            }}
          />
          <span style={{ fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)", flexShrink: 0 }}>
            e.g. "FTX CEO" · "Mumbai fintech"
          </span>
        </div>
      )}

      {/* Filter row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
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
                padding: "5px 12px",
                border: `1px solid ${on ? "var(--hk-amber-dim)" : "var(--hk-rule)"}`,
                background: on ? "var(--hk-amber-soft)" : "transparent",
                color: on ? "var(--hk-text)" : "var(--hk-text-dim)",
                fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.06em",
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
          padding: "5px 12px",
          border: "1px solid var(--hk-rule)",
          color: "var(--hk-text-dim)",
          fontFamily: "var(--hk-mono)", fontSize: 11, letterSpacing: "0.06em", borderRadius: 2,
        }}>
          <span style={{ color: "var(--hk-text-mute)" }}>DEPTH</span>
          <span style={{ fontWeight: 600 }}>STANDARD</span>
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-mute)" }}>
          ⌘K&nbsp;FOCUS · /&nbsp;FILTER · ESC&nbsp;CLEAR
        </span>
      </div>
    </div>
  );
}
