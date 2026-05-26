import { getEntity, getInvestigation } from "@/lib/api";
import { InvestigationDetail } from "@/components/terminal/InvestigationDetail";
import type { Entity, Investigation } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InvestigationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let investigation: Investigation | null = null;
  let entity: Entity | null = null;

  try {
    investigation = await getInvestigation(id);
    if (investigation?.result?.entity_id) {
      try {
        entity = await getEntity(investigation.result.entity_id);
      } catch { /* entity may not exist yet — detail view handles it live */ }
    }
  } catch { /* investigation not found — detail view will show loading state */ }

  return (
    <InvestigationDetail
      id={id}
      initialInvestigation={investigation}
      initialEntity={entity}
    />
  );
}
