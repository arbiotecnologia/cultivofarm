/**
 * Fase Fiscal 3.3 — Hooks tipados para `service_fiscal_profiles`.
 *
 * - Sem `any`, sem casts amplos.
 * - `.select(...)` seleciona apenas colunas necessárias.
 * - Paginação, busca e filtro server-side.
 * - Diferentemente de produtos, NÃO existe catálogo canônico de
 *   serviços: a lista é dirigida por `service_fiscal_profiles` (fonte
 *   de verdade da fase). `source_reference` é a referência transitória.
 * - Create/update separados; verificação prévia de duplicidade
 *   respeitando os índices únicos canônicos (case-insensitive por
 *   `lower(btrim(source_reference))` e por `service_id` ativo).
 * - Concorrência otimista no UPDATE via `updated_at` prévio.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  buildInsertPayload,
  buildUpdatePayload,
  normalizeSourceReferenceKey,
  type ServiceFiscalFormValues,
  type ServiceFiscalRow,
  type ServiceIdentity,
} from "@/lib/fiscal/serviceFiscalValidation";

export type ServiceReadinessRow = any;

export const SERVICE_FISCAL_KEYS = {
  root: ["fiscal", "service-profiles"] as const,
  list: (p: ListParams) =>
    [...SERVICE_FISCAL_KEYS.root, "list", p] as const,
  readiness: (ids: string[]) =>
    [...SERVICE_FISCAL_KEYS.root, "readiness", ids.slice().sort()] as const,
};

export interface ListParams {
  search: string;
  status: string | null;
  page: number;
  pageSize: number;
}

export interface ServiceListItem {
  id: string;
  service_id: string | null;
  source_reference: string | null;
  service_name: string | null;
  fiscal_description_template: string | null;
  lc116_item: string | null;
  cnae: string | null;
  municipal_taxation_code: string | null;
  national_taxation_code: string | null;
  profile_status: string;
  is_active: boolean;
  updated_at: string;
}

export interface ListResult {
  items: ServiceListItem[];
  total: number;
  statuses: string[];
}

const LIST_COLUMNS =
  "id, service_id, source_reference, service_name, fiscal_description_template, lc116_item, cnae, municipal_taxation_code, national_taxation_code, profile_status, is_active, updated_at";

function isPermissionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; status?: number; message?: string };
  if (e.code === "42501" || e.code === "PGRST301") return true;
  if (e.status === 401 || e.status === 403) return true;
  if (typeof e.message === "string" && /permission|denied|rls/i.test(e.message))
    return true;
  return false;
}

export function useServiceFiscalList(
  params: ListParams,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  return useQuery<ListResult, Error>({
    queryKey: SERVICE_FISCAL_KEYS.list(params),
    enabled,
    queryFn: async () => {
      const from = params.page * params.pageSize;
      const to = from + params.pageSize - 1;

      let query = (supabase as any)
        .from("service_fiscal_profiles")
        .select(LIST_COLUMNS, { count: "exact" })
        .eq("is_active", true)
        .order("source_reference", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(from, to);

      const term = params.search.trim();
      if (term) {
        const safe = term.replace(/[,()]/g, " ").slice(0, 100);
        query = query.or(
          `source_reference.ilike.%${safe}%,fiscal_description_template.ilike.%${safe}%,service_name.ilike.%${safe}%`,
        );
      }
      if (params.status) {
        query = query.eq("profile_status", params.status);
      }

      const { data, error, count } = await query;
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }

      const items = (data ?? []) as any[];

      // Statuses distintos observados na página; a lista completa vive na
      // view de prontidão, mas evitamos consulta extra ampla nesta fase.
      const statuses = Array.from(
        new Set(
          items
            .map((it) => it.profile_status)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      ).sort();

      return { items, total: count ?? items.length, statuses };
    },
  });
}

export function useServiceFiscalReadiness(
  profileIds: string[],
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && profileIds.length > 0;
  return useQuery<ServiceReadinessRow[], Error>({
    queryKey: SERVICE_FISCAL_KEYS.readiness(profileIds),
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_service_fiscal_readiness")
        .select(
          "id, service_id, source_reference, profile_status, minimally_classified, accounting_validated",
        )
        .in("id", profileIds as any);
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return data ?? [];
    },
  });
}

export function useServiceFiscalProfile(
  profileId: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && !!profileId;
  return useQuery<ServiceFiscalRow | null, Error>({
    queryKey: [...SERVICE_FISCAL_KEYS.root, "profile", profileId] as const,
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("service_fiscal_profiles")
        .select("*")
        .eq("id", profileId!)
        .maybeSingle();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return data ?? null;
    },
  });
}

export class OptimisticConflictError extends Error {
  constructor() {
    super("optimistic_conflict");
    this.name = "OptimisticConflictError";
  }
}
export class DuplicateServiceProfileError extends Error {
  constructor(
    public readonly kind: "service_id" | "source_reference",
  ) {
    super("duplicate_service_profile");
    this.name = "DuplicateServiceProfileError";
  }
}

async function findActiveByServiceId(
  serviceId: string,
  excludeId?: string,
): Promise<string | null> {
  let q = (supabase as any)
    .from("service_fiscal_profiles")
    .select("id")
    .eq("service_id", serviceId)
    .eq("is_active", true)
    .limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) {
    if (isPermissionError(error)) throw new Error("permission_denied");
    throw new Error(error.message);
  }
  return data?.id ?? null;
}

async function findActiveBySourceReference(
  ref: string,
  excludeId?: string,
): Promise<string | null> {
  // O índice canônico é `lower(btrim(source_reference))`. Usamos `ilike`
  // exato (sem wildcards) para bater o mesmo conjunto de forma
  // case-insensitive, e escapamos os caracteres especiais do LIKE.
  const escaped = ref.replace(/\\/g, "\\\\").replace(/[%_]/g, (c) => `\\${c}`);
  let q = (supabase as any)
    .from("service_fiscal_profiles")
    .select("id, source_reference")
    .ilike("source_reference", escaped)
    .eq("is_active", true)
    .limit(20);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q;
  if (error) {
    if (isPermissionError(error)) throw new Error("permission_denied");
    throw new Error(error.message);
  }
  const key = normalizeSourceReferenceKey(ref);
  const hit = (data ?? []).find(
    (r) => normalizeSourceReferenceKey(r.source_reference) === key,
  );
  return hit?.id ?? null;
}

export function useSaveServiceFiscalProfile() {
  const qc = useQueryClient();
  return useMutation<
    ServiceFiscalRow,
    Error,
    {
      current: ServiceFiscalRow | null;
      identity: ServiceIdentity;
      values: ServiceFiscalFormValues;
    }
  >({
    mutationFn: async ({ current, identity, values }) => {
      if (!identity.service_id && !identity.source_reference) {
        throw new Error("missing_service_identifier");
      }

      if (!current) {
        // Checagem de duplicidade pré-INSERT.
        if (identity.service_id) {
          const dup = await findActiveByServiceId(identity.service_id);
          if (dup) throw new DuplicateServiceProfileError("service_id");
        }
        if (identity.source_reference) {
          const dup = await findActiveBySourceReference(
            identity.source_reference,
          );
          if (dup) throw new DuplicateServiceProfileError("source_reference");
        }
        const payload = buildInsertPayload(identity, values);
        const { data, error } = await (supabase as any)
          .from("service_fiscal_profiles")
          .insert(payload as any)
          .select("*")
          .single();
        if (error) {
          if (isPermissionError(error)) throw new Error("permission_denied");
          if (error.code === "23505") {
            throw new DuplicateServiceProfileError(
              identity.service_id ? "service_id" : "source_reference",
            );
          }
          throw new Error(error.message);
        }
        return data;
      }

      // UPDATE. Se identidade mudou, revalidar duplicidade.
      if (
        identity.service_id &&
        identity.service_id !== (current.service_id ?? null)
      ) {
        const dup = await findActiveByServiceId(identity.service_id, current.id);
        if (dup) throw new DuplicateServiceProfileError("service_id");
      }
      if (
        identity.source_reference &&
        normalizeSourceReferenceKey(identity.source_reference) !==
          normalizeSourceReferenceKey(current.source_reference)
      ) {
        const dup = await findActiveBySourceReference(
          identity.source_reference,
          current.id,
        );
        if (dup) throw new DuplicateServiceProfileError("source_reference");
      }

      const payload = buildUpdatePayload(values, current, identity);
      if (Object.keys(payload).length === 0) {
        return current;
      }
      const { data, error } = await (supabase as any)
        .from("service_fiscal_profiles")
        .update(payload as any)
        .eq("id", current.id)
        .eq("updated_at", current.updated_at)
        .select("*")
        .maybeSingle();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        if (error.code === "23505") {
          throw new DuplicateServiceProfileError(
            payload.service_id !== undefined ? "service_id" : "source_reference",
          );
        }
        throw new Error(error.message);
      }
      if (!data) {
        throw new OptimisticConflictError();
      }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SERVICE_FISCAL_KEYS.root });
    },
  });
}
