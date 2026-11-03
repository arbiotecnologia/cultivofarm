import { useAuth } from "./useAuth";
import { useStorageAccessScope } from "./useStorageAccessScope";

/** UI eligibility only; every tenant RPC independently authorizes the actor. */
export function useTenantCatalogEditor() {
  const { roles = [] } = useAuth();
  const access = useStorageAccessScope("tenant-catalog-editor");
  return { ...access, canEdit: access.ready && roles.some(r => r === "administrador" || r === "gestor") &&
    !roles.some(r => r === "parceiro_b2b" || r === "parceiro_b2b_tecnico" || r === "superadmin") };
}