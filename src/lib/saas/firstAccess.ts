/** Versão do fluxo de primeiro acesso (cliente) — útil para conferir o bundle ativo. */
export const FIRST_ACCESS_CLIENT_VERSION = "fa-3";

/** Mesma política validada no servidor: 8–128 caracteres, letra e dígito. */
export function senhaForte(s: string): boolean {
  return s.length >= 8 && s.length <= 128 && /[A-Za-z]/.test(s) && /\d/.test(s);
}

export const REGRA_SENHA = "Use de 8 a 128 caracteres, com pelo menos uma letra e um número.";

export interface FalhaPrimeiroAcesso {
  error?: string;
  etapa?: string;
  codigo?: string | null;
}

/**
 * Extrai o corpo sanitizado ({ error, etapa, codigo }) de um erro do
 * `functions.invoke`. Nunca lança; aceita corpo já consumido.
 */
export async function lerFalhaPrimeiroAcesso(error: unknown): Promise<FalhaPrimeiroAcesso | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ctx = (error as any)?.context;
  if (!ctx) return null;
  try {
    const res: Response = typeof ctx.clone === "function" ? ctx.clone() : ctx;
    const texto = typeof res.text === "function" ? await res.text() : "";
    if (!texto) return null;
    const obj = JSON.parse(texto);
    if (!obj || typeof obj !== "object") return null;
    return {
      error: typeof obj.error === "string" ? obj.error.slice(0, 300) : undefined,
      etapa: typeof obj.etapa === "string" ? obj.etapa.slice(0, 40) : undefined,
      codigo: obj.codigo == null ? null : String(obj.codigo).slice(0, 40),
    };
  } catch {
    return null;
  }
}

export function mensagemFalhaPrimeiroAcesso(
  detalhe: FalhaPrimeiroAcesso | null,
  status?: number | null,
): string {
  const base = detalhe?.error ?? "Não foi possível salvar a nova senha. Tente novamente.";
  if (detalhe?.etapa) {
    return `${base} (ref.: ${detalhe.etapa}${detalhe.codigo ? `/${detalhe.codigo}` : ""})`;
  }
  return status ? `${base} (ref.: http/${status})` : base;
}
