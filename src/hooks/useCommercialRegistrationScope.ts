import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

// A UI/request fence, not authorization: RLS and server triggers decide writes.
export function useCommercialRegistrationScope() {
  const auth = useAuth();
  const fence = useStorageAccessScope("commercial-registration");
  const client = useQueryClient();
  useEffect(() => {
    const predicate = (q: { queryKey: readonly unknown[] }) =>
      ["parceiros-b2b", "clientes-lookup-b2b", "consultores-lookup"].includes(String(q.queryKey[0])) && q.queryKey[1] !== fence.scope;
    void client.cancelQueries({ predicate });
    client.removeQueries({ predicate });
  }, [client, fence.scope]);
  return { ...fence, actorId: auth.user?.id, organizationId: auth.profile?.organization_id,
    canManagePartners: fence.ready && auth.roles.some(r => r === "administrador" || r === "gestor_comercial") };
}