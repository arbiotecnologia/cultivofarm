/**
 * Gate 5 — allowlist de deep links para notificações.
 *
 * Regra: qualquer link vindo de comunicacao / notificacoes_operacionais / portal_notificacoes
 * é considerado NÃO CONFIÁVEL. Antes de navegar precisamos garantir que:
 *   (a) o path pertence a um prefixo conhecido da app; e
 *   (b) o perfil do usuário tem acesso a esse prefixo.
 *
 * Não usamos `new URL(link)` porque links devem ser relativos internos.
 * Rejeitamos qualquer coisa com esquema, host ou `..`.
 */

export type NotificacaoDeepLinkStatus =
  | { ok: true; safePath: string }
  | { ok: false; reason: "invalid" | "unauthorized" };

// Prefixos internos permitidos, por perfil (subset — evita ampliar acesso sem intenção).
const ROLE_ALLOWED_PREFIXES: Record<string, string[]> = {
  administrador: ["/"], // administrador tem toda a app; usamos "/" como wildcard
  gestor: [
    "/solicitacoes", "/ordens-servico", "/painel", "/estoque", "/faturamento",
    "/financeiro", "/executivo", "/comunicacao", "/entregas", "/pedidos-b2b",
    "/notificacoes", "/agenda",
  ],
  tecnico_agronomo: [
    "/solicitacoes", "/visita", "/agenda", "/fluxo-tecnico", "/notificacoes",
    "/clientes", "/fazendas", "/talhoes",
  ],
  consultor_tecnico: [
    "/solicitacoes", "/visita", "/agenda", "/fluxo-tecnico", "/notificacoes",
    "/clientes", "/fazendas", "/talhoes", "/consultor",
  ],
  producao: ["/ordens-servico", "/lotes", "/cq", "/envase", "/estoque", "/notificacoes"],
  operador_onfarm: ["/ordens-servico", "/notificacoes"],
  administrativo: ["/ordens-servico", "/entregas", "/notificacoes"],
  aplicador: ["/aplicacoes", "/notificacoes", "/app"],
  financeiro: ["/financeiro", "/faturamento", "/notificacoes"],
  gestor_comercial: ["/comercial", "/pedidos-b2b", "/notificacoes"],
  parceiro_b2b: ["/portal-parceiro", "/notificacoes"],
  parceiro_b2b_tecnico: ["/portal-parceiro", "/notificacoes"],
  cliente_produtor: ["/portal", "/app", "/notificacoes"],
};

const CENTRAL_FALLBACK = "/notificacoes";

function normalizeCandidate(link: string | null | undefined): string | null {
  if (typeof link !== "string") return null;
  const trimmed = link.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null; // esquema (http:, javascript:, mailto:, etc.)
  if (trimmed.startsWith("//")) return null; // protocol-relative
  if (!trimmed.startsWith("/")) return null; // deve ser absoluto interno
  if (trimmed.includes("\\")) return null;
  const [pathAndQuery] = trimmed.split("#");
  const [pathname] = pathAndQuery.split("?");
  if (pathname.split("/").some((seg) => seg === "..")) return null;
  return trimmed;
}

export function classifyDeepLink(
  link: string | null | undefined,
  roles: readonly string[],
): NotificacaoDeepLinkStatus {
  const safe = normalizeCandidate(link);
  if (!safe) return { ok: false, reason: "invalid" };

  const path = safe.split("?")[0].split("#")[0];
  const perfil = roles ?? [];
  if (perfil.includes("administrador")) return { ok: true, safePath: safe };

  for (const role of perfil) {
    const allowed = ROLE_ALLOWED_PREFIXES[role] ?? [];
    for (const prefix of allowed) {
      if (prefix === "/") return { ok: true, safePath: safe };
      if (path === prefix || path.startsWith(prefix + "/")) {
        return { ok: true, safePath: safe };
      }
    }
  }
  return { ok: false, reason: "unauthorized" };
}

export const CENTRAL_NOTIFICACOES_ROUTE = CENTRAL_FALLBACK;
