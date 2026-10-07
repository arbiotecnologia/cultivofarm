import type { OrganizacaoSaaS } from "@/hooks/usePlataformaSaaS";
import { normalizarCnpj, UFS_BRASIL } from "@/lib/saas/orgOnboarding";
import { MOTIVO_MIN_LENGTH } from "./commercialDraftState";

export const EMAIL_EMPRESA_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Subconjunto de onboarding_dados editável pela plataforma (espelho de platform_private.org_cadastro_patch). */
export const CAMPOS_CADASTRO = [
  "telefone", "email_contato", "responsavel_nome", "responsavel_cargo",
  "cep", "logradouro", "numero", "complemento", "bairro", "cidade", "uf",
  "inscricao_estadual", "fuso_horario",
] as const;
export type CampoCadastro = (typeof CAMPOS_CADASTRO)[number];
export type DadosCadastro = Partial<Record<CampoCadastro, string>>;

export const CAMPOS_OBRIGATORIOS_CADASTRO: CampoCadastro[] = ["telefone", "cep", "logradouro", "numero", "bairro", "cidade", "uf"];

export const ROTULO_CAMPO: Record<CampoCadastro, string> = {
  telefone: "Telefone", email_contato: "E-mail de contato", responsavel_nome: "Contato responsável",
  responsavel_cargo: "Cargo", cep: "CEP", logradouro: "Logradouro", numero: "Número", complemento: "Complemento",
  bairro: "Bairro", cidade: "Cidade", uf: "UF", inscricao_estadual: "Inscrição estadual", fuso_horario: "Fuso horário",
};

const LIMITES: Record<CampoCadastro, number> = {
  telefone: 20, email_contato: 255, responsavel_nome: 160, responsavel_cargo: 120, cep: 9, logradouro: 200,
  numero: 20, complemento: 120, bairro: 120, cidade: 120, uf: 2, inscricao_estadual: 20, fuso_horario: 64,
};
export const limiteCampo = (c: CampoCadastro) => LIMITES[c];

export const soDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
export const mascaraCep = (v: string) => {
  const d = soDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};
export const mascaraTelefoneBR = (v: string) => {
  const d = soDigitos(v).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}${d.length > 6 ? `-${d.slice(6)}` : ""}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
export const cepValido = (v: string | null | undefined) => /^\d{8}$/.test(soDigitos(v));
export const telefoneValido = (v: string | null | undefined) => /^\d{10,11}$/.test(soDigitos(v));
export const ufValida = (v: string | null | undefined) => (UFS_BRASIL as readonly string[]).includes((v ?? "").trim().toUpperCase());

/** Normalização igual à do servidor (onboarding_validar). */
export function normalizarCampo(c: CampoCadastro, v: string | null | undefined): string {
  const s = (v ?? "").trim().replace(/\s+/g, " ");
  if (!s) return "";
  if (c === "telefone") return soDigitos(s);
  if (c === "cep") { const d = soDigitos(s); return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : s; }
  if (c === "email_contato") return s.toLowerCase();
  if (c === "uf") return s.toUpperCase();
  return s;
}

/** Erros de formato para campos preenchidos; `exigirObrigatorios` só para empresas novas. */
export function errosCadastro(d: DadosCadastro, exigirObrigatorios = false): string[] {
  const erros: string[] = [];
  const v = (c: CampoCadastro) => (d[c] ?? "").trim();
  if (exigirObrigatorios) {
    const faltando = CAMPOS_OBRIGATORIOS_CADASTRO.filter((c) => !v(c)).map((c) => ROTULO_CAMPO[c]);
    if (faltando.length) erros.push(`Preencha: ${faltando.join(", ")}.`);
  }
  if (v("telefone") && !telefoneValido(v("telefone"))) erros.push("Telefone deve ter DDD e 8 ou 9 dígitos.");
  if (v("cep") && !cepValido(v("cep"))) erros.push("CEP deve ter 8 dígitos.");
  if (v("uf") && !ufValida(v("uf"))) erros.push("Selecione uma UF válida.");
  if (v("email_contato") && !EMAIL_EMPRESA_RE.test(v("email_contato"))) erros.push("Informe um e-mail de contato válido.");
  for (const c of CAMPOS_CADASTRO) if (v(c).length > LIMITES[c]) erros.push(`${ROTULO_CAMPO[c]} muito longo.`);
  return erros;
}

/** Monta só as chaves alteradas (string vazia = limpar). Nunca envia chaves fora da whitelist. */
export function montarPatchCadastro(form: DadosCadastro, atual: DadosCadastro): DadosCadastro {
  const patch: DadosCadastro = {};
  for (const c of CAMPOS_CADASTRO) {
    if (!(c in form)) continue;
    const novo = normalizarCampo(c, form[c]);
    const antigo = normalizarCampo(c, atual[c]);
    if (novo !== antigo) patch[c] = novo;
  }
  return patch;
}

/** Lê o subconjunto canônico de onboarding_dados; fuso vem da coluna da organização. */
export function dadosCadastroAtuais(org: { onboarding_dados?: Record<string, unknown> | null; fuso_horario?: string | null }): DadosCadastro {
  const src = (org.onboarding_dados ?? {}) as Record<string, unknown>;
  const out: DadosCadastro = {};
  for (const c of CAMPOS_CADASTRO) {
    const v = src[c];
    if (typeof v === "string" && v.trim()) out[c] = v;
  }
  if (org.fuso_horario) out.fuso_horario = org.fuso_horario;
  return out;
}

