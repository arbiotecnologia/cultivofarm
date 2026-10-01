/**
 * Identidade oficial do produto.
 *
 * Fonte única para nome, nome curto e slogan. Nomes históricos de documentos
 * já emitidos, migrations e auditorias NÃO são reescritos a partir daqui.
 */
export const APP_NAME = "Cultivo Farm" as const;
export const APP_SHORT_NAME = "Cultivo Farm" as const;
export const APP_SLOGAN = "Tecnologia que cultiva resultados" as const;

/** Título padrão de páginas/documentos gerados pelo sistema. */
export function brandTitle(section?: string): string {
  return section ? `${section} | ${APP_NAME}` : APP_NAME;
}

/**
 * Contato de suporte exibido em telas de bloqueio (onboarding etc.).
 * Configurável por VITE_SUPPORT_CONTACT (e-mail ou URL https). Sem valor
 * configurado, a interface mostra mensagem neutra — nunca um endereço fictício.
 */
export function supportContact(): { href: string; label: string } | null {
  const raw = String(import.meta.env.VITE_SUPPORT_CONTACT ?? "").trim();
  if (!raw) return null;
  if (/^https:\/\/[^\s]+$/i.test(raw)) return { href: raw, label: "Suporte" };
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) return { href: `mailto:${raw}`, label: "Suporte" };
  return null;
}
