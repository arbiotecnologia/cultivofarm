import type { QueryClient } from "@tanstack/react-query";
import { visitaWorkspaceKey } from "@/hooks/useVisitaWorkspace";

export async function invalidateWizardProgress(client: QueryClient, registroId: string, step: "checkin" | "campo" | "diag") {
  await Promise.all([
    client.invalidateQueries({ queryKey: [`wizard-${step}-flag`, registroId] }),
    client.invalidateQueries({ queryKey: visitaWorkspaceKey(registroId) }),
  ]);
}