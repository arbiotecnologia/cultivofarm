import type { OrganizacaoSaaS } from "@/hooks/usePlataformaSaaS";
import { normalizarCnpj } from "@/lib/saas/orgOnboarding";
import { MOTIVO_MIN_LENGTH } from "./commercialDraftState";

export const EMAIL_EMPRESA_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface FormEmpresa {
  razaoSocial: string;
  nomeFantasia: string;
  email: string;
  motivo: string;
}

const norm = (v: string) => v.trim().replace(/\s+/g, " ");

export function errosFormEmpresa(form: FormEmpresa): string[] {
  const erros: string[] = [];
  const razao = norm(form.razaoSocial);
  if (razao.length < 2 || razao.length > 200) erros.push("Informe a razão social (2 a 200 caracteres).");
  if (norm(form.nomeFantasia).length > 200) erros.push("Nome fantasia muito longo.");
  if (!EMAIL_EMPRESA_RE.test(form.email.trim())) erros.push("Informe um e-mail válido.");
  if ([...form.motivo.trim()].length < MOTIVO_MIN_LENGTH) erros.push(`Informe o motivo (mínimo ${MOTIVO_MIN_LENGTH} caracteres).`);
  return erros;
}

export function formEmpresaAlterado(
  form: FormEmpresa,
  atual: { razao_social: string | null; nome: string | null; nome_fantasia: string | null; email_corporativo: string | null },
): boolean {
  return norm(form.razaoSocial) !== norm(atual.razao_social ?? atual.nome ?? "") ||
    norm(form.nomeFantasia) !== norm(atual.nome_fantasia ?? "") ||
    form.email.trim().toLowerCase() !== (atual.email_corporativo ?? "").toLowerCase();
}

export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = (cnpj ?? "").replace(/\W/g, "").toUpperCase();
  if (d.length !== 14) return cnpj || "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function mensagemErroEdicaoEmpresa(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const code = (e as { code?: string } | null)?.code;
  if (code === "42501" || msg.includes("platform_forbidden")) return "Seu acesso não permite editar empresas.";
  if (msg.includes("alterada por outra pessoa")) return "A empresa foi alterada por outra pessoa. Recarregue os dados antes de salvar.";
  if (msg.includes("chave idempotente")) return "Esta alteração já foi enviada com outro conteúdo. Revise e salve novamente.";
  if (msg.includes("nenhuma alteração")) return "Nenhuma alteração para salvar.";
  if (msg.includes("e-mail inválido")) return "Informe um e-mail válido.";
  if (msg.includes("razão social")) return "Informe uma razão social válida.";
  if (msg.includes("motivo")) return "Informe o motivo (mínimo 2 caracteres).";
  return "Não foi possível salvar a empresa agora. Tente novamente.";
}

export function filtrarEmpresas(lista: OrganizacaoSaaS[], filtro: string): OrganizacaoSaaS[] {
  const query = filtro.trim().toLowerCase();
  if (!query) return lista;
  const digitos = normalizarCnpj(query);
  return lista.filter((org) =>
    [org.nome, org.nome_fantasia, org.cnpj].some((value) => (value ?? "").toLowerCase().includes(query)) ||
    Boolean(digitos && normalizarCnpj(org.cnpj ?? "")?.includes(digitos)));
}

