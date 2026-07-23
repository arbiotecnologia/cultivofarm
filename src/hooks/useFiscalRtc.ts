/**
 * Fase Fiscal 3.19.2 — Hook para RTC/IBS-CBS.
 * Lê/escreve via RPCs `rpc_fiscal_*_rtc_*` / `rpc_fiscal_*_ibs_cbs_*`.
 * Roles: leitura = admin/gestor/financeiro; escrita empresa = admin;
 * escrita item = admin/financeiro. Erros de conflito/permissão são
 * expostos como `code` estável ao consumidor (pt-BR).
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

export type RtcHookState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
};

const emptyCompany = (): RtcCompanyConfiguration => ({
  schema_version: 1,
  rtc_environment: "NOT_CONFIGURED",
});

function toMessage(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/permission_denied/i.test(raw)) return "Você não tem permissão para essa operação.";
  if (/unauthenticated/i.test(raw)) return "Sessão expirada. Entre novamente.";
  if (/production_enabled/i.test(raw)) return "Campo bloqueado: production_enabled não pode ser enviado.";
  if (/sensíveis|sensitive/i.test(raw)) return "Payload contém chaves sensíveis proibidas.";
  if (/22023/.test(raw)) return "Formato do payload inválido.";
  return fallback;
}

export function useFiscalRtcCompany(options: { enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const [state, setState] = useState<RtcHookState<RtcCompanyConfiguration>>({
    data: null, loading: enabled, error: null, saving: false,
  });

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await (supabase as any).rpc("rpc_fiscal_company_rtc_get");
    if (error) {
      setState({ data: null, loading: false, saving: false,
        error: toMessage(error, "Falha ao carregar configuração RTC.") });
      return;
    }
    const parsed = data && Object.keys(data).length > 0
      ? rtcCompanySchema.safeParse(data)
      : { success: true as const, data: emptyCompany() };
    setState({
      data: parsed.success ? parsed.data : emptyCompany(),
      loading: false, saving: false,
      error: parsed.success ? null : "Configuração RTC inválida no servidor.",
    });
  }, []);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const save = useCallback(async (payload: RtcCompanyConfiguration) => {
    setState((s) => ({ ...s, saving: true, error: null }));
    if (rtcHasSensitiveKey(payload)) {
      setState((s) => ({ ...s, saving: false, error: "Payload contém chaves sensíveis proibidas." }));
      return { ok: false as const };
    }
    const parsed = rtcCompanySchema.safeParse(payload);
    if (!parsed.success) {
      setState((s) => ({ ...s, saving: false, error: "Payload RTC inválido." }));
      return { ok: false as const };
    }
    const { data, error } = await (supabase as any).rpc("rpc_fiscal_company_rtc_save", { payload: parsed.data });
    if (error) {
      setState((s) => ({ ...s, saving: false, error: toMessage(error, "Falha ao salvar RTC.") }));
      return { ok: false as const };
    }
    setState({ data: (data as RtcCompanyConfiguration) ?? parsed.data, loading: false, saving: false, error: null });
    return { ok: true as const };
  }, []);

  return { ...state, reload: load, save };
}

export function useFiscalRtcItem(
  kind: "product" | "service",
  itemId: string | null,
  options: { enabled?: boolean } = {},
) {
  const enabled = (options.enabled ?? true) && !!itemId;
  const [state, setState] = useState<RtcHookState<IbsCbsItemConfiguration>>({
    data: null, loading: enabled, error: null, saving: false,
  });

  const getFn = kind === "product" ? "rpc_fiscal_product_ibs_cbs_get" : "rpc_fiscal_service_ibs_cbs_get";
  const saveFn = kind === "product" ? "rpc_fiscal_product_ibs_cbs_save" : "rpc_fiscal_service_ibs_cbs_save";
  const idKey = kind === "product" ? "p_product_id" : "p_service_id";

  const load = useCallback(async () => {
    if (!itemId) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await (supabase as any).rpc(getFn, { [idKey]: itemId });
    if (error) {
      setState({ data: null, loading: false, saving: false,
        error: toMessage(error, "Falha ao carregar IBS/CBS.") });
      return;
    }
    const parsed = data && Object.keys(data).length > 0
      ? ibsCbsItemSchema.safeParse(data)
      : { success: true as const, data: { schema_version: 1 } as IbsCbsItemConfiguration };
    setState({
      data: parsed.success ? parsed.data : ({ schema_version: 1 } as IbsCbsItemConfiguration),
      loading: false, saving: false,
      error: parsed.success ? null : "Configuração IBS/CBS inválida no servidor.",
    });
  }, [itemId, getFn, idKey]);

  useEffect(() => { if (enabled) void load(); }, [enabled, load]);

  const save = useCallback(async (payload: IbsCbsItemConfiguration) => {
    if (!itemId) return { ok: false as const };
    setState((s) => ({ ...s, saving: true, error: null }));
    if (rtcHasSensitiveKey(payload)) {
      setState((s) => ({ ...s, saving: false, error: "Payload contém chaves sensíveis proibidas." }));
      return { ok: false as const };
    }
    const parsed = ibsCbsItemSchema.safeParse(payload);
    if (!parsed.success) {
      setState((s) => ({ ...s, saving: false, error: "Payload IBS/CBS inválido." }));
      return { ok: false as const };
    }
    const { data, error } = await (supabase as any).rpc(saveFn, { [idKey]: itemId, payload: parsed.data });
    if (error) {
      setState((s) => ({ ...s, saving: false, error: toMessage(error, "Falha ao salvar IBS/CBS.") }));
      return { ok: false as const };
    }
    setState({ data: (data as IbsCbsItemConfiguration) ?? parsed.data, loading: false, saving: false, error: null });
    return { ok: true as const };
  }, [itemId, saveFn, idKey]);

  return { ...state, reload: load, save };
}
