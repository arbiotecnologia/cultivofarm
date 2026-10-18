import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ClienteVinculado {
  id: string;
  nome: string;
  principal: boolean;
}

const STORAGE_KEY = "portal_active_cliente_id";
// Same-tab selection only, never an authorization cache. Every instance validates membership.
const selections = new Map<string, string | null>();
const listeners = new Set<() => void>();
window.addEventListener("portal-client-preferences-cleared", () => {
  selections.clear();
  listeners.forEach(listener => listener());
});
const subscribeSelection = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function publishSelection(scope: string, id: string | null) {
  if (selections.get(scope) === id) return;
  selections.set(scope, id);
  listeners.forEach(listener => listener());
}

export function usePortalCliente() {
  const { user, profile, roles, loading: authLoading, authzReady = true, authzEpoch = 0 } = useAuth();
  const organizationId = profile?.organization_id ?? null;
  const portalRole = roles.some(role => ["cliente_produtor", "administrador", "gestor"].includes(role));
  // Foundation de cache (mesma identidade): lease pendente/expirada derruba o
  // ready; a época entra no escopo — seleção/respostas de época antiga não
  // reabrem. A limpeza de seleções já ocorre via "portal-client-preferences-
  // cleared" disparado pelo AuthProvider na mudança de época/expiração.
  const ready = !authLoading && !!user && profile?.user_id === user.id && profile?.ativo === true && profile.senha_provisoria !== true && !!organizationId && portalRole && authzReady;
  const generation = useRef(0);
  const controller = useRef<AbortController>();
  const scope = `${user?.id ?? ""}:${organizationId ?? ""}:${[...roles].sort().join(",")}:${ready}:${authzEpoch}`;
  const sharedId = useSyncExternalStore(subscribeSelection, () => selections.get(scope) ?? null, () => null);
  const liveScope = useRef(scope);
  if (liveScope.current !== scope) { liveScope.current = scope; generation.current += 1; controller.current?.abort(); }
  const [resolvedScope, setResolvedScope] = useState("");
  const [clientes, setClientes] = useState<ClienteVinculado[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const current = () => requestGeneration === generation.current && liveScope.current === scope && !abort.signal.aborted;
    setClientes([]);
    setResolvedScope("");
    if (!ready || !user || !organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // Authoritative active membership, not raw rows or profile fallback.
    const { data: allowed, error: allowedError } = await supabase.rpc("get_cliente_ids_for_user", { _user_id: user.id }).abortSignal(abort.signal);
    if (!current()) return;
    if (allowedError) { setResolvedScope(scope); setLoading(false); return; }
    const { data: vinculos, error: vinculosError } = await supabase
      .from("user_clientes")
      .select("cliente_id, principal, is_active, revoked_at, valid_from, valid_until")
      .eq("user_id", user.id).eq("is_active", true).is("revoked_at", null).abortSignal(abort.signal);
    if (!current()) return;

    if (vinculosError) {
      setResolvedScope(scope); setLoading(false); return;
    }

    const vincList = (vinculos ?? []).filter(v => v.is_active === true && v.revoked_at == null &&
      (v.valid_from == null || Date.parse(v.valid_from) <= Date.now()) &&
      (v.valid_until == null || Date.parse(v.valid_until) >= Date.now()));
    const clienteIds = Array.from(new Set(Array.isArray(allowed) ? allowed : []));

    let list: ClienteVinculado[] = [];

    if (clienteIds.length > 0) {
      // 3) Resolve nomes dos clientes em uma query separada
      const { data: clis, error: clisError } = await supabase
        .from("clientes")
        .select("id, nome")
        .in("id", clienteIds)
        .filter("organization_id", "eq", organizationId).eq("status_cliente", "ativo").abortSignal(abort.signal);
      if (!current()) return;

      if (clisError) {
        setResolvedScope(scope); setLoading(false); return;
      }

      const nomeMap = new Map<string, string>((clis ?? []).map((c) => [c.id, c.nome]));
      const principalMap = new Map<string, boolean>(vincList.map((v) => [v.cliente_id, !!v.principal]));

      list = clienteIds.filter((id) => nomeMap.has(id))
        .map((id) => ({
          id,
          nome: nomeMap.get(id) ?? "Cliente",
          principal: principalMap.get(id) ?? (clienteIds.length === 1),
        }))
        .sort((a, b) =>
          a.principal === b.principal ? a.nome.localeCompare(b.nome) : a.principal ? -1 : 1
        );
    }

    if (!current()) return;
    setResolvedScope(scope);
    setClientes(list);

    // Selecionar cliente ativo
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(`${STORAGE_KEY}:${scope}`); } catch { /* Optional preference only. */ }
    const active =
      list.find((c) => c.id === selections.get(scope)) || list.find((c) => c.id === stored) ||
      list.find((c) => c.principal) ||
      list[0] ||
      null;
    publishSelection(scope, active?.id ?? null);
    setLoading(false);
  }, [user, organizationId, ready, scope]);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    return () => { generation.current += 1; controller.current?.abort(); window.removeEventListener("focus", refresh); };
  }, [load]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== `${STORAGE_KEY}:${scope}` || !ready || resolvedScope !== scope) return;
      const found = clientes.find(c => c.id === event.newValue);
      if (found) publishSelection(scope, found.id);
    };
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener("storage", sync); };
  }, [scope, ready, resolvedScope, clientes]);

  const setClienteAtivo = useCallback(
    (id: string) => {
      const found = clientes.find((c) => c.id === id);
      if (!ready || resolvedScope !== scope || !found) return;
      publishSelection(scope, found.id);
      try {
        window.localStorage.setItem(`${STORAGE_KEY}:${scope}`, found.id);
      } catch { /* Selection remains valid in memory if storage is unavailable. */ }
    },
    [clientes, scope, ready, resolvedScope]
  );

  const selected = ready && resolvedScope === scope ? clientes.find(c => c.id === sharedId) : undefined;
  return { clienteId: selected?.id ?? null, clienteNome: selected?.nome ?? null, clientes: ready && resolvedScope === scope ? clientes : [], setClienteAtivo, loading: authLoading || (ready && (loading || resolvedScope !== scope)), ready, scope, reload: load };
}
