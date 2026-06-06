"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Investigation } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────
interface SimNode {
  id: string;
  invId: string;
  name: string;
  score: number;
  level: string;
  entityType: string;
  sigTypes: string[];
  signalCount: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface SimEdge {
  source: string;
  target: string;
  strength: number; // 0–1
  types: string[];  // shared signal categories
}

// ── Color helpers ──────────────────────────────────────────────
function nodeColor(level: string) {
  return level === "critical" ? "#ff5562"
    : level === "high"     ? "#ff8844"
    : level === "medium"   ? "#f4b942"
    : "#5cffa3";
}

// ── Build graph from investigations ───────────────────────────
function buildGraph(invs: Investigation[]): { nodes: SimNode[]; edges: SimEdge[] } {
  const done = invs.filter(i => i.status === "completed" && i.result?.report);

  const nodes: SimNode[] = done.map(inv => ({
    id: inv.id,
    invId: inv.id,
    name: inv.entity_name,
    score: Math.round(inv.result!.report!.overall_risk_score),
    level: inv.result!.report!.risk_level,
    entityType: inv.entity_type,
    sigTypes: Array.from(new Set((inv.result?.signals ?? []).map(s => s.signal_type))),
    signalCount: inv.result?.signals?.length ?? 0,
    x: 0, y: 0, vx: 0, vy: 0,
  }));

  // Edges: connect entities that share signal categories
  const edges: SimEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const shared = nodes[i].sigTypes.filter(t => nodes[j].sigTypes.includes(t));
      const unique = Array.from(new Set(shared));
      if (unique.length > 0) {
        edges.push({
          source: nodes[i].id,
          target: nodes[j].id,
          strength: Math.min(unique.length / 5, 1),
          types: unique,
        });
      }
    }
  }
  return { nodes, edges };
}

// ── Force-directed layout (200 iterations, synchronous) ────────
function computeLayout(rawNodes: SimNode[], edges: SimEdge[], w: number, h: number): SimNode[] {
  const nodes = rawNodes.map((n, i) => {
    const angle = (2 * Math.PI * i) / rawNodes.length - Math.PI / 2;
    const r = Math.min(w, h) * 0.28;
    return { ...n, x: w / 2 + Math.cos(angle) * r, y: h / 2 + Math.sin(angle) * r, vx: 0, vy: 0 };
  });

  // O(1) edge lookup
  const edgeMap = new Map<string, SimEdge>();
  for (const e of edges) {
    edgeMap.set(`${e.source}|${e.target}`, e);
    edgeMap.set(`${e.target}|${e.source}`, e);
  }

  for (let it = 0; it < 250; it++) {
    const alpha = Math.max(0, 1 - it / 200);

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      // Center gravity
      a.vx += (w / 2 - a.x) * 0.006 * alpha;
      a.vy += (h / 2 - a.y) * 0.006 * alpha;

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / d, ny = dy / d;

        // Node repulsion
        const rep = Math.min(3200 / (d * d), 6) * alpha;
        a.vx -= nx * rep; a.vy -= ny * rep;
        b.vx += nx * rep; b.vy += ny * rep;

        // Edge spring attraction
        const edge = edgeMap.get(`${a.id}|${b.id}`);
        if (edge) {
          const ideal = 100 + (1 - edge.strength) * 70;
          const spring = (d - ideal) * 0.016 * alpha;
          a.vx += nx * spring; a.vy += ny * spring;
          b.vx -= nx * spring; b.vy -= ny * spring;
        }
      }
    }

    for (const n of nodes) {
      n.vx *= 0.80; n.vy *= 0.80;
      n.x = Math.max(85, Math.min(w - 85, n.x + n.vx));
      n.y = Math.max(50, Math.min(h - 50, n.y + n.vy));
    }
  }
  return nodes;
}

