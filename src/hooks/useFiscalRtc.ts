/**
 * Fase Fiscal 3.19.3 — Hook RTC/IBS-CBS (tipado, com revisão otimista).
 * RPCs: `rpc_fiscal_*_rtc_*` / `rpc_fiscal_*_ibs_cbs_*`.
 * Roles: leitura admin/gestor/financeiro; escrita empresa=admin;
 * escrita item global=Superadmin. Códigos de erro: FISCAL_CONFLICT,
 * FISCAL_FORBIDDEN, FISCAL_UNAUTHENTICATED, FISCAL_RTC_*.
 */
import { useProductFiscalAccess } from "@/hooks/useProductFiscalAccess";
import { useStorageAccessScope } from "@/hooks/useStorageAccessScope";
import { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  rtcCompanySchema,
  ibsCbsItemSchema,
  rtcHasSensitiveKey,
  type RtcCompanyConfiguration,
  type IbsCbsItemConfiguration,
} from "@/lib/fiscal/rtcConfiguration";

/** Adaptador local estreito para as RPCs ainda ausentes de types.ts.
 *  Não altera o cliente global. */
type RpcResponse<T> = { data: T | null; error: { message: string; code?: string } | null };
type NarrowRpc = <T>(
  fn: string,
  args?: Record<string, unknown>,
) => Promise<RpcResponse<T>>;
const rpc: NarrowRpc = (fn, args) =>
  (supabase.rpc as unknown as NarrowRpc)(fn, args as Record<string, unknown>);

