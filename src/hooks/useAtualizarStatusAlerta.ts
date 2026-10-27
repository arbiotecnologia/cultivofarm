import { useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";

export type StatusAlerta = "ativo" | "monitoramento" | "encerrado";
export interface AtualizarStatusAlertaArgs { id: string; status: StatusAlerta; expectedUpdatedAt: string }
export interface AtualizarStatusAlertaResult { id: string; status: StatusAlerta; updated_at: string }

export const STATUS_UNAVAILABLE = "Não foi possível acessar este alerta. Atualize a lista e verifique seu acesso.";
export const STATUS_CONFLICT = "Este alerta foi alterado por outra pessoa. Atualize a lista antes de tentar novamente.";
export const STATUS_UNCONFIRMED = "Resposta não confirmada. Atualize a lista antes de tentar novamente.";
export const STATUS_IN_FLIGHT = "A atualização do alerta já está em andamento.";
const isUuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const TS = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;
/** Exact UTC microseconds (BigInt); null if not a valid timestamptz. Never used to rewrite the sent value. */
export function timestampMicros(v: unknown): bigint | null {
  if (typeof v !== "string") return null;
  const m = TS.exec(v); if (!m) return null;
  const [y, mo, d, h, mi, se] = m.slice(1, 7).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 59) return null;
  const ms = Date.UTC(y, mo - 1, d, h, mi, se);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  let offsetMin = 0;
  if (m[8] !== "Z") {
    const sign = m[8][0] === "-" ? -1 : 1; const digits = m[8].slice(1).replace(":", "");
    const oh = Number(digits.slice(0, 2)); const om = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
    if (oh > 15 || om > 59) return null;
    offsetMin = sign * (oh * 60 + om);
  }
  return (BigInt(ms) - BigInt(offsetMin) * 60_000n) * 1000n + BigInt((m[7] ?? "").padEnd(6, "0"));
}
const isTs = (v: unknown): v is string => timestampMicros(v) !== null;

const rpc = supabase.rpc.bind(supabase) as unknown as (
  fn: "rpc_atualizar_status_alerta_agronomico_v1",
  args: { p_alerta_id: string; p_novo_status: string; p_updated_at_esperado: string },
) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;

/** Canonical status change with server CAS. Server authorizes; client fences and validates only. */
export function useAtualizarStatusAlerta() {
  const fence = useStorageAccessScope("alerta-agronomico-status");
  const actor = useStorageAccessScope("portal-query-actor");
  const qc = useQueryClient();
  const pending = useRef<symbol | null>(null);
  return useMutation<AtualizarStatusAlertaResult, Error, AtualizarStatusAlertaArgs>({
    retry: false,
    mutationFn: async (args) => {
      const valid = fence.capture();
      if (!valid() || !isUuid(args.id)) throw new Error(STATUS_UNAVAILABLE);
      if (pending.current) throw new Error(STATUS_IN_FLIGHT);
      // Exact server timestamp (microseconds preserved); never fabricated.
      if (!isTs(args.expectedUpdatedAt)) throw new Error(STATUS_CONFLICT);
      const ticket = Symbol("alerta-status");
      pending.current = ticket;
      try {
        const { data, error } = await rpc("rpc_atualizar_status_alerta_agronomico_v1", {
          p_alerta_id: args.id, p_novo_status: args.status, p_updated_at_esperado: args.expectedUpdatedAt,
        });
        if (!valid()) throw new Error(STATUS_UNAVAILABLE);
        if (error) {
          if (["42501", "PT403", "PT404", "P0002", "403", "404"].includes(error.code ?? "")) throw new Error(STATUS_UNAVAILABLE);
          if (error.code === "PT409") throw new Error(STATUS_CONFLICT);
          throw new Error("Não foi possível atualizar o alerta.");
        }
        // RETURNS alertas_agronomicos (composite): PostgREST replies with ONE object; arrays are rejected.
        const row = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : null;
        const before = timestampMicros(args.expectedUpdatedAt); const after = row ? timestampMicros(row.updated_at) : null;
        if (!row || row.id !== args.id || row.status !== args.status || before === null || after === null || after <= before) throw new Error(STATUS_UNCONFIRMED);
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] === "alertas_agronomicos" && q.queryKey.at(-2) === actor.scope });
        return { id: args.id, status: args.status, updated_at: row.updated_at as string };
      } finally {
        if (pending.current === ticket) pending.current = null;
      }
    },
  });
}