// ── Component ──────────────────────────────────────────────────
export function EntityGraph({ investigations }: { investigations: Investigation[] }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [nodes, setNodes] = useState<SimNode[]>([]);
  const [edges, setEdges] = useState<SimEdge[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    const obs = new ResizeObserver(update);
    obs.observe(el);
    update();
    return () => obs.disconnect();
  }, []);

  // Layout when data or size changes
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    const { nodes: raw, edges: rawEdges } = buildGraph(investigations);
    if (raw.length === 0) { setNodes([]); setEdges([]); return; }
    const laid = computeLayout(raw, rawEdges, size.w, size.h);
    setNodes(laid);
    setEdges(rawEdges);
  }, [investigations, size.w, size.h]);

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  return (
    <div ref={containerRef} style={{ flex: 1, position: "relative", minHeight: 420 }}>

      {/* Legend */}
      <div style={{
        position: "absolute", top: 14, left: 14, zIndex: 1,
        display: "flex", flexDirection: "column", gap: 5,
      }}>
        {[["critical","#ff5562"],["high","#ff8844"],["medium","#f4b942"],["low","#5cffa3"]].map(([l, c]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c, boxShadow: `0 0 4px ${c}` }} />
            <span style={{ fontFamily: "var(--hk-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--hk-text-mute)" }}>
              {l.toUpperCase()}
            </span>
          </div>
        ))}
      </div>

      {/* Edge count hint */}
      {edges.length > 0 && (
        <div style={{
          position: "absolute", top: 14, right: 14, zIndex: 1,
          fontFamily: "var(--hk-mono)", fontSize: 10, color: "var(--hk-text-mute)",
          letterSpacing: "0.08em",
        }}>
          {edges.length} RISK CORRELATIONS · {nodes.length} ENTITIES
        </div>
      )}

      {nodes.length === 0 ? (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column", gap: 10,
        }}>
          <span style={{ fontFamily: "var(--hk-mono)", fontSize: 13, color: "var(--hk-text-mute)" }}>
            NO ENTITIES — RUN INVESTIGATIONS TO BUILD THE NETWORK
          </span>
          <span style={{ fontFamily: "var(--hk-mono)", fontSize: 11, color: "var(--hk-text-mute)", opacity: 0.6 }}>
            Nodes are connected by shared risk signal categories
          </span>
        </div>
      ) : (
        <svg width={size.w} height={size.h} style={{ position: "absolute", inset: 0 }}>
          <defs>
            <filter id="hk-glow-sm" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="hk-glow-lg" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Edges */}
          {edges.map((e, i) => {
            const a = nodeMap.get(e.source), b = nodeMap.get(e.target);
            if (!a || !b) return null;
            const isHov = hovered === e.source || hovered === e.target;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
              <g key={i}>
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={isHov ? "rgba(244,185,66,0.45)" : "rgba(255,255,255,0.07)"}
                  strokeWidth={isHov ? 1.5 : Math.max(0.5, e.strength * 2)}
                  style={{ transition: "stroke 0.15s, stroke-width 0.15s" }}
                />
                {/* Shared type count at midpoint when hovered */}
                {isHov && (
                  <text x={mx} y={my - 4} textAnchor="middle"
                    fill="rgba(244,185,66,0.7)" fontFamily="monospace" fontSize={8} letterSpacing={0.5}>
                    {e.types.map(t => t.slice(0, 4).toUpperCase()).join(" · ")}
                  </text>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {nodes.map(n => {
            const color = nodeColor(n.level);
            const isHov = hovered === n.id;
            const nodeR = 10 + (n.score / 100) * 12;
            const isCritHigh = n.level === "critical" || n.level === "high";
            // Determine tooltip direction
            const tooltipX = n.x > size.w / 2 ? -(nodeR + 135) : nodeR + 12;

            return (
              <g key={n.id}
                transform={`translate(${n.x}, ${n.y})`}
                style={{ cursor: "pointer" }}
                onClick={() => router.push(`/investigations/${n.invId}`)}
                onMouseEnter={() => setHovered(n.id)}
                onMouseLeave={() => setHovered(null)}
              >
                {/* Outer glow ring for critical/high */}
                {isCritHigh && (
                  <circle r={nodeR + 8} fill="none"
                    stroke={color} strokeWidth={0.8}
                    opacity={isHov ? 0.45 : 0.12}
                    style={{ transition: "opacity 0.2s" }}
                  />
                )}

                {/* Node circle */}
                <circle r={nodeR}
                  fill={`${color}1a`}
                  stroke={color}
                  strokeWidth={isHov ? 2.5 : 1.5}
                  filter={`url(#${isCritHigh ? "hk-glow-lg" : "hk-glow-sm"})`}
                  style={{ transition: "stroke-width 0.15s" }}
                />

                {/* Score text */}
                <text y={4} textAnchor="middle"
                  fill="#e9e2d0" fontFamily="monospace"
                  fontSize={nodeR > 16 ? 12 : 10} fontWeight={800}>
                  {n.score}
                </text>

                {/* Entity name below */}
                <text y={nodeR + 14} textAnchor="middle"
                  fill={isHov ? "#e9e2d0" : "#8a8576"}
                  fontFamily="monospace" fontSize={10} fontWeight={isHov ? 600 : 400}
                  style={{ transition: "fill 0.15s" }}>
                  {n.name.length > 16 ? n.name.slice(0, 15) + "…" : n.name}
                </text>

                {/* Entity type */}
                <text y={nodeR + 24} textAnchor="middle"
                  fill="#4a4540" fontFamily="monospace" fontSize={8} letterSpacing={1}>
                  {n.entityType.toUpperCase()}
                </text>

                {/* Hover tooltip */}
                {isHov && (
                  <g transform={`translate(${tooltipX}, -32)`}>
                    <rect x={0} y={0} width={125} height={70} rx={3}
                      fill="#11161f" stroke="#1d242f" strokeWidth={1} />
                    <text x={10} y={17} fill={color}
                      fontFamily="monospace" fontSize={12} fontWeight={700}>
                      {n.score}/100
                    </text>
                    <text x={52} y={17} fill={color}
                      fontFamily="monospace" fontSize={10}>
                      {n.level.toUpperCase()}
                    </text>
                    <text x={10} y={31} fill="#6a6560" fontFamily="monospace" fontSize={9}>
                      {n.signalCount} signals · {n.sigTypes.length} categories
                    </text>
                    <text x={10} y={43} fill="#6a6560" fontFamily="monospace" fontSize={9}>
                      {n.entityType.toUpperCase()}
                    </text>
                    <text x={10} y={59} fill="rgba(244,185,66,0.7)" fontFamily="monospace" fontSize={9}>
                      click to open report →
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
