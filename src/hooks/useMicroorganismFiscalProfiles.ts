/**
 * Fase Fiscal 3.21 — Hooks tipados para `microorganism_fiscal_profiles`.
 *
 * ESPELHA a API de `useProductFiscalProfiles`, adaptada à FK e à view
 * de prontidão próprias do microrganismo. Nenhum campo do produto
 * canônico é consultado por estes hooks — perfil próprio é a fonte de
 * verdade fiscal do microrganismo.
 *
 * Boundary de tipos:
 *   A tabela `microorganism_fiscal_profiles` ainda NÃO está no arquivo
 *   canônico `src/integrations/supabase/cultivofarm.types.ts`. Usamos casts locais
 *   `as unknown as` estritamente na fronteira supabase, análogos ao
 *   padrão já adotado em `useMicroorganismFiscalAssociation`. Remover
 *   após regen oficial de types.ts.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildInsertPayload,
  buildUpdatePayload,
  type MicroorganismFiscalFormValues,
  type MicroorganismFiscalRow,
} from "@/lib/fiscal/microorganismFiscalValidation";

export type MicroorganismReadinessRow = {
  microorganism_id: string;
  profile_status: string | null;
  minimally_classified: boolean | null;
  accounting_validated: boolean | null;
};

/** Resumo tabular (colunas fiscais essenciais) para uso em listas. */
export interface MicroorganismFiscalListItem {
  id: string;
  microorganism_id: string;
  profile_status: string | null;
  ncm: string | null;
  cest: string | null;
  cfop_in_state: string | null;
  cfop_interstate: string | null;
  updated_at: string | null;
}

export const MICROORGANISM_FISCAL_PROFILE_KEYS = {
  root: ["fiscal", "microorganism-profiles"] as const,
  profile: (microId: string | null) =>
    [...MICROORGANISM_FISCAL_PROFILE_KEYS.root, "profile", microId] as const,
  readiness: (ids: string[]) =>
    [
      ...MICROORGANISM_FISCAL_PROFILE_KEYS.root,
      "readiness",
      ids.slice().sort(),
    ] as const,
  byIds: (ids: string[]) =>
    [
      ...MICROORGANISM_FISCAL_PROFILE_KEYS.root,
      "by-ids",
      ids.slice().sort(),
    ] as const,
} as const;

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; status?: number; message?: string };
  if (e.code === "42501" || e.code === "PGRST301") return true;
  if (e.status === 401 || e.status === 403) return true;
  if (typeof e.message === "string" && /permission|denied|rls/i.test(e.message))
    return true;
  return false;
}

// Boundary tipada — a tabela/view ainda não existe em types.ts. Confinamos
// o cast a UM único helper local, análogo ao padrão adotado em
// `useMicroorganismFiscalAssociation`. Remover após regen canônica.
interface LooseFilterable {
  select: (cols: string) => LooseFilterable;
  eq: (col: string, val: unknown) => LooseFilterable;
  in: (col: string, vals: readonly unknown[]) => LooseFilterable;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  single: () => Promise<{ data: unknown; error: unknown }>;
  then: Promise<{ data: unknown; error: unknown }>["then"];
}
interface LooseBuilder extends LooseFilterable {
  insert: (payload: unknown) => LooseFilterable;
  update: (payload: unknown) => LooseFilterable;
}
const looseFrom = (name: "microorganism_fiscal_profiles" | "v_microorganism_fiscal_readiness"): LooseBuilder =>
  (supabase as unknown as { from: (n: string) => LooseBuilder }).from(name);

export class OptimisticConflictError extends Error {
  constructor() {
    super("optimistic_conflict");
    this.name = "OptimisticConflictError";
  }
}

export function useMicroorganismFiscalProfile(
  microorganismId: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && !!microorganismId;
  return useQuery<MicroorganismFiscalRow | null, Error>({
    queryKey: MICROORGANISM_FISCAL_PROFILE_KEYS.profile(microorganismId),
    enabled,
    queryFn: async () => {
      const q = looseFrom("microorganism_fiscal_profiles")
        .select("*")
        .eq("microorganism_id", microorganismId!)
        .eq("is_active", true)
        .maybeSingle();
      const { data, error } = (await q) as unknown as {
        data: MicroorganismFiscalRow | null;
        error: unknown;
      };
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error((error as { message?: string }).message ?? "unknown");
      }
      return data ?? null;
    },
  });
}

