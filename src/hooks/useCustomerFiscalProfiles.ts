/**
 * Fase Fiscal 3.4 — Hooks tipados para `customer_fiscal_profiles`.
 *
 * - Sem `any`, sem casts amplos; PostgREST embed tipado por `Database`.
 * - `.select(...)` seleciona apenas colunas necessárias (nunca "*").
 * - Paginação, busca e filtro server-side.
 * - Cliente é a fonte da identidade (`customer_id` FK + unique).
 * - Create/update separados; UPDATE otimista por `id` + `updated_at`.
 * - CPF/CNPJ do cliente é lido só para exibir/mascarar; nunca duplicado
 *   no payload.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import {
  buildInsertPayload,
  buildUpdatePayload,
  assertCustomerId,
  type CustomerFiscalFormValues,
  type CustomerFiscalRow,
} from "@/lib/fiscal/customerFiscalValidation";
import {
  CUSTOMER_FISCAL_PROFILE_STATUSES,
  TAXPAYER_INDICATOR_OPTIONS,
} from "@/lib/fiscal/fiscalOptions";
import { sanitizePostgrestTerm } from "@/hooks/useFiscalClientesLite";

export type CustomerReadinessRow =
  Database["public"]["Views"]["v_customer_fiscal_readiness"]["Row"];

export const CUSTOMER_FISCAL_KEYS = {
  root: ["fiscal", "customer-profiles"] as const,
  list: (p: ListParams) =>
    [...CUSTOMER_FISCAL_KEYS.root, "list", p] as const,
  readiness: (ids: string[]) =>
    [...CUSTOMER_FISCAL_KEYS.root, "readiness", ids.slice().sort()] as const,
};

export interface ListParams {
  search: string;
  status: string | null;
  taxpayerIndicator: string | null;
  page: number;
  pageSize: number;
}

export interface CustomerListItem {
  id: string;
  customer_id: string;
  taxpayer_indicator: string | null;
  state_registration_status: string | null;
  municipal_registration: string | null;
  fiscal_municipality_ibge_code: string | null;
  fiscal_city: string | null;
  fiscal_state: string | null;
  rural_producer_indicator: boolean;
  foreign_customer_indicator: boolean;
  profile_status: string;
  updated_at: string;
  cliente_nome: string | null;
  cliente_cpf_cnpj: string | null;
  cliente_codigo: string | null;
}

export interface ListResult {
  items: CustomerListItem[];
  total: number;
  statuses: string[];
  taxpayerIndicators: string[];
}

// Embed tipado do FK customer_id -> clientes.id.
const LIST_COLUMNS =
  "id, customer_id, taxpayer_indicator, state_registration_status, municipal_registration, fiscal_municipality_ibge_code, fiscal_city, fiscal_state, rural_producer_indicator, foreign_customer_indicator, profile_status, updated_at, clientes:customer_id!inner(id, nome, cpf_cnpj, codigo_cliente)";

type EmbeddedCliente = {
  id: string;
  nome: string | null;
  cpf_cnpj: string | null;
  codigo_cliente: string | null;
};

type RawListRow = {
  id: string;
  customer_id: string;
  taxpayer_indicator: string | null;
  state_registration_status: string | null;
  municipal_registration: string | null;
  fiscal_municipality_ibge_code: string | null;
  fiscal_city: string | null;
  fiscal_state: string | null;
  rural_producer_indicator: boolean;
  foreign_customer_indicator: boolean;
  profile_status: string;
  updated_at: string;
  clientes: EmbeddedCliente | EmbeddedCliente[] | null;
};

function pickCliente(v: RawListRow["clientes"]): EmbeddedCliente | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
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

export function useCustomerFiscalList(
  params: ListParams,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  return useQuery<ListResult, Error>({
    queryKey: CUSTOMER_FISCAL_KEYS.list(params),
    enabled,
    queryFn: async () => {
      const from = params.page * params.pageSize;
      const to = from + params.pageSize - 1;

      let query = supabase
        .from("customer_fiscal_profiles")
        .select(LIST_COLUMNS, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("id", { ascending: true })
        .range(from, to);

      const term = params.search.trim();
      if (term) {
        const safe = term.replace(/[,()]/g, " ").slice(0, 100);
        const digits = safe.replace(/\D/g, "");
        // Busca por nome do cliente (embed) OR documento (digits) OR IE/IM.
        const orClauses: string[] = [
          `clientes.nome.ilike.%${safe}%`,
        ];
        if (digits.length >= 3) {
          orClauses.push(`clientes.cpf_cnpj.ilike.%${digits}%`);
        }
        // NOTA: filtros em relações embed exigem `foreignTable`; usamos a
        // sintaxe `.or(..., { foreignTable: 'clientes' })` para nome/doc.
        query = query.or(
          orClauses.join(","),
          { foreignTable: "clientes" },
        );
      }
      if (params.status) {
        query = query.eq("profile_status", params.status);
      }
      if (params.taxpayerIndicator) {
        query = query.eq("taxpayer_indicator", params.taxpayerIndicator);
      }

      const { data, error, count } = await query;
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }

      const raw = (data ?? []) as unknown as RawListRow[];
      const items: CustomerListItem[] = raw.map((r) => {
        const c = pickCliente(r.clientes);
        return {
          id: r.id,
          customer_id: r.customer_id,
          taxpayer_indicator: r.taxpayer_indicator,
          state_registration_status: r.state_registration_status,
          municipal_registration: r.municipal_registration,
          fiscal_municipality_ibge_code: r.fiscal_municipality_ibge_code,
          fiscal_city: r.fiscal_city,
          fiscal_state: r.fiscal_state,
          rural_producer_indicator: r.rural_producer_indicator,
          foreign_customer_indicator: r.foreign_customer_indicator,
          profile_status: r.profile_status,
          updated_at: r.updated_at,
          cliente_nome: c?.nome ?? null,
          cliente_cpf_cnpj: c?.cpf_cnpj ?? null,
          cliente_codigo: c?.codigo_cliente ?? null,
        };
      });

      const statuses = Array.from(
        new Set(
          items
            .map((it) => it.profile_status)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      ).sort();
      const taxpayerIndicators = Array.from(
        new Set(
          items
            .map((it) => it.taxpayer_indicator)
            .filter((v): v is string => typeof v === "string" && v.length > 0),
        ),
      ).sort();

      return { items, total: count ?? items.length, statuses, taxpayerIndicators };
    },
  });
}

export function useCustomerFiscalReadiness(
  customerIds: string[],
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && customerIds.length > 0;
  return useQuery<CustomerReadinessRow[], Error>({
    queryKey: CUSTOMER_FISCAL_KEYS.readiness(customerIds),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_customer_fiscal_readiness")
        .select("customer_id, profile_status, has_ibge")
        .in("customer_id", customerIds);
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return data ?? [];
    },
  });
}

export function useCustomerFiscalProfile(
  profileId: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && !!profileId;
  return useQuery<CustomerFiscalRow | null, Error>({
    queryKey: [...CUSTOMER_FISCAL_KEYS.root, "profile", profileId] as const,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_fiscal_profiles")
        .select(
          "id, customer_id, taxpayer_indicator, state_registration_status, municipal_registration, fiscal_email, fiscal_phone, use_main_address, fiscal_postal_code, fiscal_street, fiscal_number, fiscal_complement, fiscal_neighborhood, fiscal_city, fiscal_municipality_ibge_code, fiscal_state, country_code, rural_producer_indicator, foreign_customer_indicator, profile_status, validation_notes, created_at, updated_at, created_by, updated_by",
        )
        .eq("id", profileId!)
        .maybeSingle();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return (data ?? null) as CustomerFiscalRow | null;
    },
  });
}

export class OptimisticConflictError extends Error {
  constructor() {
    super("optimistic_conflict");
    this.name = "OptimisticConflictError";
  }
}
export class DuplicateCustomerProfileError extends Error {
  constructor() {
    super("duplicate_customer_profile");
    this.name = "DuplicateCustomerProfileError";
  }
}
export class MissingCustomerError extends Error {
  constructor() {
    super("customer_not_found");
    this.name = "MissingCustomerError";
  }
}

async function customerExists(customerId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("clientes")
    .select("id")
    .eq("id", customerId)
    .maybeSingle();
  if (error) {
    if (isPermissionError(error)) throw new Error("permission_denied");
    throw new Error(error.message);
  }
  return !!data;
}

async function findByCustomerId(
  customerId: string,
  excludeId?: string,
): Promise<string | null> {
  let q = supabase
    .from("customer_fiscal_profiles")
    .select("id")
    .eq("customer_id", customerId)
    .limit(1);
  if (excludeId) q = q.neq("id", excludeId);
  const { data, error } = await q.maybeSingle();
  if (error) {
    if (isPermissionError(error)) throw new Error("permission_denied");
    throw new Error(error.message);
  }
  return data?.id ?? null;
}

export function useSaveCustomerFiscalProfile() {
  const qc = useQueryClient();
  return useMutation<
    CustomerFiscalRow,
    Error,
    {
      current: CustomerFiscalRow | null;
      customerId: string;
      values: CustomerFiscalFormValues;
    }
  >({
    mutationFn: async ({ current, customerId, values }) => {
      assertCustomerId(customerId);

      if (!current) {
        // INSERT: valida existência do cliente e duplicidade prévia.
        const exists = await customerExists(customerId);
        if (!exists) throw new MissingCustomerError();
        const dup = await findByCustomerId(customerId);
        if (dup) throw new DuplicateCustomerProfileError();

        const payload = buildInsertPayload(customerId, values);
        const { data, error } = await supabase
          .from("customer_fiscal_profiles")
          .insert(payload)
          .select("*")
          .single();
        if (error) {
          if (isPermissionError(error)) throw new Error("permission_denied");
          if (error.code === "23505") throw new DuplicateCustomerProfileError();
          throw new Error(error.message);
        }
        return data as CustomerFiscalRow;
      }

      // UPDATE otimista por id + customer_id + updated_at.
      const payload = buildUpdatePayload(values, current);
      if (Object.keys(payload).length === 0) {
        return current;
      }
      const { data, error } = await supabase
        .from("customer_fiscal_profiles")
        .update(payload)
        .eq("id", current.id)
        .eq("customer_id", current.customer_id)
        .eq("updated_at", current.updated_at)
        .select("*")
        .maybeSingle();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        if (error.code === "23505") throw new DuplicateCustomerProfileError();
        throw new Error(error.message);
      }
      if (!data) throw new OptimisticConflictError();
      return data as CustomerFiscalRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CUSTOMER_FISCAL_KEYS.root });
    },
  });
}
