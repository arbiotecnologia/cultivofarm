import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";

/** Presentation/request fencing only. Server authorization remains mandatory. */
export function useStorageAccessScope(resource: string) {
  const { user, profile, roles, loading } = useAuth();
  const ready = !loading && !!user?.id && profile?.user_id === user.id &&
    profile.ativo === true && profile.senha_provisoria !== true &&
    !!profile.organization_id && roles.length > 0;
  const scope = JSON.stringify([ready, user?.id, profile?.organization_id, [...roles].sort(), resource]);
  const state = useRef({ scope, epoch: 0, mounted: true });
  if (state.current.scope !== scope) {
    state.current.scope = scope;
    state.current.epoch += 1;
  }
  useEffect(() => {
    state.current.mounted = true;
    return () => { state.current.mounted = false; state.current.epoch += 1; };
  }, []);
  const capture = () => {
    const epoch = state.current.epoch;
    return () => ready && state.current.mounted && state.current.scope === scope && state.current.epoch === epoch;
  };
  return { ready, scope, capture };
}