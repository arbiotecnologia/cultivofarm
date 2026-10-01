/**
 * Espelho cliente das regras do servidor (fonte de verdade: RPCs
 * org_status_transition_ok / platform_create_organization / org_onboarding_complete).
 * Usado apenas para UX e testes; o servidor sempre revalida.
 */
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

export function normalizarCnpj(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "");
  return d.length ? d : null;
}

export function cnpjValido(v: string | null | undefined): boolean {
  const d = normalizarCnpj(v);
  if (!d || d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (base: string, pesos: number[]) => {
    const s = base.split("").reduce((a, c, i) => a + Number(c) * pesos[i], 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calc(d.slice(0, 12) + d1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d.endsWith(`${d1}${d2}`);
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
  if (!t(d.responsavel_nome)) p.push("Responsável");
  if (!t(d.fuso_horario)) p.push("Fuso horário");
  if (d.confirmado !== true) p.push("Confirmação");
  return p;
}

/** Remove campos que o cliente nunca pode definir (servidor também descarta). */
export function sanitizarPayloadOnboarding(d: Record<string, unknown>): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { organization_id, status, id, cnpj_normalizado, ...resto } = d;
  return resto;
}
