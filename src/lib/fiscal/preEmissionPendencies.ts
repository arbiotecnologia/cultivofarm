/**
 * Pendências fiscais por cenário (pré-emissão), calculadas SOMENTE a partir
 * dos perfis canônicos já gravados (product_fiscal_profiles,
 * customer_fiscal_profiles). Função pura: não lê banco, não cria perfil,
 * não altera documentos históricos e não autoriza emissão. Serve para apontar
 * o campo faltante e o editor onde corrigi-lo.
 */
import { icmsCodeKindForCrt } from "../../../supabase/functions/_shared/fiscal/nfe/icmsRegime";
export type FiscalScenario = "interna" | "interestadual";
export type PendencyEntity = "produto" | "cliente" | "empresa";

export interface ProductProfileInput {
  ncm?: string | null;
  cfop_in_state?: string | null;
  cfop_interstate?: string | null;
  origin_code?: string | null;
  icms_cst?: string | null;
  icms_csosn?: string | null;
  pis_cst?: string | null;
  cofins_cst?: string | null;
  commercial_unit?: string | null;
  taxable_unit?: string | null;
  profile_status?: string | null;
}

export interface CustomerProfileInput {
  taxpayer_indicator?: string | null;
  state_registration_status?: string | null;
  fiscal_state?: string | null;
  fiscal_municipality_ibge_code?: string | null;
  fiscal_street?: string | null;
  fiscal_number?: string | null;
  fiscal_postal_code?: string | null;
  profile_status?: string | null;
  cpf_cnpj?: string | null;
}

export interface Pendency {
  entity: PendencyEntity;
  field: string;
  label: string;
  message: string;
}

const blank = (v: unknown) => v === null || v === undefined || String(v).trim() === "";
const digits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** Grupo ICMS pela regra única do motor (icmsRegime.ts). CRT ausente → exige CST ou CSOSN. */
export function productPendencies(
  p: ProductProfileInput | null | undefined,
  scenario: FiscalScenario,
  crt?: string | number | null,
): Pendency[] {
  const out: Pendency[] = [];
  const add = (field: string, label: string, message: string) =>
    out.push({ entity: "produto", field, label, message });
  if (!p) {
    add("perfil", "Perfil fiscal", "Produto sem perfil fiscal. Abra o editor fiscal para cadastrá-lo.");
    return out;
  }
  if (digits(p.ncm).length !== 8) add("ncm", "NCM", "NCM ausente ou sem 8 dígitos.");
  const cfopField = scenario === "interna" ? "cfop_in_state" : "cfop_interstate";
  const cfop = digits(p[cfopField]);
  const expected = scenario === "interna" ? "5" : "6";
  if (cfop.length !== 4) {
    add(cfopField, scenario === "interna" ? "CFOP interno" : "CFOP interestadual", "CFOP do cenário ausente.");
  } else if (cfop[0] !== expected) {
    add(cfopField, scenario === "interna" ? "CFOP interno" : "CFOP interestadual",
      `CFOP ${cfop} não corresponde a operação ${scenario} de saída (deve iniciar por ${expected}).`);
  }
  if (blank(p.origin_code)) add("origin_code", "Origem", "Origem da mercadoria ausente.");
  const kind = icmsCodeKindForCrt(crt);
  if (kind === "CSOSN") {
    if (blank(p.icms_csosn)) add("icms_csosn", "ICMS CSOSN", "CSOSN obrigatório para o regime do emitente.");
  } else if (kind === "CST") {
    if (blank(p.icms_cst)) add("icms_cst", "ICMS CST", "CST de ICMS obrigatório para o regime do emitente.");
  } else if (blank(p.icms_cst) && blank(p.icms_csosn)) {
    add("icms_cst", "ICMS CST/CSOSN", "Informe CST ou CSOSN de ICMS.");
  }
  if (blank(p.pis_cst)) add("pis_cst", "PIS CST", "CST de PIS ausente.");
  if (blank(p.cofins_cst)) add("cofins_cst", "COFINS CST", "CST de COFINS ausente.");
  if (blank(p.commercial_unit)) add("commercial_unit", "Unidade comercial", "Unidade comercial ausente.");
  if (blank(p.taxable_unit) && blank(p.commercial_unit))
    add("taxable_unit", "Unidade tributável", "Unidade tributável ausente.");
  if (p.profile_status === "BLOCKED") add("profile_status", "Status", "Perfil bloqueado para uso fiscal.");
  return out;
}

