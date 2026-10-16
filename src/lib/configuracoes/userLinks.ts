/**
 * Fase 1 (somente leitura) dos vínculos externos em Configurações › Usuários.
 * Contrato de `public.tenant_admin_user_links(p_user_ids uuid[])`: tenant derivado no
 * servidor, apenas Administrador da empresa, até 100 ids por chamada (uma por página).
 * Este módulo é puro: classifica o tipo de acesso e valida o retorno sem rede.
 */

export const RPC_VINCULOS_USUARIOS = "tenant_admin_user_links";
export const VINCULOS_MAX_IDS = 100;

export type TipoAcesso = "internal" | "b2b" | "b2b_tecnico" | "producer" | "misto";

const EXTERNOS = ["cliente_produtor", "parceiro_b2b", "parceiro_b2b_tecnico"];

/** Tipo de acesso explícito a partir dos papéis atuais (não autoriza nada). */
export function tipoAcessoDoUsuario(roles: string[] | null | undefined): TipoAcesso {
  const r = roles ?? [];
  const externos = r.filter((x) => EXTERNOS.includes(x));
  if (externos.length === 0) return "internal";
  if (externos.length > 1 || r.length > externos.length) return "misto";
  if (externos[0] === "parceiro_b2b") return "b2b";
  if (externos[0] === "parceiro_b2b_tecnico") return "b2b_tecnico";
  return "producer";
}

export const ROTULO_TIPO_ACESSO: Record<TipoAcesso, string> = {
  internal: "Interno",
  b2b: "Parceiro B2B — Gestor",
  b2b_tecnico: "Parceiro B2B — Técnico (indisponível)",
  producer: "Cliente Produtor",
  misto: "Perfis combinados",
};

/**
 * Fase 1: a edição de usuários externos permanece bloqueada no servidor
 * (`user_edit_linked_role_unavailable`). A tela explica isso sem oferecer falso salvar.
 */
export const EDICAO_EXTERNA_DISPONIVEL = false;
export const MSG_EDICAO_EXTERNA_INDISPONIVEL =
  "A edição de usuários externos (Produtor e Parceiro B2B) ainda não está disponível nesta tela. Os dados e o vínculo atual abaixo são apenas para consulta e não foram alterados.";

export function edicaoBloqueadaPorTipo(tipo: TipoAcesso): boolean {
  return !EDICAO_EXTERNA_DISPONIVEL && tipo !== "internal";
}

