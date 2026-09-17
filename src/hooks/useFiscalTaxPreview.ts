/**
 * Fase Fiscal 3.4 — Pré-visualização tributária server-side.
 *
 * O frontend NUNCA calcula base, alíquota ou valor de tributo. Este hook
 * apenas envia as ENTRADAS do operador (quantidade, preço, encargos e o
 * percentual de redução quando a regra permite) e exibe o que o motor
 * canônico devolve — o mesmo que gravará snapshots e XML.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FiscalTaxPreviewTax {
  taxKind?: string;
  cst?: string | null;
  csosn?: string | null;
  rate?: number | null;
  base?: number | null;
  baseOriginal?: number | null;
  baseReductionPct?: number | null;
  baseReductionMode?: "NONE" | "FIXED" | "MANUAL" | string | null;
  baseReductionSource?: "NONE" | "FIXED" | "MANUAL" | string | null;
  value?: number | null;
  ruleKey?: string | null;
  ruleVersion?: number | null;
  legalBasis?: string | null;
}

export interface FiscalTaxPreviewItem {
  itemSequence: number;
  description: string | null;
  taxes: Record<string, FiscalTaxPreviewTax>;
}

export interface FiscalTaxPreviewResult {
  engineVersion: string;
  preview: boolean;
  persisted: boolean;
  items: FiscalTaxPreviewItem[];
}

export interface FiscalTaxPreviewItemInput {
  item_sequence: number;
  gross_value?: number;
  discount_value?: number;
  freight_value?: number;
  insurance_value?: number;
  other_value?: number;
  tax_input_snapshot?: Record<string, { baseReductionPct: number }>;
}

export function useFiscalTaxPreview(
  invoiceId: string | null,
  items: FiscalTaxPreviewItemInput[],
  enabled = true,
) {
  return useQuery({
    queryKey: ["fiscal", "tax-preview", invoiceId, items],
    enabled: Boolean(invoiceId) && enabled && items.length > 0,
    retry: false,
    queryFn: async (): Promise<FiscalTaxPreviewResult> => {
      const { data, error } = await supabase.rpc("rpc_fiscal_tax_preview_v1", {
        p_invoice_id: invoiceId as string,
        p_items: items as unknown as never,
      });
      if (error) throw new Error(traduzirErroFiscal(error.message));
      if (!data || typeof data !== "object" || !Array.isArray((data as unknown as FiscalTaxPreviewResult).items)) {
        throw new Error("Resposta inválida do cálculo tributário.");
      }
      return data as unknown as FiscalTaxPreviewResult;
    },
  });
}

export interface FiscalServiceTaxPreviewItem {
  itemSequence: number;
  base: number;
  taxes: {
    ISS?: FiscalTaxPreviewTax & { withheld?: boolean; lc116Item?: string | null };
    FEDERAL_WITHHOLDING?: Record<
      string,
      { base: number; rate: number; value: number; withheld: boolean }
    >;
  };
}

export interface FiscalServiceTaxPreviewResult {
  engineVersion: string;
  documentModel: "NFSE";
  itemCount: number;
  vServ: number;
  vDesc: number;
  vBC: number;
  vISS: number;
  vISSRetido: number;
  vRetFederais: number;
  vLiq: number;
  ibsCbsApplied: false;
  ibsCbsGate: string;
  nationalTransmissionSupported: false;
  items: FiscalServiceTaxPreviewItem[];
  persisted: boolean;
  idempotentReplay: boolean;
}

async function calculateServiceInvoice(
  invoiceId: string,
  persist: boolean,
): Promise<FiscalServiceTaxPreviewResult> {
  const idempotencyKey = persist
    ? `nfse-calculate:${invoiceId}:${crypto.randomUUID()}`
    : `nfse-preview:${invoiceId}`;
  const { data, error } = await (supabase.rpc.bind(supabase) as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(
    "rpc_fiscal_calculate_service_invoice_v1",
    {
      p_invoice_id: invoiceId,
      p_idempotency_key: idempotencyKey,
      p_persist: persist,
    },
  );
  if (error) throw new Error(traduzirErroFiscal(error.message));
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Resposta inválida do cálculo de serviços.");
  }
  const result = data as Partial<FiscalServiceTaxPreviewResult>;
  if (result.documentModel !== "NFSE" || !Array.isArray(result.items)) {
    throw new Error("Resposta inválida do cálculo de serviços.");
  }
  return result as FiscalServiceTaxPreviewResult;
}

/** Prévia NFS-e usa exclusivamente o caminho server-side próprio de serviços. */
export function useFiscalServiceTaxPreview(invoiceId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["fiscal", "service-tax-preview", invoiceId ?? "none"],
    enabled: Boolean(invoiceId) && enabled,
    retry: false,
    queryFn: () => calculateServiceInvoice(invoiceId as string, false),
  });
}

