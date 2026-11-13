/**
 * Campos complementares IBS/CBS do item guardados em additional_fields
 * (aceitos pelo servidor): effective_to, indDest, indFinal e ibs_destino[UF].
 * As pendências usam as mesmas regras do gerador (supabase/functions/_shared/fiscal/rtc/ibsCbs.ts).
 */
import type { IbsCbsItemConfiguration } from "@/lib/fiscal/rtcConfiguration";
import { resolveIbsCbs } from "../../../supabase/functions/_shared/fiscal/rtc/ibsCbs";

export type IbsCbsExtraKey = "effective_to" | "indDest" | "indFinal";
export type DestRate = { uf?: number; mun?: number };

const af = (c: IbsCbsItemConfiguration): Record<string, unknown> =>
  c.additional_fields && typeof c.additional_fields === "object" ? { ...(c.additional_fields as Record<string, unknown>) } : {};

export function getExtra(c: IbsCbsItemConfiguration, k: IbsCbsExtraKey): string {
  const v = af(c)[k];
  return typeof v === "string" ? v : "";
}
export function setExtra(c: IbsCbsItemConfiguration, k: IbsCbsExtraKey, v: string): IbsCbsItemConfiguration {
  const next = af(c);
  if (v) next[k] = v; else delete next[k];
  return { ...c, additional_fields: Object.keys(next).length ? next : undefined };
}
export function getDestRates(c: IbsCbsItemConfiguration): Record<string, DestRate> {
  const m = af(c).ibs_destino;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, DestRate>) : {};
}
export function setDestRates(c: IbsCbsItemConfiguration, m: Record<string, DestRate>): IbsCbsItemConfiguration {
  const next = af(c);
  const clean = Object.fromEntries(Object.entries(m).filter(([uf]) => /^[A-Z]{2}$/.test(uf)));
  if (Object.keys(clean).length) next.ibs_destino = clean; else delete next.ibs_destino;
  return { ...c, additional_fields: Object.keys(next).length ? next : undefined };
}

const LABELS: Record<string, string> = {
  ibs_cbs_ausente: "Configuração IBS/CBS não preenchida.",
  ibs_cbs_cst: "CST IBS/CBS precisa ter 3 dígitos.",
  ibs_cbs_cclasstrib: "cClassTrib precisa ter 6 dígitos.",
  ibs_cbs_cst_cclasstrib_divergente: "cClassTrib não pertence ao CST informado (3 primeiros dígitos).",
  ibs_cbs_cst_nao_suportado: "CST ainda sem grupo XML homologado (suportados: 000 e 410).",
  ibs_cbs_vigencia_inicio: "Informe a vigência inicial.",
  ibs_cbs_vigencia_invertida: "Vigência final anterior à inicial.",
  ibs_cbs_cindop: "cIndOp precisa ter 6 dígitos (obrigatório na NFS-e).",
  ibs_cbs_inddest: "Informe o indicador de destinatário (NFS-e).",
  ibs_cbs_destinatario_terceiro_nao_suportado: "Destinatário diferente do tomador ainda não é suportado.",
  ibs_cbs_aliquota_cbs: "CST 000 exige alíquota CBS declarada.",
  ibs_cbs_aliquota_ibs_uf: "CST 000 exige alíquota IBS UF declarada.",
  ibs_cbs_aliquota_ibs_mun: "CST 000 exige alíquota IBS Município declarada.",
  ibs_cbs_aliquota_com_cst_nao_tributado: "CST 410 não admite alíquota positiva.",
  ibs_cbs_reducao_nao_suportado: "Redução ainda sem grupo XML homologado.",
  ibs_cbs_diferimento_nao_suportado: "Diferimento ainda sem grupo XML homologado.",
  ibs_cbs_monofasia_nao_suportado: "Monofasia ainda sem grupo XML homologado.",
  ibs_cbs_credito_presumido_nao_suportado: "Crédito presumido ainda sem grupo XML homologado.",
};
export const ibsCbsIssueLabel = (c: string) => LABELS[c] ?? c;

/** Pendências do perfil (independentes da data/destino de uma nota específica). */
export function ibsCbsProfileIssues(c: IbsCbsItemConfiguration, isService: boolean): string[] {
  const issueDate = (c.effective_from ?? "").slice(0, 10) || "2026-01-01";
  const r = resolveIbsCbs(c, { documentKind: isService ? "NFSE" : "NFE", issueDate });
  return r.ok === true ? [] : r.missing.filter((m) => m !== "ibs_cbs_fora_vigencia" && m !== "ibs_cbs_data_emissao");
}
