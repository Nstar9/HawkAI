"use client";

import Link from "next/link";
import type { Investigation } from "@/lib/types";
import { RiskBadge } from "@/components/RiskBadge";
import type { RiskLevel } from "@/lib/types";

function StatusDot({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "#10b981",
    running:   "#3b82f6",
    failed:    "#ef4444",
    pending:   "#6b7280",
  };
  const color = map[status] ?? "#6b7280";
  return (
    <span style={{
      display: "inline-block",
      width: 7,
      height: 7,
      borderRadius: "50%",
      background: color,
      flexShrink: 0,
      boxShadow: status === "running" ? `0 0 6px ${color}` : undefined,
    }} />
  );
}

function EntityTypeIcon({ type }: { type: string }) {
  if (type === "company") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#9ca3af" }}>
      <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
    </svg>
  );
  if (type === "person") return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#9ca3af" }}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  );
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#9ca3af" }}>
      <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted-3)" }}>
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}

export function InvestigationHistory({ investigations }: { investigations: Investigation[] }) {
  if (investigations.length === 0) {
    return (
      <div style={{
        padding: "3rem 2rem",
        border: "1px dashed var(--border-light)",
        borderRadius: "var(--radius-card)",
        textAlign: "center",
        background: "rgba(17,24,39,0.5)",
      }}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--muted-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 1rem" }}>
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
        </svg>
        <p style={{ color: "var(--muted)", margin: "0 0 0.4rem", fontWeight: 500 }}>
          No investigations yet
        </p>
        <p style={{ color: "var(--muted-2)", fontSize: "0.85rem", margin: 0 }}>
          Try searching for <span style={{ color: "var(--accent)" }}>Meridian Trade Solutions Ltd</span> to see a critical risk demo
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "var(--radius-card)",
      overflow: "hidden",
    }}>
      <table className="data-table">
        <thead>
          <tr>
            <th>Entity</th>
            <th>Type</th>
            <th>Risk Level</th>
            <th>Date</th>
            <th>Status</th>
            <th style={{ width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {investigations.map((inv) => (
            <tr
              key={inv.id}
              onClick={() => { window.location.href = `/investigations/${inv.id}`; }}
            >
              <td>
                <span style={{ fontWeight: 600, color: "var(--text)", fontSize: "0.9rem" }}>
                  {inv.entity_name}
                </span>
              </td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", color: "var(--muted)", fontSize: "0.82rem", textTransform: "capitalize" }}>
                  <EntityTypeIcon type={inv.entity_type} />
                  {inv.entity_type}
                </span>
              </td>
              <td>
                {inv.result?.report?.risk_level ? (
                  <RiskBadge level={inv.result.report.risk_level as RiskLevel} />
                ) : (
                  <span style={{ color: "var(--muted-3)", fontSize: "0.78rem" }}>—</span>
                )}
              </td>
              <td>
                <span style={{ color: "var(--muted)", fontSize: "0.82rem" }}>
                  {new Date(inv.created_at).toLocaleDateString(undefined, {
                    month: "short", day: "numeric",
                  })}
                  {" "}
                  <span style={{ color: "var(--muted-3)" }}>
                    {new Date(inv.created_at).toLocaleTimeString(undefined, {
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </span>
              </td>
              <td>
                <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                  <StatusDot status={inv.status} />
                  <span style={{
                    color: inv.status === "completed" ? "var(--low)" :
                           inv.status === "running"   ? "var(--accent)" :
                           inv.status === "failed"    ? "var(--high)" : "var(--muted)",
                    fontSize: "0.78rem",
                    fontWeight: 600,
                    textTransform: "capitalize",
                  }}>
                    {inv.status}
                  </span>
                </span>
              </td>
              <td>
                <ChevronIcon />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
