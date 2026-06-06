"use client";

import { useEffect, useState } from "react";
import { Logo, Dot } from "./atoms";

export function TopBar() {
  const [clock, setClock]   = useState("");
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    // Restore saved theme on mount
    const saved = localStorage.getItem("hk-theme");
    const dark = saved !== "light";
    setIsDark(dark);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }, []);

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

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    const theme = next ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("hk-theme", theme);
  }

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

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="hk-bare-btn"
          style={{
            fontFamily: "var(--hk-mono)", fontSize: 13,
            color: isDark ? "var(--hk-text-dim)" : "var(--hk-amber)",
            padding: "2px 6px",
            border: "1px solid var(--hk-rule)",
            borderRadius: 2,
            lineHeight: 1,
          }}
        >
          {isDark ? "☀" : "☾"}
        </button>

        <span style={{ color: "var(--hk-amber)" }}>v0.3.7</span>
      </div>
    </div>
  );
}
