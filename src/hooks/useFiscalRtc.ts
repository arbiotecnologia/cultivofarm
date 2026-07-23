/**
 * Fase Fiscal 3.19.3 — Hook RTC/IBS-CBS (tipado, com revisão otimista).
 * RPCs: `rpc_fiscal_*_rtc_*` / `rpc_fiscal_*_ibs_cbs_*`.
 * Roles: leitura admin/gestor/financeiro; escrita empresa=admin;
 * escrita item=admin/financeiro. Códigos de erro: FISCAL_CONFLICT,
 * FISCAL_FORBIDDEN, FISCAL_UNAUTHENTICATED, FISCAL_RTC_*.
 */
import { useCallback, useEffect, useState } from "react";
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
type RpcResponse<T> = { data: T | null; error: { message: string } | null };
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

function toMessage(raw: string, fallback: string): string {
  if (/FISCAL_CONFLICT/.test(raw))
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

export function useFiscalRtcCompany(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<RtcHookState<RtcCompanyConfiguration>>({
    data: null, revision: "", loading: enabled, error: null, saving: false,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await rpc<unknown>("rpc_fiscal_company_rtc_get");
    if (error) {
      setState({ data: null, revision: "", loading: false, saving: false,
        error: toMessage(error.message, "Falha ao carregar configuração RTC.") });
      return;
    }
    const env = parseEnvelope<RtcCompanyConfiguration>(
      data, (v) => rtcCompanySchema.safeParse(v));
    if (!env) {
      setState({ data: null, revision: "", loading: false, saving: false,
        error: "Resposta inválida do servidor (RTC indisponível)." });
      return;
    }
    setState({ data: env.configuration, revision: env.revision,
      loading: false, saving: false, error: null });
  }, []);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const save = useCallback(async (payload: RtcCompanyConfiguration) => {
    setState((s) => ({ ...s, saving: true, error: null }));
    if (rtcHasSensitiveKey(payload)) {
      setState((s) => ({ ...s, saving: false,
        error: "Payload contém chaves sensíveis proibidas." }));
      return { ok: false as const };
    }
    const parsed = rtcCompanySchema.safeParse(payload);
    if (!parsed.success) {
      setState((s) => ({ ...s, saving: false, error: "Payload RTC inválido." }));
      return { ok: false as const };
    }
    const { data, error } = await rpc<unknown>(
      "rpc_fiscal_company_rtc_save",
      { payload: parsed.data, expected_revision: state.revision || null },
    );
    if (error) {
      setState((s) => ({ ...s, saving: false,
        error: toMessage(error.message, "Falha ao salvar RTC.") }));
      return { ok: false as const };
    }
    const env = parseEnvelope<RtcCompanyConfiguration>(
      data, (v) => rtcCompanySchema.safeParse(v));
    if (!env) {
      setState((s) => ({ ...s, saving: false,
        error: "Resposta inválida do servidor após salvar." }));
      return { ok: false as const };
    }
    setState({ data: env.configuration, revision: env.revision,
      loading: false, saving: false, error: null });
    return { ok: true as const };
  }, [state.revision]);

  return { ...state, reload: load, save };
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
export type FiscalRtcItemKind = "product" | "service" | "service_profile";

export function useFiscalRtcItem(
  kind: FiscalRtcItemKind,
  itemId: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && !!itemId;
  const [state, setState] = useState<RtcHookState<IbsCbsItemConfiguration>>({
    data: null, revision: "", loading: enabled, error: null, saving: false,
  });

  const getFn =
    kind === "product" ? "rpc_fiscal_product_ibs_cbs_get"
    : kind === "service" ? "rpc_fiscal_service_ibs_cbs_get"
    : "rpc_fiscal_service_profile_ibs_cbs_get";
  const saveFn =
    kind === "product" ? "rpc_fiscal_product_ibs_cbs_save"
    : kind === "service" ? "rpc_fiscal_service_ibs_cbs_save"
    : "rpc_fiscal_service_profile_ibs_cbs_save";
  const idKey: "p_product_id" | "p_service_id" | "p_profile_id" =
    kind === "product" ? "p_product_id"
    : kind === "service" ? "p_service_id"
    : "p_profile_id";

  const load = useCallback(async () => {
    if (!itemId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await rpc<unknown>(getFn, { [idKey]: itemId });
    if (error) {
      setState({ data: null, revision: "", loading: false, saving: false,
        error: toMessage(error.message, "Falha ao carregar IBS/CBS.") });
      return;
    }
    const env = parseEnvelope<IbsCbsItemConfiguration>(
      data, (v) => ibsCbsItemSchema.safeParse(v));
    if (!env) {
      setState({ data: null, revision: "", loading: false, saving: false,
        error: "Resposta inválida do servidor (IBS/CBS indisponível)." });
      return;
    }
    setState({ data: env.configuration, revision: env.revision,
      loading: false, saving: false, error: null });
  }, [itemId, getFn, idKey]);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const save = useCallback(async (payload: IbsCbsItemConfiguration) => {
    if (!itemId) return { ok: false as const };
    setState((s) => ({ ...s, saving: true, error: null }));
    if (rtcHasSensitiveKey(payload)) {
      setState((s) => ({ ...s, saving: false,
        error: "Payload contém chaves sensíveis proibidas." }));
      return { ok: false as const };
    }
    const parsed = ibsCbsItemSchema.safeParse(payload);
    if (!parsed.success) {
      setState((s) => ({ ...s, saving: false, error: "Payload IBS/CBS inválido." }));
      return { ok: false as const };
    }
    const { data, error } = await rpc<unknown>(saveFn, {
      [idKey]: itemId, payload: parsed.data,
      expected_revision: state.revision || null,
    });
    if (error) {
      setState((s) => ({ ...s, saving: false,
        error: toMessage(error.message, "Falha ao salvar IBS/CBS.") }));
      return { ok: false as const };
    }
    const env = parseEnvelope<IbsCbsItemConfiguration>(
      data, (v) => ibsCbsItemSchema.safeParse(v));
    if (!env) {
      setState((s) => ({ ...s, saving: false,
        error: "Resposta inválida do servidor após salvar." }));
      return { ok: false as const };
    }
    setState({ data: env.configuration, revision: env.revision,
      loading: false, saving: false, error: null });
    return { ok: true as const };
  }, [itemId, saveFn, idKey, state.revision]);

  return { ...state, reload: load, save };
}

export { emptyCompany as _emptyCompanyRtc };