export function useMicroorganismFiscalProfileList(
  microorganismIds: string[],
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && microorganismIds.length > 0;
  return useQuery<MicroorganismFiscalListItem[], Error>({
    queryKey: MICROORGANISM_FISCAL_PROFILE_KEYS.byIds(microorganismIds),
    enabled,
    queryFn: async () => {
      const q = looseFrom("microorganism_fiscal_profiles")
        .select(
          "id, microorganism_id, profile_status, ncm, cest, cfop_in_state, cfop_interstate, updated_at",
        )
        .in("microorganism_id", microorganismIds)
        .eq("is_active", true);
      const { data, error } = (await q) as unknown as {
        data: MicroorganismFiscalListItem[] | null;
        error: unknown;
      };
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error((error as { message?: string }).message ?? "unknown");
      }
      return data ?? [];
    },
  });
}

export function useMicroorganismFiscalReadiness(
  microorganismIds: string[],
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && microorganismIds.length > 0;
  return useQuery<MicroorganismReadinessRow[], Error>({
    queryKey: MICROORGANISM_FISCAL_PROFILE_KEYS.readiness(microorganismIds),
    enabled,
    queryFn: async () => {
      const q = looseFrom("v_microorganism_fiscal_readiness")
        .select(
          "microorganism_id, profile_status, minimally_classified, accounting_validated",
        )
        .in("microorganism_id", microorganismIds);
      const { data, error } = (await q) as unknown as {
        data: MicroorganismReadinessRow[] | null;
        error: unknown;
      };
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error((error as { message?: string }).message ?? "unknown");
      }
      return data ?? [];
    },
  });
}

export function useSaveMicroorganismFiscalProfile() {
  const qc = useQueryClient();
  return useMutation<
    MicroorganismFiscalRow,
    Error,
    {
      microorganismId: string;
      current: MicroorganismFiscalRow | null;
      values: MicroorganismFiscalFormValues;
    }
  >({
    mutationFn: async ({ microorganismId, current, values }) => {
      if (!current) {
        // Verificação prévia: perfil ATIVO pode existir de outra sessão.
        const existing = (await looseFrom("microorganism_fiscal_profiles")
          .select("id")
          .eq("microorganism_id", microorganismId)
          .eq("is_active", true)
          .maybeSingle()) as unknown as {
          data: { id: string } | null;
          error: unknown;
        };
        if (existing.error) {
          if (isPermissionError(existing.error))
            throw new Error("permission_denied");
          throw new Error(
            (existing.error as { message?: string }).message ?? "unknown",
          );
        }
        if (existing.data) throw new Error("duplicate_profile");

        const payload = buildInsertPayload(microorganismId, values);
        const { data, error } = (await looseFrom("microorganism_fiscal_profiles")
          .insert(payload as never)
          .select("*")
          .single()) as unknown as {
          data: MicroorganismFiscalRow | null;
          error: unknown;
        };
        if (error) {
          if (isPermissionError(error)) throw new Error("permission_denied");
          // Índice único de perfil ativo por microrganismo: inserção concorrente vira conflito, nunca duplicata.
          if ((error as { code?: string }).code === "23505") throw new Error("duplicate_profile");
          throw new Error(
            (error as { message?: string }).message ?? "unknown",
          );
        }
        if (!data) throw new Error("unknown");
        return data;
      }

      const payload = buildUpdatePayload(values, current);
      if (Object.keys(payload).length === 0) return current;

      const { data, error } = (await looseFrom("microorganism_fiscal_profiles")
        .update(payload as never)
        .eq("id", current.id)
        .eq("microorganism_id", current.microorganism_id)
        .eq("updated_at", current.updated_at)
        .select("*")
        .maybeSingle()) as unknown as {
        data: MicroorganismFiscalRow | null;
        error: unknown;
      };
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error((error as { message?: string }).message ?? "unknown");
      }
      if (!data) throw new OptimisticConflictError();
      return data;
    },
    onSuccess: (_row, v) => {
      qc.invalidateQueries({
        queryKey: MICROORGANISM_FISCAL_PROFILE_KEYS.profile(v.microorganismId),
      });
      qc.invalidateQueries({
        queryKey: MICROORGANISM_FISCAL_PROFILE_KEYS.root,
      });
    },
  });
}
