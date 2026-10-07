/**
 * Espelho cliente das regras do servidor (fonte de verdade: RPCs
 * org_status_transition_ok / platform_create_organization / org_onboarding_complete).
 * Usado apenas para UX e testes; o servidor sempre revalida.
 */
import { unmaskCnpjAlpha, validateCnpjAlpha } from "@/lib/fiscal/cnpjAlpha";
import { normalizePhoneBR } from "@/lib/masks";

export const FUSOS_BRASIL = [
  { value: "America/Sao_Paulo", label: "Brasília / Sudeste e Sul (UTC−03)" },
  { value: "America/Manaus", label: "Manaus / Amazonas (UTC−04)" },
  { value: "America/Cuiaba", label: "Cuiabá / Mato Grosso (UTC−04)" },
  { value: "America/Campo_Grande", label: "Campo Grande / Mato Grosso do Sul (UTC−04)" },
  { value: "America/Rio_Branco", label: "Rio Branco / Acre (UTC−05)" },
  { value: "America/Noronha", label: "Fernando de Noronha (UTC−02)" },
] as const;

export const REGIMES_TRIBUTARIOS = [
  { value: "simples_nacional", label: "Simples Nacional" },
  { value: "mei", label: "MEI" },
  { value: "lucro_presumido", label: "Lucro Presumido" },
  { value: "lucro_real", label: "Lucro Real" },
  { value: "imune_isenta", label: "Imune / Isenta" },
  { value: "outros", label: "Outros" },
] as const;

export const UFS_BRASIL = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
  "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
] as const;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const normalizarEmailEmpresa = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();
export const emailEmpresaValido = (value: string | null | undefined) => {
  const normalized = normalizarEmailEmpresa(value);
  return normalized === "" || EMAIL_PATTERN.test(normalized);
};
export const fusoHorarioValido = (value: string | null | undefined) => {
  if (!value) return false;
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: value }).format(); return true; } catch { return false; }
};
export const regimeTributarioValido = (value: string | null | undefined) =>
  REGIMES_TRIBUTARIOS.some((option) => option.value === value);

/** Whitelist de chaves aceitas pelo servidor (platform_private.onboarding_validar). */
export const ONBOARDING_CAMPOS: Record<string, number> = {
  razao_social: 200, nome_fantasia: 200, cnpj: 18, inscricao_estadual: 20, regime_tributario: 40,
  cep: 9, logradouro: 200, numero: 20, complemento: 120, bairro: 120, cidade: 120, uf: 2, telefone: 20,
  email_contato: 255, responsavel_nome: 160, responsavel_cargo: 120, fuso_horario: 64, idioma: 10,
};
export type OrgStatus = "rascunho" | "aguardando_ativacao" | "onboarding" | "ativa" | "suspensa" | "cancelada";

export const ORG_STATUS_LABEL: Record<OrgStatus, string> = {
  rascunho: "Rascunho",
  aguardando_ativacao: "Aguardando ativação",
  onboarding: "Em onboarding",
  ativa: "Ativa",
  suspensa: "Suspensa",
  cancelada: "Cancelada",
};

const TRANSICOES: Record<OrgStatus, OrgStatus[]> = {
  rascunho: ["aguardando_ativacao", "cancelada"],
  aguardando_ativacao: ["onboarding", "rascunho", "cancelada"],
  onboarding: ["ativa", "cancelada", "suspensa"],
  ativa: ["suspensa", "cancelada"],
  suspensa: ["ativa", "cancelada"],
  cancelada: [],
};

export function transicaoPermitida(de: OrgStatus, para: OrgStatus): boolean {
  return TRANSICOES[de]?.includes(para) ?? false;
}

/** Mesmo critério do servidor (platform_private.cnpj_normalizar): mantém letras (CNPJ alfanumérico). */
export function normalizarCnpj(v: string | null | undefined): string | null {
  const d = unmaskCnpjAlpha(v);
  return d.length ? d : null;
}

/** Valida dígitos verificadores (numérico e alfanumérico RFB), igual ao servidor. */
export function cnpjValido(v: string | null | undefined): boolean {
  return validateCnpjAlpha(v);
}

/** Organizações com onboarding pendente bloqueiam os módulos operacionais. */
export function onboardingBloqueia(status: string | null | undefined): boolean {
  return status === "aguardando_ativacao" || status === "onboarding" || status === "rascunho";
}

export interface OnboardingDados {
  razao_social?: string;
  nome_fantasia?: string;
  cnpj?: string;
  inscricao_estadual?: string;
  regime_tributario?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  telefone?: string;
  email_contato?: string;
  responsavel_nome?: string;
  responsavel_cargo?: string;
  fuso_horario?: string;
  idioma?: string;
  confirmado?: boolean;
}

/** Retorna a lista de pendências; vazia = pode concluir. */
export function pendenciasOnboarding(d: OnboardingDados): string[] {
  const p: string[] = [];
  const t = (s?: string) => (s ?? "").trim();
  if (!t(d.razao_social)) p.push("Razão social");
  if (!cnpjValido(d.cnpj)) p.push("CNPJ válido");
  if (!t(d.cep)) p.push("CEP");
  if (!t(d.logradouro)) p.push("Endereço");
  if (!t(d.cidade)) p.push("Cidade");
  if (!/^[A-Za-z]{2}$/.test(t(d.uf))) p.push("UF");
  if (!t(d.telefone)) p.push("Telefone");
  else if (!normalizePhoneBR(d.telefone)) p.push("Telefone válido");
  if (!emailEmpresaValido(d.email_contato)) p.push("E-mail válido");
  if (!t(d.responsavel_nome)) p.push("Responsável");
  if (!fusoHorarioValido(d.fuso_horario)) p.push("Fuso horário");
  if (t(d.regime_tributario) && !regimeTributarioValido(d.regime_tributario)) p.push("Regime tributário");
  if (d.confirmado !== true) p.push("Confirmação");
  return p;
}

/** Mantém apenas chaves da whitelist (o servidor rejeita qualquer outra). */
export function sanitizarPayloadOnboarding(d: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(d)) {
    if (k === "confirmado") {
      if (typeof v === "boolean") out[k] = v;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(ONBOARDING_CAMPOS, k) || typeof v !== "string") continue;
    let normalized = v.trim().slice(0, ONBOARDING_CAMPOS[k]);
    if (k === "telefone") normalized = normalizePhoneBR(normalized) ?? normalized;
    if (k === "email_contato") normalized = normalizarEmailEmpresa(normalized);
    out[k] = normalized;
  }
  return out;
}