/** Materializa snapshots e totais NFS-e; não gera DPS nem transmite documento. */
export function useCalculateFiscalServiceInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (invoiceId: string) => calculateServiceInvoice(invoiceId, true),
    onSuccess: (_data, invoiceId) => {
      qc.invalidateQueries({ queryKey: ["fiscal", "service-tax-preview", invoiceId] });
      qc.invalidateQueries({ queryKey: ["fiscal", "documents"] });
    },
  });
}

/** Converte erros técnicos do motor em texto compreensível, sem SQL cru. */
export function traduzirErroFiscal(message: string | null | undefined): string {
  const m = String(message ?? "");
  if (m.includes("FISCAL_BASE_REDUCTION_OUT_OF_RANGE")) {
    return "A redução da base de cálculo deve ficar entre 0% e 100%.";
  }
  if (m.includes("FISCAL_BASE_REDUCTION_INPUT_REQUIRED")) {
    return "Informe a redução da base de cálculo exigida pela regra fiscal.";
  }
  if (m.includes("FISCAL_BASE_REDUCTION_NOT_EDITABLE")) {
    return "A regra fiscal define uma redução fixa; o percentual não pode ser alterado.";
  }
  if (m.includes("FISCAL_BASE_REDUCTION_NOT_ALLOWED")) {
    return "A regra fiscal aplicável não admite redução da base de cálculo.";
  }
  if (m.includes("tax_input_snapshot_invalid")) {
    return "Dados de redução inválidos para um dos itens.";
  }
  if (m.includes("FISCAL_INVOICE_NOT_DRAFT")) {
    return "A simulação está disponível apenas enquanto o documento é rascunho.";
  }
  if (m.includes("FISCAL_INVOICE_NOT_FOUND")) {
    return "Salve o rascunho antes de simular os tributos.";
  }
  if (m.includes("FISCAL_RECIPIENT_PROFILE_MISSING")) {
    return "Cadastre o perfil fiscal do destinatário para calcular os tributos.";
  }
  if (m.includes("FISCAL_EMITTER_NOT_CONFIGURED")) {
    return "Configure os dados fiscais da empresa emitente.";
  }
  if (m.includes("FISCAL_PRODUCTION_BLOCKED")) {
    return "Ambiente de produção bloqueado: use homologação.";
  }
  if (m.includes("FISCAL_FORBIDDEN") || m.includes("unauthenticated")) {
    return "Seu perfil não tem permissão para simular tributos.";
  }
  if (m.includes("FISCAL_RULE_NOT_FOUND") || m.includes("no_rule")) {
    return "Não há regra fiscal publicada para esta operação.";
  }
  if (m.includes("FISCAL_SERVICE_PROFILE_MISSING")) {
    return "Cadastre o perfil fiscal do serviço antes de calcular a NFS-e.";
  }
  if (m.includes("FISCAL_SERVICE_PROFILE_NOT_VALIDATED")) {
    return "Valide o perfil fiscal do serviço antes de calcular a NFS-e.";
  }
  if (m.includes("FISCAL_SERVICE_LC116_MISSING")) {
    return "Informe o enquadramento LC 116 do serviço.";
  }
  if (m.includes("FISCAL_SERVICE_ISS_RATE_INVALID")) {
    return "Informe uma alíquota de ISS válida no perfil do serviço.";
  }
  if (m.includes("FISCAL_SERVICE_WITHHOLDING_INVALID")) {
    return "Revise as retenções federais configuradas no perfil do serviço.";
  }
  if (m.includes("FISCAL_RTC_LAYOUT_UNVALIDATED")) {
    return "IBS/CBS está bloqueado porque o leiaute fiscal aplicável ainda não foi validado.";
  }
  return "Não foi possível calcular os tributos agora.";
}
