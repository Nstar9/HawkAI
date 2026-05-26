"use client";

import { FormEvent, useState } from "react";
import type { Entity } from "@/lib/types";
import { addEntityNote } from "@/lib/api";

function NoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

function TimelineNote({ note }: { note: { id: string; author: string; content: string; created_at: string } }) {
  const date = new Date(note.created_at);
  return (
    <div style={{
      display: "flex",
      gap: "0.85rem",
      paddingBottom: "1rem",
      position: "relative",
    }}>
      {/* Timeline dot */}
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "rgba(59,130,246,0.1)",
          border: "1px solid rgba(59,130,246,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#93c5fd",
        }}>
          <NoteIcon />
        </div>
      </div>

      {/* Content */}
      <div style={{
        flex: 1,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "0.75rem 0.9rem",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--accent)" }}>
            {note.author}
          </span>
          <span style={{ fontSize: "0.72rem", color: "var(--muted-3)" }}>
            {date.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            {" · "}
            {date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--text)", lineHeight: 1.6 }}>
          {note.content}
        </p>
      </div>
    </div>
  );
}

export function AnalystNotes({
  entity,
  onUpdated,
}: {
  entity: Entity;
  onUpdated: (entity: Entity) => void;
}) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!content.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await addEntityNote(entity.id, content.trim());
      onUpdated(updated);
      setContent("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ marginTop: "1rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1.25rem" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        <h3 style={{ margin: 0, fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)" }}>
          Analyst Notes
        </h3>
        {entity.analyst_notes.length > 0 && (
          <span style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: "0.08rem 0.5rem",
            fontSize: "0.68rem",
            fontWeight: 700,
            color: "var(--muted-2)",
          }}>
            {entity.analyst_notes.length}
          </span>
        )}
      </div>

      {/* Existing notes */}
      {entity.analyst_notes.length === 0 ? (
        <p style={{ color: "var(--muted-3)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
          No notes yet. Add observations below.
        </p>
      ) : (
        <div style={{ marginBottom: "1.25rem" }}>
          {entity.analyst_notes.map((note) => (
            <TimelineNote key={note.id} note={note} />
          ))}
        </div>
      )}

      {/* Add note form */}
      <form onSubmit={handleSubmit}>
        <div className="field" style={{ marginBottom: "0.75rem" }}>
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Add analyst observations, flags, or compliance notes…"
            style={{ resize: "vertical", fontSize: "0.875rem" }}
          />
        </div>
        {error && (
          <div style={{
            marginBottom: "0.75rem",
            padding: "0.6rem 0.85rem",
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
            borderRadius: 6,
            color: "#fca5a5",
            fontSize: "0.8rem",
          }}>
            {error}
          </div>
        )}
        <button
          className="btn btn-sm"
          type="submit"
          disabled={loading || !content.trim()}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <NoteIcon />
          {loading ? "Saving…" : "Save Note"}
        </button>
      </form>
    </div>
  );
}