export function camposFaltantes(org: { razao_social?: string | null; nome?: string | null; cnpj?: string | null; email_corporativo?: string | null }, dados: DadosCadastro): string[] {
  const f: string[] = [];
  if (!(org.razao_social ?? org.nome ?? "").trim()) f.push("Razão social");
  if (!(org.cnpj ?? "").trim()) f.push("CNPJ");
  if (!(org.email_corporativo ?? "").trim()) f.push("E-mail corporativo");
  for (const c of CAMPOS_OBRIGATORIOS_CADASTRO) if (!(dados[c] ?? "").trim()) f.push(ROTULO_CAMPO[c]);
  return f;
}

export interface ResumoFiscalEmpresa {
  configurado: boolean;
  razao_social?: string | null;
  cnpj?: string | null;
  inscricao_estadual?: string | null;
  inscricao_municipal?: string | null;
  regime_tributario?: string | null;
  crt?: string | null;
  cnae_principal?: string | null;
  situacao?: string | null;
  nfe_habilitada?: boolean | null;
  nfse_habilitada?: boolean | null;
  ativo?: boolean | null;
  atualizado_em?: string | null;
}

const cmp = (v: string | null | undefined) => (v ?? "").trim().replace(/\s+/g, " ").toUpperCase();
const cmpDoc = (v: string | null | undefined) => (v ?? "").replace(/[\W_]/g, "").toUpperCase();

/** Aponta divergências entre o cadastro empresarial e o emissor fiscal. Nunca resolve. */
export function divergenciasFiscais(
  org: { razao_social?: string | null; nome?: string | null; cnpj?: string | null },
  dados: DadosCadastro,
  fiscal: ResumoFiscalEmpresa | null | undefined,
): string[] {
  if (!fiscal?.configurado) return [];
  const d: string[] = [];
  const razao = org.razao_social ?? org.nome;
  if (fiscal.razao_social && razao && cmp(fiscal.razao_social) !== cmp(razao)) d.push("Razão social");
  if (fiscal.cnpj && org.cnpj && cmpDoc(fiscal.cnpj) !== cmpDoc(org.cnpj)) d.push("CNPJ");
  if ((fiscal.inscricao_estadual || dados.inscricao_estadual) && cmpDoc(fiscal.inscricao_estadual) !== cmpDoc(dados.inscricao_estadual)) d.push("Inscrição estadual");
  return d;
}

export interface FormEmpresa {
  razaoSocial: string;
  nomeFantasia: string;
  email: string;
  motivo: string;
  dados?: DadosCadastro;
}

const norm = (v: string) => v.trim().replace(/\s+/g, " ");

export function errosFormEmpresa(form: FormEmpresa): string[] {
  const erros: string[] = [];
  const razao = norm(form.razaoSocial);
  if (razao.length < 2 || razao.length > 200) erros.push("Informe a razão social (2 a 200 caracteres).");
  if (norm(form.nomeFantasia).length > 200) erros.push("Nome fantasia muito longo.");
  if (!EMAIL_EMPRESA_RE.test(form.email.trim())) erros.push("Informe um e-mail válido.");
  if (form.dados) erros.push(...errosCadastro(form.dados));
  if ([...form.motivo.trim()].length < MOTIVO_MIN_LENGTH) erros.push(`Informe o motivo (mínimo ${MOTIVO_MIN_LENGTH} caracteres).`);
  return erros;
}

export function formEmpresaAlterado(
  form: FormEmpresa,
  atual: { razao_social: string | null; nome: string | null; nome_fantasia: string | null; email_corporativo: string | null; onboarding_dados?: Record<string, unknown> | null; fuso_horario?: string | null },
): boolean {
  const basico = norm(form.razaoSocial) !== norm(atual.razao_social ?? atual.nome ?? "") ||
    norm(form.nomeFantasia) !== norm(atual.nome_fantasia ?? "") ||
    form.email.trim().toLowerCase() !== (atual.email_corporativo ?? "").toLowerCase();
  if (basico || !form.dados) return basico;
  return Object.keys(montarPatchCadastro(form.dados, dadosCadastroAtuais(atual))).length > 0;
}

export function formatarCnpj(cnpj: string | null | undefined): string {
  const d = (cnpj ?? "").replace(/\W/g, "").toUpperCase();
  if (d.length !== 14) return cnpj || "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function formatarTelefone(v: string | null | undefined): string | null {
  const d = soDigitos(v);
  return d ? mascaraTelefoneBR(d) : null;
}

export function mensagemErroEdicaoEmpresa(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const code = (e as { code?: string } | null)?.code;
  if (code === "42501" || msg.includes("platform_forbidden")) return "Seu acesso não permite editar empresas.";
  if (msg.includes("alterada por outra pessoa")) return "A empresa foi alterada por outra pessoa. Recarregue os dados antes de salvar.";
  if (msg.includes("chave idempotente")) return "Esta alteração já foi enviada com outro conteúdo. Revise e salve novamente.";
  if (msg.includes("nenhuma alteração")) return "Nenhuma alteração para salvar.";
  if (msg.includes("CEP")) return "Informe um CEP válido (8 dígitos).";
  if (msg.includes("telefone")) return "Informe um telefone válido com DDD.";
  if (msg.includes("UF")) return "Selecione uma UF válida.";
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
