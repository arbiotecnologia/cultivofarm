/**
 * Formulário do complemento DPS NFS-e Nacional no perfil fiscal do serviço.
 * Persistido em federal_withholding_defaults.nfse_dps (coluna existente).
 * Campos vazios ficam ausentes — nenhum valor padrão é presumido.
 */
import {
  compactNfseDpsProfile, validateNfseDpsProfile, type NfseDpsProfile, type TotTribMode,
} from "../../../supabase/functions/_shared/nfse/dpsProfile";

export { PIS_COFINS_CST, PIS_COFINS_RET_TYPES } from "../../../supabase/functions/_shared/nfse/dpsProfile";

export interface NfseDpsForm {
  nbs_code: string; service_location_ibge_code: string;
  pis_cofins_cst: string; p_aliq_pis: string; p_aliq_cofins: string; pis_cofins_ret_type: string;
  cp_rate: string; irrf_rate: string; csll_rate: string;
  tot_mode: "" | TotTribMode; tot_fed: string; tot_est: string; tot_mun: string; tot_sn: string;
}

const s = (v: unknown) => (v === undefined || v === null ? "" : String(v));

export function dpsFormFromRow(fwd: unknown): NfseDpsForm {
  const p = (fwd && typeof fwd === "object" ? (fwd as Record<string, unknown>).nfse_dps : null) as Partial<NfseDpsProfile> | null;
  return {
    nbs_code: s(p?.nbs_code), service_location_ibge_code: s(p?.service_location_ibge_code),
    pis_cofins_cst: s(p?.pis_cofins?.cst), p_aliq_pis: s(p?.pis_cofins?.p_aliq_pis), p_aliq_cofins: s(p?.pis_cofins?.p_aliq_cofins), pis_cofins_ret_type: s(p?.pis_cofins?.ret_type),
    cp_rate: s(p?.federal_retentions?.cp_rate), irrf_rate: s(p?.federal_retentions?.irrf_rate), csll_rate: s(p?.federal_retentions?.csll_rate),
    tot_mode: (p?.tot_trib?.mode ?? "") as NfseDpsForm["tot_mode"], tot_fed: s(p?.tot_trib?.fed), tot_est: s(p?.tot_trib?.est), tot_mun: s(p?.tot_trib?.mun), tot_sn: s(p?.tot_trib?.sn),
  };
}

const n = (v: string): number | undefined => {
  const t = v.trim().replace(",", "."); if (t === "") return undefined;
  const x = Number(t); return Number.isFinite(x) ? x : NaN;
};
const d = (v: string) => v.replace(/\D/g, "");

export const DPS_FORM_ERROR_LABEL: Record<string, string> = {
  nbs: "NBS deve ter 9 dígitos.", local_prestacao: "Local da prestação: código IBGE de 7 dígitos.",
  pis_cofins: "PIS/COFINS: informe o CST quando preencher alíquotas ou retenção.", pis_cofins_cst: "CST PIS/COFINS inválido.",
  pis_cofins_aliquota: "Alíquotas PIS/COFINS entre 0 e 99,99 com até 2 casas.", pis_cofins_aliquota_par: "Informe as duas alíquotas (PIS e COFINS) ou nenhuma.",
  pis_cofins_retencao: "Tipo de retenção PIS/COFINS inválido.", retencoes_federais: "Retenções federais entre 0 e 100 com até 2 casas.",
  total_tributos: "Total de tributos: escolha a forma de informação.", total_tributos_percentual: "Informe os três percentuais (federal, estadual, municipal).",
  total_tributos_sn: "Informe o percentual do Simples Nacional.", total_tributos_ind: "Modo sem informação não aceita percentuais.",
  formato: "Complemento inválido.", chave_desconhecida: "Complemento inválido.", versao: "Complemento inválido.",
};

/** Converte o formulário; devolve o perfil compacto (ou null) e erros. */
export function dpsFormToProfile(f: NfseDpsForm): { profile: NfseDpsProfile | null; errors: string[] } {
  const hasPc = f.p_aliq_pis.trim() || f.p_aliq_cofins.trim() || f.pis_cofins_ret_type;
  if (hasPc && !f.pis_cofins_cst) return { profile: null, errors: ["pis_cofins"] };
  const profile = compactNfseDpsProfile({
    nbs_code: d(f.nbs_code) || undefined,
    service_location_ibge_code: d(f.service_location_ibge_code) || undefined,
    pis_cofins: f.pis_cofins_cst ? { cst: f.pis_cofins_cst, p_aliq_pis: n(f.p_aliq_pis), p_aliq_cofins: n(f.p_aliq_cofins), ret_type: f.pis_cofins_ret_type || undefined } : undefined,
    federal_retentions: { cp_rate: n(f.cp_rate), irrf_rate: n(f.irrf_rate), csll_rate: n(f.csll_rate) },
    tot_trib: f.tot_mode === "" ? undefined
      : f.tot_mode === "PERCENT" ? { mode: "PERCENT", fed: n(f.tot_fed), est: n(f.tot_est), mun: n(f.tot_mun) }
      : f.tot_mode === "SN" ? { mode: "SN", sn: n(f.tot_sn) } : { mode: "IND" },
  });
  const errors = validateNfseDpsProfile(profile ?? undefined);
  return { profile: errors.length ? null : profile, errors };
}

/** Mescla no jsonb existente preservando outras chaves; null remove o complemento. */
export function mergeFederalDefaults(current: unknown, dps: NfseDpsProfile | null): Record<string, unknown> | null {
  const base = current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
  if (dps) base.nfse_dps = dps; else delete base.nfse_dps;
  return Object.keys(base).length ? base : null;
}
