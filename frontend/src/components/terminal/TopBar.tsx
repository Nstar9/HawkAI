"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo, Dot } from "./atoms";

export function TopBar() {
  const router = useRouter();
  const [clock, setClock]   = useState("");
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
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
      {/* Logo — click to go home */}
      <button
        type="button"
        onClick={() => router.push("/")}
        className="hk-bare-btn"
        title="Go to terminal home"
        style={{ display: "flex", alignItems: "center", padding: "4px 0", borderRadius: 3 }}
      >
        <Logo subtitle="TERMINAL" />
      </button>

      <div style={{
        display: "flex", alignItems: "center", gap: 14, marginLeft: 6,
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

        {/* Theme toggle — visible in both modes */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          className="hk-bare-btn"
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: "var(--hk-mono)", fontSize: 10, letterSpacing: "0.1em",
            color: "var(--hk-amber)",
            padding: "4px 10px",
            background: "var(--hk-amber-soft)",
            border: "1px solid var(--hk-amber-dim)",
            borderRadius: 2,
          }}
        >
          <span style={{ fontSize: 12, lineHeight: 1 }}>{isDark ? "☀" : "☾"}</span>
          <span>{isDark ? "LIGHT" : "DARK"}</span>
        </button>

        <span style={{ color: "var(--hk-amber)" }}>v0.3.7</span>
      </div>
    </div>
  );
}
