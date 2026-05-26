"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createInvestigation } from "@/lib/api";
import { EntitySearch, type EntitySearchValues } from "@/components/EntitySearch";

export function DashboardClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(values: EntitySearchValues) {
    setLoading(true);
    setError(null);
    try {
      const investigation = await createInvestigation(values);
      router.push(`/investigations/${investigation.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start investigation");
      setLoading(false);
    }
  }

  return (
    <div>
      <EntitySearch onSubmit={handleSubmit} loading={loading} />
      {error && (
        <div style={{
          marginTop: "0.85rem",
          padding: "0.75rem 1rem",
          background: "rgba(239,68,68,0.08)",
          border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 8,
          color: "#fca5a5",
          fontSize: "0.85rem",
        }} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
