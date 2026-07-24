/**
 * Fase SINIEF 3.1/3.2 — Hook leve de leitura de microrganismos para o painel
 * "Operações especiais — Ajuste SINIEF 49/2025".
 *
 * Reutiliza apenas colunas públicas de `microrganismos` já expostas em
 * `types.ts`. Nunca lê perfil fiscal aqui (isso é responsabilidade dos
 * hooks `useMicroorganismFiscalProfileList`).
 *
 * 3.2: falhas do Supabase são propagadas como erro amigável (sem SQL cru),
 * permitindo que `isError` seja detectado pelos consumidores. Nunca converte
 * falha em `[]` — isso confundiria catálogo vazio com indisponibilidade.
 *
 * NÃO grava em nenhuma tabela SINIEF.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FiscalMicrorganismoLite {
  id: string;
  nome: string;
  codigo: string | null;
  nome_cientifico: string | null;
}

export function useFiscalMicrorganismosLite(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ["fiscal", "microrganismos-lite", term],
    queryFn: async (): Promise<FiscalMicrorganismoLite[]> => {
      let q = supabase
        .from("microrganismos")
        .select("id, nome, codigo, nome_cientifico")
        .eq("ativo", true)
        .order("nome", { ascending: true })
        .limit(20);
      if (term.length >= 2) {
        q = q.or(
          `nome.ilike.%${term}%,codigo.ilike.%${term}%,nome_cientifico.ilike.%${term}%`,
        );
      }
      const { data, error } = await q;
      if (error) {
        // Não expõe SQL/detalhes; propaga como erro para acionar isError.
        throw new Error("Falha ao consultar microrganismos.");
      }
      return (data ?? []).map((row) => ({
        id: String(row.id),
        nome: String(row.nome ?? ""),
        codigo: (row.codigo as string | null) ?? null,
        nome_cientifico: (row.nome_cientifico as string | null) ?? null,
      }));
    },
    retry: false,
  });
}
