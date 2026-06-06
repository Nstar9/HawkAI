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
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true"
        style={{ filter: "drop-shadow(0 0 4px rgba(244,185,66,0.5))" }}>
        <circle cx="14" cy="14" r="12.5" fill="none" stroke="var(--hk-amber)" strokeWidth="1.2" />
        <circle cx="14" cy="14" r="4.5"  fill="none" stroke="var(--hk-amber)" strokeWidth="1" opacity={0.7} />
        <circle cx="14" cy="14" r="1.5"  fill="var(--hk-amber)" />
        <line x1="14" y1="0"  x2="14" y2="6.5"  stroke="var(--hk-amber)" strokeWidth="1.2" />
        <line x1="14" y1="21.5" x2="14" y2="28" stroke="var(--hk-amber)" strokeWidth="1.2" />
        <line x1="0"  y1="14" x2="6.5"  y2="14" stroke="var(--hk-amber)" strokeWidth="1.2" />
        <line x1="21.5" y1="14" x2="28" y2="14" stroke="var(--hk-amber)" strokeWidth="1.2" />
      </svg>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{
          fontFamily: "var(--hk-mono)", fontWeight: 800, fontSize: 17,
          color: "var(--hk-text)", letterSpacing: "0.12em",
          textShadow: "0 0 20px rgba(244,185,66,0.15)",
        }}>HAWKAI</span>
        {subtitle && (
          <span style={{
            fontFamily: "var(--hk-mono)", fontSize: 11,
            color: "var(--hk-amber)", letterSpacing: "0.18em", opacity: 0.85,
          }}>// {subtitle}</span>
        )}
      </div>
    </div>
  );
}
