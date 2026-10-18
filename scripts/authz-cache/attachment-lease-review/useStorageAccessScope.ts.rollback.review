import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";

/** Presentation/request fencing only. Server authorization remains mandatory. */
export function useStorageAccessScope(resource: string) {
  // Defaults true/0: mocks de teste e providers antigos sem os campos novos
  // mantêm o comportamento de gate fechado.
  const { user, profile, roles = [], loading, authzReady = true, authzEpoch = 0 } = useAuth();
  // Foundation de cache (mesma identidade): lease pendente/expirada derruba
  // o ready e a época entra no escopo — respostas de época antiga não reabrem
  // dados após revogação/troca de vínculo/A→B→A. Gate fechado: authzReady
  // sempre true e época 0, sem alteração de comportamento.
  const ready = !loading && !!user?.id && profile?.user_id === user.id &&
    profile.ativo === true && profile.senha_provisoria !== true &&
    !!profile.organization_id && roles.length > 0 && authzReady;
  const scope = JSON.stringify([ready, user?.id, profile?.organization_id, [...roles].sort(), resource, authzEpoch]);
  const state = useRef({ scope, epoch: 0, mounted: true });
  if (state.current.scope !== scope) {
    state.current.scope = scope;
    state.current.epoch += 1;
  }
  useEffect(() => {
    const current = state.current;
    current.mounted = true;
    return () => { current.mounted = false; current.epoch += 1; };
  }, []);
  const capture = () => {
    const epoch = state.current.epoch;
    return () => ready && state.current.mounted && state.current.scope === scope && state.current.epoch === epoch;
  };
  return { ready, scope, capture };
}