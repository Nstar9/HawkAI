// Shared types for the HawkAI Terminal components.
// Keep these here so consumers (data hooks, API mappers) have one place to look.

import type { CSSProperties, ReactNode } from "react";

export type RiskLevel = "CRIT" | "HIGH" | "MED" | "LOW";

export type EntityKind = "CORP" | "FUND" | "PERSON";

export interface NavItem {
  /** single-letter hotkey shown in the nav box */
  k: string;
  label: string;
  active?: boolean;
  count?: number;
}

export interface RecentItem {
  id: string;
  name: string;
  risk: RiskLevel;
  /** CSS color (use a CSS var: "var(--hk-red)") */
  color: string;
}

export interface FilterChip {
  key: string;
  value: string;
  on: boolean;
}

export type PipelineState = "done" | "active" | "queued";

export interface PipelineStep {
  /** display number, e.g. "01" */
  n: string;
  /** display key, e.g. "WEB" */
  k: string;
  /** subtitle under the key */
  label: string;
  /** elapsed time string, e.g. "18s" or "—" */
  time: string;
  state: PipelineState;
  /** 0..1, only used when state === "active" */
  progress?: number;
}

/** Tuple of [signal-name, count] — e.g. ["SANC", 2] */
export type SignalChip = [name: string, count: number];

export interface DossierRow {
  id: string;
  /** display time, e.g. "2h ago" */
  t: string;
  name: string;
  kind: EntityKind;
  juris: string;
  /** 0..100 */
  risk: number;
  level: RiskLevel;
  sig: SignalChip[];
  /** 7-day delta, +/- integer; 0 = unchanged */
  delta: number;
  /** CSS color (use a CSS var) */
  color: string;
}

export type DossierFilter = "ALL" | RiskLevel;

export type StatTuple = readonly [label: string, value: string, color: string];

export type QueueRow = readonly [
  time: string,
  source: string,
  message: string,
  color: string,
];

export interface StatusItem {
  left: ReactNode;
}

/** Convenience — used by anything that takes optional style overrides */
export interface Styleable {
  style?: CSSProperties;
  className?: string;
}
