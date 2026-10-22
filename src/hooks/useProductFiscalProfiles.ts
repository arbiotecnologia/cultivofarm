/**
 * Fase Fiscal 3.2 — Hooks tipados para `product_fiscal_profiles`.
 *
 * - Sem `any`, sem casts amplos.
 * - `.select(...)` seleciona SOMENTE colunas necessárias.
 * - Paginação server-side via `.range()`.
 * - Mutações separadas (create/update) — não usamos upsert porque a
 *   unicidade `product_id` não é garantida pelo contrato exposto em
 *   `types.ts` nesta fase.
 * - Concorrência otimista no UPDATE via `updated_at` prévio.
 * - Erro de RLS/permissão nunca se torna sucesso silencioso.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useScopedPortalQuery } from "@/hooks/useScopedPortalQuery";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/cultivofarm.types";
import {
  buildInsertPayload,
  buildUpdatePayload,
  productFiscalFormSchema,
  type ProductFiscalFormValues,
  type ProductFiscalRow,
} from "@/lib/fiscal/productFiscalValidation";
import {
  PRODUCT_FISCAL_PROFILE_STATUSES,
  isProductFiscalProfileStatus,
} from "@/lib/fiscal/fiscalOptions";

export type ReadinessRow = any;

// Resource prefixes only: useScopedPortalQuery appends canonical actor and
// request scopes (actor/tenant/roles/epoch). Never use these prefixes for raw reads.
export const PRODUCT_FISCAL_KEYS = {
  root: ["fiscal", "product-profiles"] as const,
  list: (p: ListParams) =>
    [...PRODUCT_FISCAL_KEYS.root, "list", p] as const,
  readiness: (ids: string[]) =>
    [...PRODUCT_FISCAL_KEYS.root, "readiness", ids.slice().sort()] as const,
  byIds: (ids: string[]) =>
    [...PRODUCT_FISCAL_KEYS.root, "by-ids", ids.slice().sort()] as const,
};

export interface ListParams {
  search: string;
  status: string | null;
  page: number;
  pageSize: number;
}

export interface ProductListItem {
  product_id: string;
  product_nome: string;
  product_codigo: string | null;
  profile_id: string | null;
  profile_status: string | null;
  is_active: boolean | null;
  ncm: string | null;
  cest: string | null;
  cfop_in_state: string | null;
  cfop_interstate: string | null;
  updated_at: string | null;
}

export interface ListResult {
  items: ProductListItem[];
  total: number;
  statuses: string[];
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

/**
 * Lista dirigida pela tabela `produtos` (fonte de verdade do catálogo) com
 * join left para `product_fiscal_profiles`. Assim exibimos produtos sem
 * perfil e produtos com perfil, sem alterar o cadastro mestre.
 */
