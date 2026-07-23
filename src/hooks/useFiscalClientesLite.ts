/**
 * Fase Fiscal 3.16.1 / Fase Corretiva Bloco 4 — Busca leve de clientes
 * para wizard e seletor fiscal.
 *
 * - SELECT restrito: `id, nome, cpf_cnpj, codigo_cliente`. Nada além.
 * - Termo sanitizado antes de compor filtro PostgREST: remove vírgula,
 *   parênteses, curingas (%,_) e caracteres de controle; comprimento
 *   limitado.
 * - Estado tipado permite distinguir vazio (`ok` + []) de
 *   `permission_denied` e `error`, sem engolir falhas.
 * - Nenhum log de dado pessoal.
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

/** Sanitiza termo para uso em `.or()` do PostgREST.
 *  Remove separadores/curingas/parênteses/caracteres de controle e
 *  limita a 60 caracteres. Nunca lança. */
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

export function useFiscalClientesLite(
  search: string,
): UseQueryResult<FiscalClientesLiteResult, Error> {
  const term = sanitizePostgrestTerm(search ?? "");
  return useQuery<FiscalClientesLiteResult, Error>({
    queryKey: ["fiscal", "clientes-lite", term],
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
      const { data, error } = await q;
      if (error) {
        if (isPermissionError(error)) {
          return { items: [], status: "permission_denied" };
        }
        return { items: [], status: "error" };
      }
      return {
        items: (data ?? []) as FiscalClienteLite[],
        status: "ok",
      };
    },
  });
}
