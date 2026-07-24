/**
 * Fase Fiscal 3.21 — Resolver PURO de item fiscal com origem MICROORGANISM.
 *
 * Contrato:
 *   - Recebe um `microorganismId` e um `loader` que devolve o perfil ativo
 *     de `microorganism_fiscal_profiles` para aquele microrganismo (ou
 *     `null`). O resolver é livre de I/O; o loader concentra o acesso.
 *   - NUNCA consulta `product_fiscal_profiles`, nem usa
 *     `microrganismos.product_id` como fallback fiscal. Se o microrganismo
 *     estiver vinculado a um produto, isso é irrelevante para o snapshot
 *     fiscal produzido aqui.
 *   - Retorna um snapshot fiscal COMPLETO e AUDITÁVEL do próprio
 *     microrganismo, pronto para virar `fiscal_invoice_items`.
 *   - Erros amigáveis, não `throw`. Chamador decide como propagar.
 *   - Nenhuma emissão real: este módulo apenas monta o item; a barreira
 *     de transmissão continua no `preflight`.
 */

import { SOURCE_ITEM_TYPE, type SourceItemType } from "./sourceItemTypes.ts";

export interface MicroorganismFiscalProfileLike {
  id: string;
  microorganism_id: string;
  is_active: boolean;
  fiscal_description: string | null;
  commercial_unit: string | null;
  taxable_unit: string | null;
  ncm: string | null;
  cest: string | null;
  origin_code: string | null;
  cfop_in_state: string | null;
  cfop_interstate: string | null;
  icms_cst: string | null;
  icms_csosn: string | null;
  ipi_cst: string | null;
  pis_cst: string | null;
  cofins_cst: string | null;
  gtin: string | null;
  taxable_gtin: string | null;
  tax_benefit_code: string | null;
  profile_status: string;
}

export type MicroorganismProfileLoader = (
  microorganismId: string,
) => Promise<MicroorganismFiscalProfileLike | null>;

export type ResolveMicroorganismErrorCode =
  | "microorganism_profile_missing"
  | "microorganism_not_minimally_classified"
  | "microorganism_profile_inactive";

export interface ResolveMicroorganismSuccess {
  ok: true;
  item: {
    source_item_type: Extract<SourceItemType, "MICROORGANISM">;
    source_item_id: string;
    item_kind: "MERCHANDISE";
    /** Snapshot vindo EXCLUSIVAMENTE do perfil próprio do microrganismo. */
    fiscal_snapshot: {
      profile_id: string;
      fiscal_description: string | null;
      commercial_unit: string | null;
      taxable_unit: string | null;
      ncm: string | null;
      cest: string | null;
      origin_code: string | null;
      cfop_in_state: string | null;
      cfop_interstate: string | null;
      icms_cst: string | null;
      icms_csosn: string | null;
      ipi_cst: string | null;
      pis_cst: string | null;
      cofins_cst: string | null;
      gtin: string | null;
      taxable_gtin: string | null;
      tax_benefit_code: string | null;
      profile_status: string;
    };
  };
}

export interface ResolveMicroorganismFailure {
  ok: false;
  code: ResolveMicroorganismErrorCode;
  message: string;
}

export type ResolveMicroorganismResult =
  | ResolveMicroorganismSuccess
  | ResolveMicroorganismFailure;

/** NCM + CFOP interno = mínimo classificatório (mesma regra da view). */
function isMinimallyClassified(p: MicroorganismFiscalProfileLike): boolean {
  return !!(p.ncm && p.cfop_in_state);
}

/**
 * Resolve um item fiscal MICROORGANISM. Puro: só depende do loader.
 * Produto vinculado (composição comercial) NUNCA é usado como fallback.
 */
export async function resolveFiscalItemFromMicroorganism(
  microorganismId: string,
  loader: MicroorganismProfileLoader,
): Promise<ResolveMicroorganismResult> {
  const profile = await loader(microorganismId);
  if (!profile) {
    return {
      ok: false,
      code: "microorganism_profile_missing",
      message:
        "Perfil fiscal do microrganismo não cadastrado. Cadastre o perfil próprio antes de faturar diretamente.",
    };
  }
  if (!profile.is_active) {
    return {
      ok: false,
      code: "microorganism_profile_inactive",
      message: "Perfil fiscal do microrganismo está inativo.",
    };
  }
  if (!isMinimallyClassified(profile)) {
    return {
      ok: false,
      code: "microorganism_not_minimally_classified",
      message:
        "Microrganismo não está minimamente classificado (NCM e CFOP interno são obrigatórios).",
    };
  }
  return {
    ok: true,
    item: {
      source_item_type: SOURCE_ITEM_TYPE.MICROORGANISM,
      source_item_id: microorganismId,
      item_kind: "MERCHANDISE",
      fiscal_snapshot: {
        profile_id: profile.id,
        fiscal_description: profile.fiscal_description,
        commercial_unit: profile.commercial_unit,
        taxable_unit: profile.taxable_unit,
        ncm: profile.ncm,
        cest: profile.cest,
        origin_code: profile.origin_code,
        cfop_in_state: profile.cfop_in_state,
        cfop_interstate: profile.cfop_interstate,
        icms_cst: profile.icms_cst,
        icms_csosn: profile.icms_csosn,
        ipi_cst: profile.ipi_cst,
        pis_cst: profile.pis_cst,
        cofins_cst: profile.cofins_cst,
        gtin: profile.gtin,
        taxable_gtin: profile.taxable_gtin,
        tax_benefit_code: profile.tax_benefit_code,
        profile_status: profile.profile_status,
      },
    },
  };
}
