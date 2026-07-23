/**
 * Fase Fiscal 3.16.1 / Fase Corretiva Bloco 4 / Fase Homologação —
 * Busca leve de clientes para wizard e seletor fiscal.
 *
 * - SELECT restrito: `id, nome, cpf_cnpj, codigo_cliente`. Nada além.
 * - Termo sanitizado antes de compor filtro PostgREST.
 * - Estado tipado: distingue vazio (`ok` + []), `permission_denied` e
 *   `error`, sem engolir falhas.
 * - Anti-join defensivo: exclui clientes que já possuem
 *   `customer_fiscal_profiles`. Estratégia em duas etapas escopadas:
 *     1) Busca candidatos em `clientes` (limit 20).
 *     2) Consulta *estreita* `customer_fiscal_profiles.customer_id`
 *        restrita a `.in(candidateIds)`. Nunca carrega todos os perfis.
 *   O PostgREST não expressa `NOT EXISTS` sobre relacionamento reverso
 *   como filtro nativo do embed (filtros em recursos embutidos
 *   restringem o embed, não as linhas do parent), por isso preferimos a
 *   consulta estreita `IN` — sem RPC nova, sem varredura ampla.
 * - `excludeIds` opcional: defesa adicional para IDs conhecidos pela
 *   página/cache.
 * - Banco mantém `UNIQUE (customer_id)` como última defesa.
 */
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FiscalClienteLite {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  codigo_cliente: string | null;
}

export type FiscalClientesLiteStatus = "ok" | "permission_denied" | "error";

export interface FiscalClientesLiteResult {
  items: FiscalClienteLite[];
  status: FiscalClientesLiteStatus;
}

/** Sanitiza termo para uso em `.or()` do PostgREST. */
export function sanitizePostgrestTerm(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[,()%*_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; status?: number; message?: string };
  if (e.code === "42501" || e.code === "PGRST301") return true;
  if (e.status === 401 || e.status === 403) return true;
  if (typeof e.message === "string" && /permission|denied|rls/i.test(e.message))
    return true;
  return false;
}

export interface UseFiscalClientesLiteOptions {
  /** IDs já conhecidos como perfilados (defesa em profundidade). */
  excludeIds?: readonly string[];
  /** Quando true, aplica o anti-join contra `customer_fiscal_profiles`.
   *  Default: true (comportamento do seletor de novo perfil). */
  excludeProfiled?: boolean;
}

export function useFiscalClientesLite(
  search: string,
  options: UseFiscalClientesLiteOptions = {},
): UseQueryResult<FiscalClientesLiteResult, Error> {
  const term = sanitizePostgrestTerm(search ?? "");
  const excludeIds = Array.from(new Set(options.excludeIds ?? [])).sort();
  const excludeProfiled = options.excludeProfiled ?? true;
  return useQuery<FiscalClientesLiteResult, Error>({
    queryKey: [
      "fiscal",
      "clientes-lite",
      term,
      { excludeProfiled, excludeIds },
    ],
    queryFn: async () => {
      let q = supabase
        .from("clientes")
        .select("id, nome, cpf_cnpj, codigo_cliente")
        .order("nome", { ascending: true })
        .limit(20);
      if (term.length >= 2) {
        const digits = term.replace(/\D/g, "");
        const filters = [
          `nome.ilike.%${term}%`,
          `codigo_cliente.ilike.%${term}%`,
        ];
        if (digits.length >= 3) filters.push(`cpf_cnpj.ilike.%${digits}%`);
        q = q.or(filters.join(","));
      }
      if (excludeIds.length > 0) {
        q = q.not("id", "in", `(${excludeIds.join(",")})`);
      }
      const { data, error } = await q;
      if (error) {
        if (isPermissionError(error)) {
          return { items: [], status: "permission_denied" };
        }
        return { items: [], status: "error" };
      }

      let items = (data ?? []) as FiscalClienteLite[];

      if (excludeProfiled && items.length > 0) {
        const candidateIds = items.map((c) => c.id);
        // Consulta estreita: SELECT customer_id apenas, restrita aos
        // candidatos já filtrados. Nunca lista todos os perfis.
        const { data: profiled, error: pErr } = await supabase
          .from("customer_fiscal_profiles")
          .select("customer_id")
          .in("customer_id", candidateIds);
        if (pErr) {
          if (isPermissionError(pErr)) {
            return { items: [], status: "permission_denied" };
          }
          return { items: [], status: "error" };
        }
        const taken = new Set(
          (profiled ?? []).map((r) => (r as { customer_id: string }).customer_id),
        );
        items = items.filter((c) => !taken.has(c.id));
      }

      return { items, status: "ok" };
    },
  });
}
