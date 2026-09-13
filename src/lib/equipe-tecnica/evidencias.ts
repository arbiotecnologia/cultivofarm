/**
 * Helpers puros da Equipe Técnica (/consultor-tecnico) para evidências,
 * acesso e atalhos de teclado.
 *
 * Contrato confirmado em `cultivofarm.types.ts`:
 * - as evidências das vistorias vivem em `registros_consultor_arquivos`
 *   (`id`, `registro_consultor_id`, `arquivo_path`, `arquivo_url`, `legenda`,
 *   `nome_arquivo`). A tabela `public.arquivos` NÃO possui `arquivo_path` nem
 *   relacionamento com `registros_consultor` — por isso não pode ser usada aqui.
 * - o bucket privado é `consultor-arquivos`; a URL efetiva deve vir sempre de
 *   signed URL quando existir `arquivo_path`.
 */

/** Campos realmente exibidos da tabela `profiles` (evita `select("*")`). */
export const PROFILE_FIELDS =
  "id, user_id, nome, email, ativo, avatar_url, created_at" as const;

/**
 * Papéis com acesso amplo real a clientes. Papéis técnicos
 * (`consultor_tecnico`, `tecnico_agronomo`) NÃO entram aqui: sem vínculo em
 * `user_clientes` eles não enxergam todos os clientes.
 */
export const PAPEIS_ACESSO_AMPLO = [
  "administrador",
  "gestor",
  "administrativo",
] as const;

export function temAcessoAmploClientes(role?: string | null): boolean {
  if (!role) return false;
  return (PAPEIS_ACESSO_AMPLO as readonly string[]).includes(role);
}

/** Remove acentuação, caixa e espaços das pontas. */
export function normalizarTexto(valor: unknown): string {
  if (typeof valor !== "string") return "";
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/** Remove ids repetidos/vazios antes de um `.in()`. */
export function idsUnicos(ids: Array<string | null | undefined>): string[] {
  return Array.from(new Set(ids.filter((v): v is string => !!v)));
}

export interface EvidenciaVistoria {
  id: string;
  arquivo_path?: string | null;
  arquivo_url?: string | null;
  legenda?: string | null;
  nome_arquivo?: string | null;
}

export type EstadoUrlEvidencia = "pronta" | "carregando" | "erro" | "indisponivel";

export interface UrlEvidencia {
  url: string | null;
  estado: EstadoUrlEvidencia;
}

/**
 * Resolução única e consistente da URL efetiva de uma evidência.
 *
 * Regra dura: quando existe `arquivo_path`, apenas a signed URL vale.
 * `arquivo_url` só é aceito em registro legado que realmente não tem path —
 * nunca como fallback de falha, para não mascarar erro nem tentar link expirado.
 */
export function resolverUrlEvidencia(
  arquivo: EvidenciaVistoria | null | undefined,
  signedUrls: Record<string, string>,
  opcoes?: { loading?: boolean; error?: unknown },
): UrlEvidencia {
  if (!arquivo) return { url: null, estado: "indisponivel" };

  const path = arquivo.arquivo_path?.trim();
  if (path) {
    const assinada = signedUrls[path];
    if (assinada) return { url: assinada, estado: "pronta" };
    if (opcoes?.error) return { url: null, estado: "erro" };
    if (opcoes?.loading) return { url: null, estado: "carregando" };
    return { url: null, estado: "erro" };
  }

  const legado = arquivo.arquivo_url?.trim();
  if (legado) return { url: legado, estado: "pronta" };
  return { url: null, estado: "indisponivel" };
}

const EXTENSAO_SEGURA = /^[a-z0-9]{1,5}$/;

/** Extensão real do arquivo, derivada de path/nome. Nunca força `.jpg`. */
export function extensaoEvidencia(arquivo: EvidenciaVistoria | null | undefined): string | null {
  const candidatos = [arquivo?.arquivo_path, arquivo?.nome_arquivo, arquivo?.arquivo_url];
  for (const c of candidatos) {
    if (typeof c !== "string" || !c) continue;
    const semQuery = c.split("?")[0];
    const base = semQuery.split("/").pop() ?? "";
    if (!base.includes(".")) continue;
    const ext = base.split(".").pop()?.toLowerCase() ?? "";
    if (EXTENSAO_SEGURA.test(ext)) return ext;
  }
  return null;
}

/** Nome de download preservando a extensão real do objeto. */
export function nomeDownloadEvidencia(
  arquivo: EvidenciaVistoria,
  vistoriaId: string,
  indice: number,
): string {
  const ext = extensaoEvidencia(arquivo);
  const legenda = normalizarTexto(arquivo.legenda)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .substring(0, 50);
  const base = `visita_${vistoriaId}_${indice + 1}${legenda ? `_${legenda}` : ""}`;
  return ext ? `${base}.${ext}` : base;
}

/** Limite prático de legenda (texto livre); mantém consistência da UI. */
export const LEGENDA_MAX = 500;

export interface LegendaNormalizada {
  valida: boolean;
  valor: string;
  mensagem?: string;
}

/** Normaliza a legenda sem inventar regra de schema: apenas trim e limite. */
export function normalizarLegenda(valor: string | null | undefined): LegendaNormalizada {
  const texto = (valor ?? "").replace(/\s+/g, " ").trim();
  if (texto.length > LEGENDA_MAX) {
    return {
      valida: false,
      valor: texto,
      mensagem: `A legenda deve ter no máximo ${LEGENDA_MAX} caracteres.`,
    };
  }
  return { valida: true, valor: texto };
}

/** Interpreta o retorno do update escopado: zero linha nunca é sucesso. */
export function conferirLinhaUnica(linhas: unknown[] | null | undefined): {
  ok: boolean;
  mensagem?: string;
} {
  const total = linhas?.length ?? 0;
  if (total === 1) return { ok: true };
  if (total === 0) {
    return {
      ok: false,
      mensagem:
        "Nenhum registro foi atualizado — a evidência não pertence a esta visita ou você não tem permissão.",
    };
  }
  return { ok: false, mensagem: "Atualização ambígua: mais de um registro afetado." };
}

const TAGS_EDITAVEIS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON", "OPTION"]);

/** Atalhos globais não podem disparar com foco em controle editável. */
export function deveIgnorarAtalho(alvo: EventTarget | null): boolean {
  const el = alvo as (HTMLElement & { isContentEditable?: boolean }) | null;
  if (!el || typeof el !== "object") return false;
  if (el.isContentEditable) return true;
  const tag = typeof el.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (TAGS_EDITAVEIS.has(tag)) return true;
  const role = typeof el.getAttribute === "function" ? el.getAttribute("role") : null;
  if (role && ["textbox", "combobox", "listbox", "searchbox"].includes(role)) return true;
  return false;
}

/** Estado do diálogo que precisa ser reiniciado ao trocar de consultor. */
export const ESTADO_DIALOGO_INICIAL = {
  showVistorias: false,
  selectedVistoria: null as unknown,
  selectedClienteFilter: "todos",
  zoomedImageIndex: null as number | null,
  selectedPhotos: [] as string[],
  focusedPhotoIndex: null as number | null,
  editingCaption: null as string | null,
  captionValue: "",
};
