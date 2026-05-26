"use client";

import { Dot } from "./atoms";

interface StatusBarProps {
  queueCount?: number;
  lastSync?: string;
}

export function StatusBar({ queueCount = 0, lastSync }: StatusBarProps) {
  const syncText = lastSync ?? "—";
  return (
    <div style={{
      height: "var(--hk-status-h)",
      flex: "none",
      background: "var(--hk-bg-2)",
      borderTop: "1px solid var(--hk-rule)",
      display: "flex",
      alignItems: "center",
      padding: "0 18px",
      gap: 0,
      fontFamily: "var(--hk-mono)",
      fontSize: 10,
      letterSpacing: "0.08em",
      color: "var(--hk-text-mute)",
      position: "relative",
      zIndex: 2,
    }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Dot color="var(--hk-green)" size={5} />
        &nbsp;ALL SYSTEMS NOMINAL
      </span>
      <span style={{ margin: "0 18px" }}>·</span>
      <span>UPLINK 42ms</span>
      <span style={{ margin: "0 18px" }}>·</span>
      <span>QUEUE {queueCount} ACTIVE · 0 PENDING</span>
      <span style={{ margin: "0 18px" }}>·</span>
      <span>LAST SYNC {syncText}</span>

      <span style={{ flex: 1 }} />
      <span style={{ color: "var(--hk-amber)" }}>ENC: TLS-1.3 / E2E</span>
      <span style={{ margin: "0 10px" }}>·</span>
      <span>SOC-2 TYPE II</span>
    </div>
  );
}