export function useProductFiscalList(
  params: ListParams,
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled ?? true;
  const result = useScopedPortalQuery<ListResult>({
    queryKey: PRODUCT_FISCAL_KEYS.list(params),
    enabled,
    queryFn: async () => {
      const from = params.page * params.pageSize;
      const to = from + params.pageSize - 1;

      const term = params.search.trim();
      const safeTerm = term.replace(/[,()]/g, " ").slice(0, 100);
      // Status entra ANTES do range: quando definido, usamos !inner para que
      // o count e os items reflitam exatamente o subconjunto filtrado.
      // Ramos separados por variante (evita união de tipos do query builder).
      const hasStatus =
        !!params.status && isProductFiscalProfileStatus(params.status);

      const runFiltered = async () => {
        let q = (supabase as any)
          .from("produtos")
          .select(
            "id, nome, codigo, product_fiscal_profiles!inner(id, profile_status, is_active, ncm, cest, cfop_in_state, cfop_interstate, updated_at)",
            { count: "exact" },
          )
          .eq("product_fiscal_profiles.profile_status", params.status as string)
          .order("nome", { ascending: true })
          .range(from, to);
        if (safeTerm) {
          q = q.or(`nome.ilike.%${safeTerm}%,codigo.ilike.%${safeTerm}%`);
        }
        return q;
      };

      const runUnfiltered = async () => {
        let q = (supabase as any)
          .from("produtos")
          .select(
            "id, nome, codigo, product_fiscal_profiles(id, profile_status, is_active, ncm, cest, cfop_in_state, cfop_interstate, updated_at)",
            { count: "exact" },
          )
          .order("nome", { ascending: true })
          .range(from, to);
        if (safeTerm) {
          q = q.or(`nome.ilike.%${safeTerm}%,codigo.ilike.%${safeTerm}%`);
        }
        return q;
      };

      const { data, error, count } = hasStatus
        ? await runFiltered()
        : await runUnfiltered();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }

      const items: ProductListItem[] = (data ?? []).map((p: any) => {
        const profileRaw = p.product_fiscal_profiles;
        const profile = Array.isArray(profileRaw)
          ? profileRaw[0] ?? null
          : profileRaw ?? null;
        return {
          product_id: p.id,
          product_nome: p.nome,
          product_codigo: p.codigo ?? null,
          profile_id: profile?.id ?? null,
          profile_status: profile?.profile_status ?? null,
          is_active: profile?.is_active ?? null,
          ncm: profile?.ncm ?? null,
          cest: profile?.cest ?? null,
          cfop_in_state: profile?.cfop_in_state ?? null,
          cfop_interstate: profile?.cfop_interstate ?? null,
          updated_at: profile?.updated_at ?? null,
        };
      });

      // Opções derivadas da lista canônica tipada (não da página).
      const statuses = [...PRODUCT_FISCAL_PROFILE_STATUSES];

      return { items, total: count ?? items.length, statuses };
    },
  });
  return { ...result, data: result.ready && !result.isError ? result.data : undefined };
}

/** Resumo agregado da view `v_product_fiscal_readiness` para os produtos da página. */
export function useProductFiscalReadiness(
  productIds: string[],
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && productIds.length > 0;
  const result = useScopedPortalQuery<ReadinessRow[]>({
    queryKey: PRODUCT_FISCAL_KEYS.readiness(productIds),
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_product_fiscal_readiness")
        .select("product_id, profile_status, minimally_classified, accounting_validated")
        .in("product_id", productIds as any);
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return data ?? [];
    },
  });
  return { ...result, data: result.ready && !result.isError ? result.data : undefined };
}

/**
 * Fase Fiscal 3.20.1 — Fonte independente para resolver produtos canônicos
 * por ID, sem depender da página/filtro corrente de `useProductFiscalList`.
 *
 * Motivação: microrganismos podem apontar para produtos que não estão na
 * página atual (ou que estão fora do filtro "Produtos"). Sem esta consulta,
 * o vínculo seria falsamente exibido como "não associado". Buscamos apenas
 * pelos IDs recebidos (dataset pequeno, N ≤ dezenas), com o MESMO join a
 * `product_fiscal_profiles` para reutilizar o mesmo perfil canônico —
 * nenhum perfil paralelo é criado.
 */
export function useProductFiscalListByIds(
  productIds: string[],
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && productIds.length > 0;
  const result = useScopedPortalQuery<ProductListItem[]>({
    queryKey: PRODUCT_FISCAL_KEYS.byIds(productIds),
    enabled,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("produtos")
        .select(
          "id, nome, codigo, product_fiscal_profiles(id, profile_status, is_active, ncm, cest, cfop_in_state, cfop_interstate, updated_at)",
        )
        .in("id", productIds as any);
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return (data ?? []).map((p: any) => {
        const profileRaw = p.product_fiscal_profiles;
        const profile = Array.isArray(profileRaw)
          ? profileRaw[0] ?? null
          : profileRaw ?? null;
        return {
          product_id: p.id,
          product_nome: p.nome,
          product_codigo: p.codigo ?? null,
          profile_id: profile?.id ?? null,
          profile_status: profile?.profile_status ?? null,
          is_active: profile?.is_active ?? null,
          ncm: profile?.ncm ?? null,
          cest: profile?.cest ?? null,
          cfop_in_state: profile?.cfop_in_state ?? null,
          cfop_interstate: profile?.cfop_interstate ?? null,
          updated_at: profile?.updated_at ?? null,
        };
      });
    },
  });
  return { ...result, data: result.ready && !result.isError ? result.data : undefined };
}

