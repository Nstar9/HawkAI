"use client";

import { useEffect, useState } from "react";
import { Logo, Dot } from "./atoms";

export function TopBar() {
  const [clock, setClock] = useState("");

  useEffect(() => {
    function tick() {
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC",
        }) + " UTC"
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      height: "var(--hk-topbar-h)",
      flex: "none",
      background: "var(--hk-bg-2)",
      borderBottom: "1px solid var(--hk-rule)",
      display: "flex",
      alignItems: "center",
      padding: "0 18px",
      gap: 24,
      position: "relative",
      zIndex: 2,
    }}>
      <Logo subtitle="TERMINAL" />

      <div style={{
        display: "flex", alignItems: "center", gap: 14, marginLeft: 14,
        fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-dim)",
      }}>
        <span><span style={{ color: "var(--hk-text-mute)" }}>SESSION</span> 7F-2841</span>
        <span style={{ color: "var(--hk-text-mute)" }}>·</span>
        <span><span style={{ color: "var(--hk-text-mute)" }}>TIER</span> ANALYST</span>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{
        display: "flex", alignItems: "center", gap: 18,
        fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-dim)",
      }}>
        <span><Dot color="var(--hk-green)" size={5} />&nbsp; ADK</span>
        <span><Dot color="var(--hk-green)" size={5} />&nbsp; GEMINI</span>
        <span><Dot color="var(--hk-green)" size={5} />&nbsp; ATLAS</span>
        <span style={{ color: "var(--hk-text-mute)" }}>·</span>
        <span style={{ color: "var(--hk-text)", minWidth: 110 }}>{clock}</span>
        <span style={{ color: "var(--hk-text-mute)" }}>·</span>
        <span style={{ color: "var(--hk-amber)" }}>v0.3.7</span>
      </div>
    </div>
  );
}
