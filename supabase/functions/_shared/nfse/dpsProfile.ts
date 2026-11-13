/**
 * Complemento DPS do perfil fiscal de serviço (NFS-e Nacional, leiaute 1.01).
 * Persistido em service_fiscal_profiles.federal_withholding_defaults.nfse_dps
 * (coluna jsonb existente) e copiado no faturamento para o snapshot do rascunho.
 * Módulo puro, sem imports: usado pela Edge, pelo editor e pelos testes.
 * Nenhum valor é presumido: campo ausente fica ausente.
 */
export const NFSE_DPS_PROFILE_VERSION = 1 as const;

export const PIS_COFINS_CST = ["00","01","02","03","04","05","06","07","08","09","49","50","51","52","53","54","55","56","60","61","62","63","64","65","66","67","70","71","72","73","74","75","98","99"] as const;
export const PIS_COFINS_RET_TYPES: Record<string, string> = {
  "0": "PIS/COFINS/CSLL não retidos", "1": "PIS/COFINS retidos", "2": "PIS/COFINS não retidos", "3": "PIS/COFINS/CSLL retidos",
  "4": "PIS/COFINS retidos, CSLL não retido", "5": "PIS retido, COFINS/CSLL não retidos", "6": "COFINS retido, PIS/CSLL não retidos",
  "7": "PIS não retido, COFINS/CSLL retidos", "8": "PIS/COFINS não retidos, CSLL retido", "9": "COFINS não retido, PIS/CSLL retidos",
};
export type TotTribMode = "IND" | "PERCENT" | "SN";

export interface NfseDpsProfile {
  v: 1;
  nbs_code?: string;
  service_location_ibge_code?: string;
  pis_cofins?: { cst: string; p_aliq_pis?: number; p_aliq_cofins?: number; ret_type?: string };
  federal_retentions?: { cp_rate?: number; irrf_rate?: number; csll_rate?: number };
  tot_trib?: { mode: TotTribMode; fed?: number; est?: number; mun?: number; sn?: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
const only = (o: Record<string, unknown>, keys: string[]) => Object.keys(o).every((k) => keys.includes(k));
const pct = (v: unknown, max: number) => v === undefined || (num(v) && (v as number) >= 0 && (v as number) <= max && Math.round((v as number) * 100) === (v as number) * 100);

/** Lista de problemas do complemento; vazia = válido. Não preenche nada. */
export function validateNfseDpsProfile(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  if (!isObj(raw)) return ["formato"];
  const e: string[] = [];
  if (!only(raw, ["v", "nbs_code", "service_location_ibge_code", "pis_cofins", "federal_retentions", "tot_trib"])) e.push("chave_desconhecida");
  if (raw.v !== 1) e.push("versao");
  if (raw.nbs_code !== undefined && !(typeof raw.nbs_code === "string" && /^\d{9}$/.test(raw.nbs_code))) e.push("nbs");
  if (raw.service_location_ibge_code !== undefined && !(typeof raw.service_location_ibge_code === "string" && /^\d{7}$/.test(raw.service_location_ibge_code))) e.push("local_prestacao");
  const pc = raw.pis_cofins;
  if (pc !== undefined) {
    if (!isObj(pc) || !only(pc, ["cst", "p_aliq_pis", "p_aliq_cofins", "ret_type"])) e.push("pis_cofins");
    else {
      if (!(PIS_COFINS_CST as readonly string[]).includes(String(pc.cst))) e.push("pis_cofins_cst");
      if (!pct(pc.p_aliq_pis, 99.99) || !pct(pc.p_aliq_cofins, 99.99)) e.push("pis_cofins_aliquota");
      if ((pc.p_aliq_pis === undefined) !== (pc.p_aliq_cofins === undefined)) e.push("pis_cofins_aliquota_par");
      if (pc.ret_type !== undefined && !(String(pc.ret_type) in PIS_COFINS_RET_TYPES && typeof pc.ret_type === "string")) e.push("pis_cofins_retencao");
    }
  }
  const fr = raw.federal_retentions;
  if (fr !== undefined && (!isObj(fr) || !only(fr, ["cp_rate", "irrf_rate", "csll_rate"]) || !pct(fr.cp_rate, 100) || !pct(fr.irrf_rate, 100) || !pct(fr.csll_rate, 100))) e.push("retencoes_federais");
  const tt = raw.tot_trib;
  if (tt !== undefined) {
    if (!isObj(tt) || !only(tt, ["mode", "fed", "est", "mun", "sn"]) || !["IND", "PERCENT", "SN"].includes(String(tt.mode))) e.push("total_tributos");
    else if (tt.mode === "PERCENT" && !(num(tt.fed) && num(tt.est) && num(tt.mun) && pct(tt.fed, 999.99) && pct(tt.est, 999.99) && pct(tt.mun, 999.99) && tt.sn === undefined)) e.push("total_tributos_percentual");
    else if (tt.mode === "SN" && !(num(tt.sn) && pct(tt.sn, 99.99) && tt.fed === undefined && tt.est === undefined && tt.mun === undefined)) e.push("total_tributos_sn");
    else if (tt.mode === "IND" && Object.keys(tt).length !== 1) e.push("total_tributos_ind");
  }
  return e;
}

/** Remove chaves vazias; devolve null se nada informado (não grava objeto vazio). */
export function compactNfseDpsProfile(p: Partial<NfseDpsProfile>): NfseDpsProfile | null {
  const out: Record<string, unknown> = { v: 1 };
  const clean = (o: Record<string, unknown> | undefined) => {
    if (!o) return undefined;
    const r = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));
    return Object.keys(r).length ? r : undefined;
  };
  if (p.nbs_code) out.nbs_code = p.nbs_code;
  if (p.service_location_ibge_code) out.service_location_ibge_code = p.service_location_ibge_code;
  const pc = clean(p.pis_cofins as Record<string, unknown> | undefined); if (pc) out.pis_cofins = pc;
  const fr = clean(p.federal_retentions as Record<string, unknown> | undefined); if (fr) out.federal_retentions = fr;
  const tt = clean(p.tot_trib as Record<string, unknown> | undefined); if (tt) out.tot_trib = tt;
  return Object.keys(out).length > 1 ? (out as unknown as NfseDpsProfile) : null;
}