export type RtcEnvelope<T> = { configuration: T; revision: string; exists: boolean };
export type RtcHookState<T> = {
  data: T | null;
  revision: string;
  loading: boolean;
  error: string | null;
  saving: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function parseEnvelope<T>(
  raw: unknown,
  parser: (v: unknown) => { success: true; data: T } | { success: false },
): RtcEnvelope<T> | null {
  if (!isRecord(raw)) return null;
  const rev = typeof raw.revision === "string" ? raw.revision : "";
  const cfg = raw.configuration;
  const parsed =
    isRecord(cfg) && Object.keys(cfg).length > 0
      ? parser(cfg)
      : parser({ schema_version: 1 });
  if (!parsed.success) return null;
  return { configuration: parsed.data, revision: rev, exists: Boolean(raw.exists) };
}

function toMessage(raw: string, fallback: string, code?: string): string {
  if (/FISCAL_COMPANY_AMBIGUOUS/.test(raw))
    return "Há mais de um cadastro fiscal para esta empresa. Solicite a revisão dos cadastros antes de salvar.";
  if (/FISCAL_COMPANY_NOT_INITIALIZED/.test(raw))
    return "Configure a empresa fiscal antes de editar o RTC.";
  if (/FISCAL_CONFLICT/.test(raw) || code === "PT409")
    return "Os dados foram alterados por outra pessoa. Recarregue antes de salvar.";
  if (/FISCAL_FORBIDDEN|permission_denied|42501/.test(raw))
    return "Você não tem permissão para essa operação.";
  if (/FISCAL_UNAUTHENTICATED|unauthenticated/.test(raw))
    return "Sessão expirada. Entre novamente.";
  if (/FISCAL_RTC_SENSITIVE_KEY/.test(raw))
    return "Payload contém chaves sensíveis proibidas.";
  if (/FISCAL_RTC_INVALID_PERCENT/.test(raw))
    return "Percentual inválido (esperado entre 0 e 100).";
  if (/FISCAL_RTC_UNKNOWN_FIELD/.test(raw))
    return "Campo desconhecido no payload RTC.";
  if (/FISCAL_RTC_SCHEMA_VERSION_UNSUPPORTED/.test(raw))
    return "Versão de schema RTC não suportada.";
  if (/FISCAL_RTC_INVALID_CODE|FISCAL_RTC_INVALID_DATE|FISCAL_RTC_STRING_TOO_LONG|FISCAL_RTC_INVALID_ADDITIONAL_FIELDS|FISCAL_RTC_INVALID_ENVIRONMENT|FISCAL_RTC_INVALID_REVIEW_STATUS|FISCAL_RTC_INVALID_PAYLOAD|FISCAL_RTC_PAYLOAD_TOO_LARGE/.test(raw))
    return "Formato do payload RTC inválido.";
  if (/FISCAL_COMPANY_NOT_INITIALIZED/.test(raw))
    return "Configure a empresa fiscal antes de editar o RTC.";
  if (/FISCAL_ITEM_NOT_FOUND/.test(raw))
    return "Perfil fiscal do item não encontrado.";
  return fallback;
}

const emptyCompany = (): RtcCompanyConfiguration => ({
  schema_version: 1,
  rtc_environment: "NOT_CONFIGURED",
});

type OperationScope = {
  scope: string;
  sequence: number;
  save: symbol | null;
  adopted: boolean;
  revision: string;
};

/** One operation ledger per mounted hook/scope; server CAS remains authoritative. */
function useRtcOperations<T>(options: {
  scope: string;
  enabled: boolean;
  canWrite: boolean;
  capture: () => () => boolean;
  getFn: string;
  saveFn: string;
  args?: Record<string, unknown>;
  parser: (v: unknown) => { success: true; data: T } | { success: false };
  label: string;
}) {
  const { scope, enabled, canWrite, capture, getFn, saveFn, args, parser, label } = options;
  const operations = useRef<OperationScope>({ scope, sequence: 0, save: null, adopted: false, revision: "" });
  if (operations.current.scope !== scope) {
    operations.current = { scope, sequence: 0, save: null, adopted: false, revision: "" };
  }
  const [state, setState] = useState<RtcHookState<T>>({
    data: null, revision: "", loading: enabled, error: null, saving: false,
  });

  const load = useCallback(async () => {
    const owner = operations.current;
    const valid = capture();
    // Do not increment the sequence while a save owns this scope.
    if (!enabled || !valid() || owner.scope !== scope || owner.save) return;
    const sequence = ++owner.sequence;
    const current = () => valid() && operations.current === owner && owner.sequence === sequence && !owner.save;
    setState((s) => owner.adopted
      ? { ...s, loading: true, error: null }
      : { data: null, revision: "", loading: true, saving: false, error: null });
    try {
      const { data, error } = await rpc<unknown>(getFn, args);
      if (!current()) return;
      if (error) {
        owner.adopted = true;
        setState((s) => ({ ...s, error: toMessage(error.message, `Falha ao carregar configuração ${label}.`, error.code) }));
        return;
      }
      const env = parseEnvelope<T>(data, parser);
      owner.adopted = true;
      if (!env) {
        setState((s) => ({ ...s, error: `Resposta inválida do servidor (${label} indisponível).` }));
        return;
      }
      owner.revision = env.revision;
      setState({ data: env.configuration, revision: env.revision, loading: false, saving: false, error: null });
    } catch {
      if (current()) {
        owner.adopted = true;
        setState((s) => ({ ...s, error: `Falha ao carregar configuração ${label}.` }));
      }
    } finally {
      if (current()) setState((s) => ({ ...s, loading: false }));
    }
  }, [enabled, scope, getFn, args, parser, label]);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const save = useCallback(async (payload: T) => {
    const owner = operations.current;
    const valid = capture();
    if (!enabled || !canWrite || !valid() || owner.scope !== scope || !owner.adopted || owner.save) return { ok: false as const };
    // Synchronous ownership blocks double-clicks before React renders saving=true.
    const ticket = Symbol("rtc-save");
    owner.save = ticket;
    ++owner.sequence; // Retire all reads started before this write, even on conflict.
    const current = () => valid() && operations.current === owner && owner.save === ticket;
    setState((s) => ({ ...s, loading: false, saving: true, error: null }));
    try {
      if (rtcHasSensitiveKey(payload)) {
        setState((s) => ({ ...s, error: "Payload contém chaves sensíveis proibidas." }));
        return { ok: false as const };
      }
      const parsed = parser(payload);
      if (!parsed.success) {
        setState((s) => ({ ...s, error: `Payload ${label} inválido.` }));
        return { ok: false as const };
      }
      const { data, error } = await rpc<unknown>(saveFn, {
        ...args, payload: parsed.data, expected_revision: owner.revision || null,
      });
      if (!current()) return { ok: false as const };
      if (error) {
        setState((s) => ({ ...s, error: toMessage(error.message, `Falha ao salvar ${label}.`, error.code) }));
        return { ok: false as const };
      }
      const env = parseEnvelope<T>(data, parser);
      if (!env) {
        setState((s) => ({ ...s, error: "Resposta inválida do servidor após salvar." }));
        return { ok: false as const };
      }
      owner.revision = env.revision;
      setState({ data: env.configuration, revision: env.revision, loading: false, saving: true, error: null });
      return { ok: true as const };
    } catch {
      if (current()) setState((s) => ({ ...s, error: `Falha ao salvar ${label}.` }));
      return { ok: false as const };
    } finally {
      // Release only this operation; never unlock or update a replacement scope.
      if (owner.save === ticket) {
        if (current()) setState((s) => ({ ...s, saving: false }));
        owner.save = null;
      }
    }
  }, [enabled, canWrite, scope, saveFn, args, parser, label]);

  const current = enabled && operations.current.adopted;
  return { ...state, data: current ? state.data : null, revision: current ? state.revision : "", error: current ? state.error : null, loading: enabled && state.loading, saving: current && state.saving, reload: load, save };
}

const parseCompany = (v: unknown) => rtcCompanySchema.safeParse(v);
const parseItem = (v: unknown) => ibsCbsItemSchema.safeParse(v);

export function useFiscalRtcCompany(options: { enabled?: boolean } = {}) {
  const fence = useStorageAccessScope("company-rtc");
  return useRtcOperations<RtcCompanyConfiguration>({
    scope: fence.scope, enabled: (options.enabled ?? true) && fence.ready,
    canWrite: fence.ready, capture: fence.capture,
    getFn: "rpc_fiscal_company_rtc_get", saveFn: "rpc_fiscal_company_rtc_save",
    parser: parseCompany, label: "RTC",
  });
}

/**
 * Kinds aceitos pelo hook de item:
 *  - "product"          → RPC por p_product_id (product_fiscal_profiles);
 *  - "service"          → RPC por p_service_id (service_fiscal_profiles),
 *                          mantida por retrocompatibilidade;
 *  - "service_profile"  → RPC por p_profile_id (identidade estável do
 *                          perfil de serviço; funciona quando service_id
 *                          é nulo e o perfil identifica-se por
 *                          source_reference — Bloco 5).
 */
export type FiscalRtcItemKind = "product" | "service" | "service_profile" | "microorganism";

export function useFiscalRtcItem(
  kind: FiscalRtcItemKind,
  itemId: string | null,
  options: { enabled?: boolean } = {},
) {
  const fence = useProductFiscalAccess(`product-rtc:${kind}:${itemId}`);
  const getFn = kind === "product" ? "rpc_fiscal_product_ibs_cbs_get"
    : kind === "microorganism" ? "rpc_fiscal_microorganism_ibs_cbs_get"
    : kind === "service" ? "rpc_fiscal_service_ibs_cbs_get" : "rpc_fiscal_service_profile_ibs_cbs_get";
  const saveFn = kind === "product" ? "rpc_fiscal_product_ibs_cbs_save"
    : kind === "microorganism" ? "rpc_fiscal_microorganism_ibs_cbs_save"
    : kind === "service" ? "rpc_fiscal_service_ibs_cbs_save" : "rpc_fiscal_service_profile_ibs_cbs_save";
  const idKey: "p_product_id" | "p_service_id" | "p_profile_id" | "p_microorganism_id" = kind === "product" ? "p_product_id" : kind === "microorganism" ? "p_microorganism_id" : kind === "service" ? "p_service_id" : "p_profile_id";
  const args = useMemo(() => ({ [idKey]: itemId }), [idKey, itemId]);
  return useRtcOperations<IbsCbsItemConfiguration>({
    scope: fence.scope, enabled: (options.enabled ?? true) && !!itemId && fence.ready,
    canWrite: fence.canWrite, capture: fence.capture,
    getFn, saveFn,
    args, parser: parseItem, label: "IBS/CBS",
  });
}

export { emptyCompany as _emptyCompanyRtc };