export function customerPendencies(
  c: CustomerProfileInput | null | undefined,
  scenario: FiscalScenario,
  emitterUf?: string | null,
): Pendency[] {
  const out: Pendency[] = [];
  const add = (field: string, label: string, message: string) =>
    out.push({ entity: "cliente", field, label, message });
  if (!c) {
    add("perfil", "Perfil fiscal", "Cliente sem perfil fiscal. Abra o editor fiscal para cadastrá-lo.");
    return out;
  }
  const doc = digits(c.cpf_cnpj);
  if (doc.length !== 11 && doc.length !== 14) add("cpf_cnpj", "CPF/CNPJ", "CPF/CNPJ do cadastro do cliente ausente ou inválido.");
  if (blank(c.taxpayer_indicator)) add("taxpayer_indicator", "Indicador de IE", "Indicador de contribuinte ausente.");
  if (c.taxpayer_indicator === "1" && c.state_registration_status !== "ACTIVE" && !blank(c.state_registration_status))
    add("state_registration_status", "Situação da IE", "Contribuinte com IE não ativa.");
  if (blank(c.fiscal_state)) add("fiscal_state", "UF", "UF do destinatário ausente.");
  if (digits(c.fiscal_municipality_ibge_code).length !== 7)
    add("fiscal_municipality_ibge_code", "Município IBGE", "Código IBGE do município ausente (7 dígitos).");
  if (blank(c.fiscal_street)) add("fiscal_street", "Logradouro", "Logradouro ausente.");
  if (blank(c.fiscal_number)) add("fiscal_number", "Número", "Número do endereço ausente.");
  if (digits(c.fiscal_postal_code).length !== 8) add("fiscal_postal_code", "CEP", "CEP ausente ou inválido.");
  if (c.profile_status === "BLOCKED") add("profile_status", "Status", "Perfil bloqueado para uso fiscal.");
  if (emitterUf && c.fiscal_state) {
    const same = emitterUf.toUpperCase() === c.fiscal_state.toUpperCase();
    if (scenario === "interna" && !same)
      add("fiscal_state", "UF", `Destinatário em ${c.fiscal_state}: operação é interestadual, não interna.`);
    if (scenario === "interestadual" && same)
      add("fiscal_state", "UF", `Destinatário em ${c.fiscal_state}: operação é interna, não interestadual.`);
  }
  return out;
}

/** Cenário derivado das UFs; null quando alguma UF é desconhecida (nunca inferir). */
export function scenarioFor(emitterUf?: string | null, destUf?: string | null): FiscalScenario | null {
  if (!emitterUf || !destUf) return null;
  return emitterUf.toUpperCase() === destUf.toUpperCase() ? "interna" : "interestadual";
}

export function fiscalEditorLink(entity: "produto" | "cliente" | "servico", id: string): string {
  const base = entity === "produto" ? "/configuracoes/fiscal/produtos"
    : entity === "cliente" ? "/configuracoes/fiscal/clientes" : "/configuracoes/fiscal/servicos";
  const key = entity === "produto" ? "produto" : entity === "cliente" ? "cliente" : "servico";
  return `${base}?${key}=${encodeURIComponent(id)}`;
}

