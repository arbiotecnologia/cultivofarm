import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ClienteVinculado {
  id: string;
  nome: string;
  principal: boolean;
}

const STORAGE_KEY = "portal_active_cliente_id";

export function usePortalCliente() {
  const { user, profile, roles, loading: authLoading } = useAuth();
  const organizationId = profile?.organization_id ?? null;
  const portalRole = roles.some(role => ["cliente_produtor", "administrador", "gestor"].includes(role));
  const ready = !authLoading && !!user && profile?.user_id === user.id && profile?.ativo === true && profile.senha_provisoria !== true && !!organizationId && portalRole;
  const generation = useRef(0);
  const controller = useRef<AbortController>();
  const scope = `${user?.id ?? ""}:${organizationId ?? ""}:${[...roles].sort().join(",")}:${ready}`;
  const liveScope = useRef(scope);
  if (liveScope.current !== scope) { liveScope.current = scope; generation.current += 1; controller.current?.abort(); }
  const [resolvedScope, setResolvedScope] = useState("");
  const [clientes, setClientes] = useState<ClienteVinculado[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    const abort = new AbortController(); controller.current = abort;
    const current = () => requestGeneration === generation.current && liveScope.current === scope && !abort.signal.aborted;
    setClientes([]); setClienteId(null); setClienteNome(null);
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
      .select("cliente_id, principal")
      .eq("user_id", user.id).abortSignal(abort.signal);
    if (!current()) return;

    if (vinculosError) {
      setResolvedScope(scope); setLoading(false); return;
    }

    const vincList = (vinculos ?? []) as Array<{ cliente_id: string; principal: boolean | null }>;
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
      list.find((c) => c.id === stored) ||
      list.find((c) => c.principal) ||
      list[0] ||
      null;
    setClienteId(active?.id ?? null);
    setClienteNome(active?.nome ?? null);
    setLoading(false);
  }, [user, organizationId, ready, scope]);

  useEffect(() => {
    void load();
    const refresh = () => { void load(); };
    window.addEventListener("focus", refresh);
    return () => { generation.current += 1; controller.current?.abort(); window.removeEventListener("focus", refresh); };
  }, [load]);

  const setClienteAtivo = useCallback(
    (id: string) => {
      const found = clientes.find((c) => c.id === id);
      if (!ready || resolvedScope !== scope || !found) return;
      setClienteId(found.id);
      setClienteNome(found.nome);
      try {
        window.localStorage.setItem(`${STORAGE_KEY}:${scope}`, found.id);
      } catch { /* Selection remains valid in memory if storage is unavailable. */ }
    },
    [clientes, scope, ready, resolvedScope]
  );

  return { clienteId: ready && resolvedScope === scope ? clienteId : null, clienteNome: ready && resolvedScope === scope ? clienteNome : null, clientes: ready && resolvedScope === scope ? clientes : [], setClienteAtivo, loading: authLoading || (ready && (loading || resolvedScope !== scope)), reload: load };
}
