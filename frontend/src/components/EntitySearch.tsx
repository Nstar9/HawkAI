"use client";

import { FormEvent, useState } from "react";
import type { EntityType } from "@/lib/types";

export interface EntitySearchValues {
  entity_name: string;
  entity_type: EntityType;
  context?: string;
}

interface EntitySearchProps {
  onSubmit: (values: EntitySearchValues) => void;
  loading?: boolean;
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: "spin-slow 0.8s linear infinite" }}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
    </svg>
  );
}

export function EntitySearch({ onSubmit, loading }: EntitySearchProps) {
  const [entityName, setEntityName] = useState("");
  const [entityType, setEntityType] = useState<EntityType>("company");
  const [context, setContext] = useState("");

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!entityName.trim()) return;
    onSubmit({
      entity_name: entityName.trim(),
      entity_type: entityType,
      context: context.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      {/* Main input row */}
      <div style={{
        display: "flex",
        gap: "0.75rem",
        marginBottom: "0.85rem",
        alignItems: "stretch",
      }}>
        <div style={{ flex: 1, position: "relative" }}>
          <div style={{
            position: "absolute",
            left: "0.9rem",
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted-3)",
            pointerEvents: "none",
            display: "flex",
          }}>
            <SearchIcon />
          </div>
          <input
            id="entity_name"
            required
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            placeholder="Search any company, person, or fund…"
            style={{
              paddingLeft: "2.75rem",
              fontSize: "1rem",
              height: "52px",
              border: "1px solid var(--border-light)",
            }}
            autoComplete="off"
          />
        </div>
        <button
          className="btn btn-lg"
          type="submit"
          disabled={loading || !entityName.trim()}
          style={{ flexShrink: 0, height: "52px", paddingLeft: "1.5rem", paddingRight: "1.5rem" }}
        >
          {loading ? <SpinnerIcon /> : <SearchIcon />}
          {loading ? "Investigating…" : "Investigate"}
        </button>
      </div>

      {/* Secondary row */}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <div style={{ width: 160 }}>
          <select
            id="entity_type"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            style={{ height: "40px", fontSize: "0.88rem" }}
          >
            <option value="company">Company</option>
            <option value="person">Person</option>
            <option value="fund">Fund</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <input
            id="context"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Additional context (optional) — e.g. US, NYSE ticker, jurisdiction"
            style={{ height: "40px", fontSize: "0.88rem" }}
          />
        </div>
      </div>
    </form>
  );
}
