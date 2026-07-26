/**
 * Biblioteca compartilhada de renderização de templates.
 * - Placeholders {{var}} apenas de variáveis whitelisted.
 * - Escaping HTML para canais que renderizam HTML (email).
 * - Sem execução de JS; sem URLs externas; sem HTML complexo.
 * - Limite de tamanho de saída.
 */

export type Canal = "email" | "whatsapp" | "in_app" | "push";

export interface TemplateInput {
  canal: Canal;
  assunto?: string | null;
  corpo: string;
  variaveisPermitidas: string[];
}

export interface RenderInput {
  variaveis: Record<string, unknown>;
  /** força escape HTML mesmo em texto (padrão: true para email) */
  escapeHtml?: boolean;
  /** limite bruto de caracteres da saída */
  maxOutputChars?: number;
}

export interface RenderResult {
  assunto?: string;
  corpo: string;
  missing: string[];
}

export class TemplateRenderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "VARIAVEL_NAO_PERMITIDA"
      | "PLACEHOLDER_INVALIDO"
      | "SAIDA_MUITO_LONGA"
      | "HTML_PERIGOSO",
  ) {
    super(message);
    this.name = "TemplateRenderError";
  }
}

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,63})\s*\}\}/g;
const DEFAULT_LIMIT = 30_000;
const DANGEROUS_HTML = /<\s*(script|iframe|object|embed|link|meta|style|form)\b/i;

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderOne(
  raw: string,
  variaveis: Record<string, unknown>,
  permitidas: Set<string>,
  escape: boolean,
  missing: Set<string>,
): string {
  return raw.replace(PLACEHOLDER_RE, (_match, name: string) => {
    if (!permitidas.has(name)) {
      throw new TemplateRenderError(
        `variável não permitida: ${name}`,
        "VARIAVEL_NAO_PERMITIDA",
      );
    }
    const raw = variaveis[name];
    if (raw === undefined || raw === null) {
      missing.add(name);
      return "";
    }
    const asString = String(raw);
    return escape ? escapeHtml(asString) : asString;
  });
}

export function renderTemplate(
  template: TemplateInput,
  input: RenderInput,
): RenderResult {
  const permitidas = new Set(template.variaveisPermitidas);
  const escape =
    input.escapeHtml ?? (template.canal === "email");
  const missing = new Set<string>();
  const limit = input.maxOutputChars ?? DEFAULT_LIMIT;

  if (DANGEROUS_HTML.test(template.corpo) || (template.assunto && DANGEROUS_HTML.test(template.assunto))) {
    throw new TemplateRenderError(
      "template contém HTML potencialmente perigoso",
      "HTML_PERIGOSO",
    );
  }

  // Detecta placeholders com sintaxe inválida antes da substituição
  if (/\{\{[^}]*[^a-zA-Z0-9_\s{}][^}]*\}\}/.test(template.corpo)) {
    throw new TemplateRenderError(
      "placeholder com sintaxe inválida",
      "PLACEHOLDER_INVALIDO",
    );
  }

  const corpo = renderOne(template.corpo, input.variaveis, permitidas, escape, missing);
  const assunto = template.assunto
    ? renderOne(template.assunto, input.variaveis, permitidas, escape, missing)
    : undefined;

  const total = (assunto?.length ?? 0) + corpo.length;
  if (total > limit) {
    throw new TemplateRenderError(
      `saída excede ${limit} caracteres`,
      "SAIDA_MUITO_LONGA",
    );
  }

  return { assunto, corpo, missing: Array.from(missing) };
}