export interface VinculoCliente {
  cliente_id: string; nome: string; principal: boolean; status_cliente: string | null; vigente: boolean;
}
export interface VinculoParceiro {
  partner_id: string; razao_social: string; papel: string | null; ativo: boolean;
}
export interface VinculosUsuario {
  user_id: string;
  clientes: VinculoCliente[];
  parceiro: VinculoParceiro | null;
  parceiros_total: number;
  fora_do_alcance: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const INVALIDA = "Resposta de vínculos inválida.";
type Obj = Record<string, unknown>;
function obj(v: unknown): Obj { if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error(INVALIDA); return v as Obj; }
function uuid(v: unknown): string { if (typeof v !== "string" || !UUID_RE.test(v)) throw new Error(INVALIDA); return v; }
function texto(v: unknown): string { if (typeof v !== "string") throw new Error(INVALIDA); return v; }
function textoOuNull(v: unknown): string | null { if (v === null || v === undefined) return null; return texto(v); }
function bool(v: unknown): boolean { if (typeof v !== "boolean") throw new Error(INVALIDA); return v; }
function contagem(v: unknown): number { if (typeof v !== "number" || !Number.isInteger(v) || v < 0) throw new Error(INVALIDA); return v; }

/** Valida o contrato completo; qualquer forma inesperada é erro (nunca vira "sem vínculo"). */
export function parseVinculos(data: unknown): Map<string, VinculosUsuario> {
  const items = obj(data).items;
  if (!Array.isArray(items)) throw new Error(INVALIDA);
  const out = new Map<string, VinculosUsuario>();
  for (const raw of items) {
    const it = obj(raw);
    const user_id = uuid(it.user_id);
    if (out.has(user_id) || !Array.isArray(it.clientes)) throw new Error(INVALIDA);
    const clientes = it.clientes.map((r): VinculoCliente => {
      const c = obj(r);
      return { cliente_id: uuid(c.cliente_id), nome: texto(c.nome), principal: bool(c.principal), status_cliente: textoOuNull(c.status_cliente), vigente: bool(c.vigente) };
    });
    let parceiro: VinculoParceiro | null = null;
    if (it.parceiro !== null && it.parceiro !== undefined) {
      const p = obj(it.parceiro);
      parceiro = { partner_id: uuid(p.partner_id), razao_social: texto(p.razao_social), papel: textoOuNull(p.papel), ativo: bool(p.ativo) };
    }
    const parceiros_total = contagem(it.parceiros_total);
    if ((parceiro ? parceiros_total < 1 : parceiros_total !== 0)) throw new Error(INVALIDA);
    out.set(user_id, { user_id, clientes, parceiro, parceiros_total, fora_do_alcance: contagem(it.fora_do_alcance) });
  }
  return out;
}

export type EstadoVinculo =
  | { estado: "carregando" }
  | { estado: "erro" }
  | { estado: "nao_aplica" }
  | { estado: "sem_vinculo"; fora_do_alcance: number }
  | { estado: "com_vinculo"; resumo: string; detalhes: string[]; fora_do_alcance: number };

/** Estado exibível — carregando, erro e "sem vínculo" sempre distintos. */
export function estadoVinculo(
  tipo: TipoAcesso,
  q: { isLoading: boolean; isError: boolean; data?: Map<string, VinculosUsuario> },
  userId: string,
): EstadoVinculo {
  if (q.isError) return { estado: "erro" };
  if (q.isLoading || !q.data) return { estado: "carregando" };
  const v = q.data.get(userId);
  if (!v) return { estado: "erro" }; // usuário da página ausente na resposta: nunca simular vazio
  const temCliente = v.clientes.length > 0;
  const temParceiro = !!v.parceiro;
  if (tipo === "internal" && !temCliente && !temParceiro) return { estado: "nao_aplica" };
  if (!temCliente && !temParceiro) return { estado: "sem_vinculo", fora_do_alcance: v.fora_do_alcance };
  const detalhes: string[] = [];
  if (temParceiro) {
    const p = v.parceiro!;
    detalhes.push(`Parceiro: ${p.razao_social}${p.papel ? ` (${p.papel})` : ""}${p.ativo ? "" : " — inativo"}`);
    if (v.parceiros_total > 1) detalhes.push(`+${v.parceiros_total - 1} outro(s) vínculo(s) de parceiro`);
  }
  for (const c of v.clientes) {
    const flags = [c.principal ? "principal" : null, c.vigente ? null : "não vigente", c.status_cliente && c.status_cliente !== "ativo" ? `cliente ${c.status_cliente}` : null].filter(Boolean);
    detalhes.push(`Cliente: ${c.nome}${flags.length ? ` (${flags.join(", ")})` : ""}`);
  }
  const resumo = temParceiro
    ? v.parceiro!.razao_social
    : `${(v.clientes.find((c) => c.principal) ?? v.clientes[0]).nome}${v.clientes.length > 1 ? ` +${v.clientes.length - 1}` : ""}`;
  return { estado: "com_vinculo", resumo, detalhes, fora_do_alcance: v.fora_do_alcance };
}

/** Ajuda quando nenhum registro elegível aparece na busca do cadastro. */
export function ajudaSemElegiveis(kind: "b2b" | "producer", termo: string): string {
  if (termo.trim()) return "Nenhum resultado para esta busca. Confira o nome ou limpe a busca.";
  return kind === "b2b"
    ? "Nenhum parceiro B2B ativo da sua empresa está disponível. Cadastre ou reative o parceiro no módulo de Parceiros B2B e volte aqui."
    : "Nenhum cliente ativo da sua empresa está disponível. Cadastre ou ative o cliente em Clientes e volte aqui.";
}