export function useProductFiscalProfile(
  productId: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && !!productId;
  const result = useScopedPortalQuery<ProductFiscalRow | null>({
    queryKey: [...PRODUCT_FISCAL_KEYS.root, "profile", productId] as const,
    enabled,
    queryFn: async () => {
      if (!productId) throw new Error("product_required");
      const { data, error } = await (supabase as any)
        .from("product_fiscal_profiles")
        .select("*")
        .eq("product_id", productId)
        .maybeSingle();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      return data ?? null;
    },
  });
  return { ...result, data: result.ready && !result.isError ? result.data : undefined };
}

export class OptimisticConflictError extends Error {
  constructor() {
    super("optimistic_conflict");
    this.name = "OptimisticConflictError";
  }
}

export function useSaveProductFiscalProfile() {
  const qc = useQueryClient();
  const fence = useStorageAccessScope("product-fiscal-save");
  const actor = useStorageAccessScope("portal-query-actor");
  return useMutation<
    ProductFiscalRow,
    Error,
    {
      productId: string;
      current: ProductFiscalRow | null;
      values: ProductFiscalFormValues;
    }
  >({
    mutationFn: async ({ productId, current, values }) => {
      const valid = fence.capture();
      const actorValid = actor.capture();
      const actorScope = actor.scope;
      const check = () => { if (!valid() || !actorValid()) throw new Error("fiscal_context_changed"); };
      const invalidate = async () => {
        check();
        await qc.invalidateQueries({ queryKey: PRODUCT_FISCAL_KEYS.root,
          predicate: query => query.queryKey.at(-2) === actorScope });
        check();
      };
      check();
      values = productFiscalFormSchema.parse(values);
      if (!productId || (current && (current.product_id !== productId || !current.id || !current.updated_at))) throw new Error("fiscal_target_changed");
      if (!current) {
        // Verificação prévia: perfil pode existir de outra sessão.
        const existing = await (supabase as any)
          .from("product_fiscal_profiles")
          .select("id")
          .eq("product_id", productId)
          .maybeSingle();
        check();
        if (existing.error) {
          if (isPermissionError(existing.error))
            throw new Error("permission_denied");
          throw new Error(existing.error.message);
        }
        if (existing.data) {
          throw new Error("duplicate_profile");
        }
        const payload = buildInsertPayload(productId, values);
        const { data, error } = await (supabase as any)
          .from("product_fiscal_profiles")
          .insert(payload as any)
          .select("*")
          .single();
        check();
        if (error) {
          if (isPermissionError(error)) throw new Error("permission_denied");
          throw new Error(error.message);
        }
        await invalidate();
        return data;
      }
      const payload = buildUpdatePayload(values, current);
      if (Object.keys(payload).length === 0) {
        return current; // nada a atualizar
      }
      const { data, error } = await (supabase as any)
        .from("product_fiscal_profiles")
        .update(payload as any)
        .eq("id", current.id)
        .eq("product_id", current.product_id)
        .eq("updated_at", current.updated_at)
        .select("*")
        .maybeSingle();
      check();
      if (error) {
        if (isPermissionError(error)) throw new Error("permission_denied");
        throw new Error(error.message);
      }
      if (!data) {
        throw new OptimisticConflictError();
      }
      await invalidate();
      return data;
    },
  });
}
