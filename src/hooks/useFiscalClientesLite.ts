/**
 * Fase Fiscal 3.16.1 — Hook de busca leve de clientes para wizard fiscal.
 *
 * Somente `id, nome, cpf_cnpj` — nada sensível é carregado no cliente.
 * Se a política RLS de `public.clientes` negar acesso, retorna [].
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FiscalClienteLite {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
}

export function useFiscalClientesLite(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ["fiscal", "clientes-lite", term],
    queryFn: async (): Promise<FiscalClienteLite[]> => {
      let q = supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj")
        .order("nome", { ascending: true })
        .limit(20);
      if (term.length >= 2) {
        const digits = term.replace(/\D/g, "");
        const filters = [`nome.ilike.%${term}%`];
        if (digits.length >= 3) filters.push(`cpf_cnpj.ilike.%${digits}%`);
        q = q.or(filters.join(","));
      }
      const { data, error } = await q;
      if (error) {
        // RLS pode negar acesso a alguns papéis — não é erro fatal para o wizard.
        return [];
      }
      return (data ?? []) as FiscalClienteLite[];
    },
  });
}
