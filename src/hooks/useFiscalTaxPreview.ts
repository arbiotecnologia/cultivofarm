/**
 * Fase Fiscal 3.4 — Pré-visualização tributária server-side.
 *
 * O frontend NUNCA calcula base, alíquota ou valor de tributo. Este hook
 * apenas envia as ENTRADAS do operador (quantidade, preço, encargos e o
 * percentual de redução quando a regra permite) e exibe o que o motor
 * canônico devolve — o mesmo que gravará snapshots e XML.
 */
import { useQuery } from "@tanstack/react-query";
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args: any) => any;

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
      const { data, error } = await rpc("rpc_fiscal_tax_preview_v1", {
        p_invoice_id: invoiceId,
        p_items: items,
      });
      if (error) throw new Error(traduzirErroFiscal(error.message));
      if (!data || typeof data !== "object" || !Array.isArray((data as FiscalTaxPreviewResult).items)) {
        throw new Error("Resposta inválida do cálculo tributário.");
      }
      return data as FiscalTaxPreviewResult;
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
  return "Não foi possível calcular os tributos agora.";
}
