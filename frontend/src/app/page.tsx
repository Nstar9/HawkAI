import { listInvestigations, listEntities } from "@/lib/api";
import { TerminalHome } from "@/components/terminal/TerminalHome";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  const [invResult, entResult] = await Promise.allSettled([
    listInvestigations(30),
    listEntities(50),
  ]);

  const investigations = invResult.status === "fulfilled" ? invResult.value : [];
  const entityCount   = entResult.status === "fulfilled" ? entResult.value.length : 0;

  return <TerminalHome initialInvestigations={investigations} entityCount={entityCount} />;
}
