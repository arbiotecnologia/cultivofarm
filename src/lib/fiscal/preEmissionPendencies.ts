/**
 * Pendências fiscais por cenário (pré-emissão), calculadas SOMENTE a partir
 * dos perfis canônicos já gravados (product_fiscal_profiles,
 * customer_fiscal_profiles). Função pura: não lê banco, não cria perfil,
 * não altera documentos históricos e não autoriza emissão. Serve para apontar
 * o campo faltante e o editor onde corrigi-lo.
 */
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

/** CRT 1/2 (Simples) usa CSOSN; CRT 3 usa CST. CRT ausente → exige um dos dois. */
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
  const crtStr = crt == null ? "" : String(crt);
  if (crtStr === "1" || crtStr === "2" || crtStr === "4") {
    if (blank(p.icms_csosn)) add("icms_csosn", "ICMS CSOSN", "CSOSN obrigatório para o regime do emitente.");
  } else if (crtStr === "3") {
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
