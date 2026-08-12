import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ClienteVinculado {
  id: string;
  nome: string;
  principal: boolean;
}

const STORAGE_KEY = "portal_active_cliente_id";

export function usePortalCliente() {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<ClienteVinculado[]>([]);
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteNome, setClienteNome] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);

    // 1) Busca vínculos cru (sem join embutido para não depender de relacionamento PostgREST)
    const { data: vinculos, error: vinculosError } = await (supabase as any)
      .from("user_clientes")
      .select("cliente_id, principal")
      .eq("user_id", user.id);

    if (vinculosError) {
      console.error("usePortalCliente: erro ao buscar user_clientes:", vinculosError);
    }

    const vincList = (vinculos ?? []) as Array<{ cliente_id: string; principal: boolean | null }>;
    const clienteIds = Array.from(new Set(vincList.map((v) => v.cliente_id).filter(Boolean)));

    // 2) Fallback: profiles.cliente_id (compatibilidade com cadastros antigos)
    if (clienteIds.length === 0) {
      const { data: prof } = await (supabase as any)
        .from("profiles")
        .select("cliente_id")
        .eq("user_id", user.id)
        .maybeSingle();
      const cid = (prof as any)?.cliente_id;
      if (cid) clienteIds.push(cid);
    }

    let list: ClienteVinculado[] = [];

    if (clienteIds.length > 0) {
      // 3) Resolve nomes dos clientes em uma query separada
      const { data: clis, error: clisError } = await (supabase as any)
        .from("clientes")
        .select("id, nome")
        .in("id", clienteIds as any);

      if (clisError) {
        console.error("usePortalCliente: erro ao buscar clientes:", clisError);
      }

      const nomeMap = new Map<string, string>((clis ?? []).map((c: any) => [c.id, c.nome]));
      const principalMap = new Map<string, boolean>(vincList.map((v) => [v.cliente_id, !!v.principal]));

      list = clienteIds
        .map((id) => ({
          id,
          nome: nomeMap.get(id) ?? "Cliente",
          principal: principalMap.get(id) ?? (clienteIds.length === 1),
        }))
        .sort((a, b) =>
          a.principal === b.principal ? a.nome.localeCompare(b.nome) : a.principal ? -1 : 1
        );
    }

    setClientes(list);

    // Selecionar cliente ativo
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    const active =
      list.find((c) => c.id === stored) ||
      list.find((c) => c.principal) ||
      list[0] ||
      null;
    setClienteId(active?.id ?? null);
    setClienteNome(active?.nome ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const setClienteAtivo = useCallback(
    (id: string) => {
      const found = clientes.find((c) => c.id === id);
      if (!found) return;
      setClienteId(found.id);
      setClienteNome(found.nome);
      try {
        window.localStorage.setItem(STORAGE_KEY, found.id);
      } catch {}
    },
    [clientes]
  );

  return { clienteId, clienteNome, clientes, setClienteAtivo, loading, reload: load };
}
