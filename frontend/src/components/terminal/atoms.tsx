import type { CSSProperties, ReactNode } from "react";
import type { RiskLevel } from "./types";

/* ─── Label ─────────────────────────────────────────────── */

export interface LabelProps {
  children: ReactNode;
  tone?: "amber" | "mute" | "dim";
  style?: CSSProperties;
  className?: string;
}

export function Label({ children, tone = "dim", style, className }: LabelProps) {
  const color =
    tone === "amber" ? "var(--hk-amber)" :
    tone === "mute"  ? "var(--hk-text-mute)" :
                       "var(--hk-text-dim)";
  return (
    <div className={["hk-label", className].filter(Boolean).join(" ")} style={{ color, ...style }}>
      {children}
    </div>
  );
}

/* ─── Dot ───────────────────────────────────────────────── */

export interface DotProps {
  color?: string;
  size?: number;
  glow?: boolean;
  style?: CSSProperties;
}

export function Dot({
  color = "var(--hk-green)",
  size = 6,
  glow = true,
  style,
}: DotProps) {
  return (
    <span
      className={glow ? "hk-dot hk-dot--glow" : "hk-dot"}
      style={{ width: size, height: size, background: color, color, ...style }}
    />
  );
}

/* ─── Level pill ────────────────────────────────────────── */

export interface LevelProps {
  level: RiskLevel | string;
}

export function Level({ level }: LevelProps) {
  const map: Record<string, string> = {
    CRIT: "var(--hk-red)",
    HIGH: "var(--hk-red)",
    MED:  "var(--hk-amber)",
    LOW:  "var(--hk-green)",
  };
  return (
    <span className="hk-level" style={{ color: map[level] ?? "var(--hk-text-dim)" }}>
      {level}
    </span>
  );
}

/* ─── Signal chip ───────────────────────────────────────── */

export interface ChipProps {
  children: ReactNode;
}

export function Chip({ children }: ChipProps) {
  return <span className="hk-chip">{children}</span>;
}

/* ─── Logo ──────────────────────────────────────────────── */

export interface LogoProps {
  subtitle?: string;
}

export function Logo({ subtitle = "TERMINAL" }: LogoProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="9.5" fill="none" stroke="var(--hk-amber)" strokeWidth="1" />
        <circle cx="11" cy="11" r="3"   fill="none" stroke="var(--hk-amber)" strokeWidth="1" />
        <circle cx="11" cy="11" r="1"   fill="var(--hk-amber)" />
        <line x1="11" y1="0"  x2="11" y2="5"  stroke="var(--hk-amber)" />
        <line x1="11" y1="17" x2="11" y2="22" stroke="var(--hk-amber)" />
        <line x1="0"  y1="11" x2="5"  y2="11" stroke="var(--hk-amber)" />
        <line x1="17" y1="11" x2="22" y2="11" stroke="var(--hk-amber)" />
      </svg>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontFamily: "var(--hk-mono)", fontWeight: 700, fontSize: 14,
          color: "var(--hk-text)", letterSpacing: "0.06em",
        }}>HAWKAI</span>
        {subtitle && (
          <span style={{
            fontFamily: "var(--hk-mono)", fontSize: 10,
            color: "var(--hk-amber)", letterSpacing: "0.16em",
          }}>// {subtitle}</span>
        )}
      </div>
    </div>
  );
}
