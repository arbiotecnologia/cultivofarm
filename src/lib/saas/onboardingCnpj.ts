/**
 * Consulta de CNPJ no onboarding: chamada à Edge Function autenticada e
 * planejamento de aplicação que nunca sobrescreve valores sem confirmação.
 */
import { supabase } from "@/integrations/supabase/client";
import type { OnboardingDados } from "@/lib/saas/orgOnboarding";
import type { DadosEmpresa } from "../../../supabase/functions/onboarding-cnpj-lookup/core";

export type { DadosEmpresa };
export const FONTE_OFICIAL = "Fonte: Receita Federal via BrasilAPI";

/** Campos do onboarding preenchíveis pela consulta (responsável nunca). */
export const CAMPOS_APLICAVEIS = [
  "razao_social", "nome_fantasia", "cnpj", "regime_tributario", "cep", "logradouro",
  "numero", "bairro", "cidade", "uf", "telefone", "email_contato",
] as const satisfies readonly (keyof OnboardingDados)[];
export type CampoAplicavel = (typeof CAMPOS_APLICAVEIS)[number];

/** Oficiais: protegidos após aplicar. */
export const CAMPOS_OFICIAIS_TRAVADOS: readonly CampoAplicavel[] = ["razao_social", "cnpj"];

export const ROTULOS: Record<CampoAplicavel, string> = {
  razao_social: "Razão social", nome_fantasia: "Nome fantasia", cnpj: "CNPJ",
  regime_tributario: "Regime tributário", cep: "CEP", logradouro: "Logradouro", numero: "Número",
  bairro: "Bairro", cidade: "Cidade", uf: "UF", telefone: "Telefone", email_contato: "E-mail de contato",
};

export interface ItemPlano { campo: CampoAplicavel; atual: string; novo: string; tipo: "vazio" | "conflito" }

const norm = (s: string) => s.normalize("NFD").replace(/[\s.\-/()]/g, "").replace(/\p{Diacritic}/gu, "").toUpperCase();

export function planejarAplicacao(atual: OnboardingDados, dados: DadosEmpresa): ItemPlano[] {
  const out: ItemPlano[] = [];
  for (const campo of CAMPOS_APLICAVEIS) {
    const novo = (dados[campo as keyof DadosEmpresa] as string | null) ?? "";
    if (!novo) continue;
    const a = ((atual[campo] as string) ?? "").trim();
    if (!a) out.push({ campo, atual: "", novo, tipo: "vazio" });
    else if (norm(a) !== norm(novo)) out.push({ campo, atual: a, novo, tipo: "conflito" });
  }
  return out;
}

/** Aplica vazios sempre; conflitos só quando escolhidos explicitamente. CNPJ digitado nunca muda. */
export function aplicarPlano(
  atual: OnboardingDados, plano: ItemPlano[], usarApi: Set<CampoAplicavel>,
): OnboardingDados {
  const r: OnboardingDados = { ...atual };
  for (const i of plano) {
    if (i.campo === "cnpj" && i.atual) continue;
    if (i.tipo === "vazio" || usarApi.has(i.campo)) r[i.campo] = i.novo;
  }
  return r;
}

export type CodigoConsulta =
  | "ok" | "invalid_cnpj" | "unsupported_alpha" | "not_found" | "rate_limited" | "rate_limited_local"
  | "upstream_error" | "timeout" | "malformed" | "too_large" | "network_error" | "forbidden"
  | "auth_header" | "bad_jwt" | string;

export const MENSAGENS: Record<string, string> = {
  invalid_cnpj: "CNPJ inválido. Confira os dígitos.",
  unsupported_alpha: "CNPJ alfanumérico ainda não é consultável na BrasilAPI. Preencha manualmente.",
  not_found: "CNPJ não encontrado na base pública.",
  rate_limited: "Limite de consultas excedido. Aguarde um minuto e tente novamente.",
  rate_limited_local: "Limite de consultas excedido. Aguarde um minuto e tente novamente.",
  timeout: "A consulta demorou demais. Tente novamente.",
  upstream_error: "Base pública indisponível no momento. Tente novamente.",
  malformed: "A base pública respondeu de forma inesperada. Tente novamente.",
  too_large: "A base pública respondeu de forma inesperada. Tente novamente.",
  network_error: "Falha de rede ao consultar. Tente novamente.",
  forbidden: "Somente o administrador da empresa em cadastro pode consultar.",
  auth_header: "Sessão expirada. Entre novamente.",
  bad_jwt: "Sessão expirada. Entre novamente.",
};
export const mensagemConsulta = (c: string) => MENSAGENS[c] ?? "Não foi possível consultar agora. Tente novamente.";

export async function consultarCnpjOnboarding(
  cnpj: string,
): Promise<{ codigo: "ok"; dados: DadosEmpresa; consultado_em?: string } | { codigo: CodigoConsulta }> {
  const { data, error } = await supabase.functions.invoke("onboarding-cnpj-lookup", { body: { cnpj } });
  if (!error && data?.codigo === "ok") return data;
  let body: { codigo?: string } | null = data ?? null;
  const ctx = (error as { context?: Response } | null)?.context;
  if (!body && ctx && typeof ctx.json === "function") {
    try { body = await ctx.clone().json(); } catch { body = null; }
  }
  return { codigo: body?.codigo ?? "network_error" };
}