// ── Endereço principal do cliente ───────────────────────────────────────────
export interface ClienteMasterAddress {
  cpf_cnpj?: string | null;
  endereco_logradouro?: string | null;
  endereco_numero?: string | null;
  endereco_cep?: string | null;
  endereco_estado?: string | null;
}

/**
 * Quando o perfil usa o endereço principal (`use_main_address`), logradouro,
 * número, CEP e UF vêm do cadastro do cliente; o código IBGE continua no perfil
 * (o cadastro principal não o possui). Nada é copiado nem gravado.
 */
export function resolveCustomerForPendencies(
  profile: (CustomerProfileInput & { use_main_address?: boolean | null }) | null | undefined,
  cliente: ClienteMasterAddress | null | undefined,
): CustomerProfileInput | null {
  if (!profile) return null;
  const doc = profile.cpf_cnpj ?? cliente?.cpf_cnpj ?? null;
  if (!profile.use_main_address || !cliente) return { ...profile, cpf_cnpj: doc };
  return {
    ...profile,
    cpf_cnpj: doc,
    fiscal_street: cliente.endereco_logradouro ?? null,
    fiscal_number: cliente.endereco_numero ?? null,
    fiscal_postal_code: cliente.endereco_cep ?? null,
    fiscal_state: cliente.endereco_estado ?? null,
  };
}

// ── Apresentações (catalogo_volumes) e conversão de unidade ─────────────────
export interface PresentationInput {
  id: string;
  rotulo?: string | null;
  medida?: string | null;
  volume_ml?: number | null;
  ativo?: boolean | null;
}

const VOLUME_UNITS = new Set(["L", "LT", "LITRO", "ML"]);

/**
 * Quantidade comercial = apresentação; quantidade tributável na unidade do
 * perfil. Quando a unidade tributável é de volume e difere da comercial, cada
 * apresentação ativa precisa de volume em mL para a conversão. Sem volume, a
 * conversão não é inventada: vira pendência.
 */
export function presentationPendencies(
  profile: Pick<ProductProfileInput, "commercial_unit" | "taxable_unit"> | null | undefined,
  presentations: PresentationInput[],
): Pendency[] {
  if (!profile) return [];
  const com = String(profile.commercial_unit ?? "").trim().toUpperCase();
  const trib = String(profile.taxable_unit ?? "").trim().toUpperCase();
  if (!trib || trib === com || !VOLUME_UNITS.has(trib)) return [];
  return presentations
    .filter((p) => p.ativo !== false && !(Number(p.volume_ml) > 0))
    .map((p) => ({
      entity: "produto" as const,
      field: `apresentacao:${p.id}`,
      label: `Apresentação ${p.rotulo || p.medida || p.id.slice(0, 8)}`,
      message: `Sem volume em mL para converter ${com || "unidade comercial"} em ${trib}.`,
    }));
}

/** Fator de conversão comercial→tributável de uma apresentação (null = indeterminado). */
export function conversionFactor(taxableUnit: string | null | undefined, volumeMl: number | null | undefined): number | null {
  const u = String(taxableUnit ?? "").trim().toUpperCase();
  const v = Number(volumeMl);
  if (!(v > 0)) return null;
  if (u === "ML") return v;
  if (u === "L" || u === "LT" || u === "LITRO") return v / 1000;
  return null;
}

// ── Item de rascunho ────────────────────────────────────────────────────────
/** CFOP já gravado no item do rascunho versus cenário (sem alterar o rascunho). */
export function draftItemCfopPendency(itemCfop: string | null | undefined, scenario: FiscalScenario, label: string): Pendency | null {
  const c = digits(itemCfop);
  const expected = scenario === "interna" ? "5" : "6";
  if (c.length === 4 && c[0] === expected) return null;
  return {
    entity: "produto",
    field: "item_cfop",
    label,
    message: c.length === 4
      ? `CFOP ${c} no item não corresponde à operação ${scenario}; reaplique o produto após corrigir o perfil.`
      : "Item sem CFOP.",
  };
}
