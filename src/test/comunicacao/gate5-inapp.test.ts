import { describe, expect, it } from "vitest";
import { classifyDeepLink, CENTRAL_NOTIFICACOES_ROUTE } from "@/lib/notificacoes/deepLinkAllowlist";
import { dedupAndSort, parseCompositeId, type NotificacaoUnificada } from "@/hooks/useNotificacoesUnificadas";

describe("Gate 5 · deep link allowlist", () => {
  it("rejeita links externos, javascript: e protocol-relative", () => {
    for (const bad of [
      "http://evil.com",
      "https://evil.com/x",
      "javascript:alert(1)",
      "mailto:a@b",
      "//evil.com",
      "app://x",
      "\\evil",
      "  ",
      "",
      null,
      undefined,
    ]) {
      const r = classifyDeepLink(bad as string, ["administrador"]);
      expect(r.ok).toBe(false);
    }
  });

  it("rejeita path traversal", () => {
    const r = classifyDeepLink("/solicitacoes/../secret", ["administrador"]);
    expect(r.ok).toBe(false);
  });

  it("administrador aceita qualquer path interno", () => {
    const r = classifyDeepLink("/qualquer/rota/existente?x=1#z", ["administrador"]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.safePath).toBe("/qualquer/rota/existente?x=1#z");
  });

  it("perfil sem acesso vê unauthorized, com fallback à central", () => {
    const r = classifyDeepLink("/financeiro/dre", ["tecnico_agronomo"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unauthorized");
    expect(CENTRAL_NOTIFICACOES_ROUTE).toBe("/notificacoes");
  });

  it("perfil autorizado navega para prefixo permitido", () => {
    const r = classifyDeepLink("/solicitacoes/abc-123", ["tecnico_agronomo"]);
    expect(r.ok).toBe(true);
  });

  it("cliente_produtor só acessa /portal e /app", () => {
    const good = classifyDeepLink("/portal/entregas", ["cliente_produtor"]);
    const bad = classifyDeepLink("/financeiro/dre", ["cliente_produtor"]);
    expect(good.ok).toBe(true);
    expect(bad.ok).toBe(false);
  });

  it("perfil vazio nega tudo (exceto admin)", () => {
    const r = classifyDeepLink("/notificacoes", []);
    expect(r.ok).toBe(false);
  });
});

describe("Gate 5 · unificação e dedup", () => {
  it("parseCompositeId lida com prefixo op/portal e rejeita inválidos", () => {
    expect(parseCompositeId("op:abc")).toEqual({ origem: "operacional", rawId: "abc" });
    expect(parseCompositeId("portal:xyz-1")).toEqual({ origem: "portal", rawId: "xyz-1" });
    expect(parseCompositeId("outro:1")).toBeNull();
    expect(parseCompositeId("op:")).toBeNull();
  });

  it("dedupAndSort preserva ordem descendente por data e remove duplicados dentro de 5s", () => {
    const now = Date.now();
    const items: NotificacaoUnificada[] = [
      {
        id: "op:1",
        origem: "operacional",
        tipo: "nova_solicitacao",
        titulo: "T",
        mensagem: "M",
        link: null,
        lido: false,
        created_at: new Date(now).toISOString(),
      },
      {
        id: "op:2",
        origem: "operacional",
        tipo: "nova_solicitacao",
        titulo: "T",
        mensagem: "M",
        link: null,
        lido: true,
        created_at: new Date(now + 1000).toISOString(),
      },
      {
        id: "portal:3",
        origem: "portal",
        tipo: "informativo",
        titulo: "Outro",
        mensagem: null,
        link: null,
        lido: false,
        created_at: new Date(now + 10_000).toISOString(),
      },
    ];
    const sorted = dedupAndSort(items);
    expect(sorted.length).toBe(2);
    expect(sorted[0].origem).toBe("portal"); // mais recente primeiro
    // Deve preservar o item não-lido no bucket em vez do lido.
    const opBucket = sorted.find((s) => s.origem === "operacional");
    expect(opBucket?.lido).toBe(false);
  });

  it("dedupAndSort não colapsa eventos diferentes", () => {
    const t = Date.now();
    const items: NotificacaoUnificada[] = [
      { id: "op:1", origem: "operacional", tipo: "a", titulo: "X", mensagem: null, link: null, lido: false, created_at: new Date(t).toISOString() },
      { id: "op:2", origem: "operacional", tipo: "b", titulo: "Y", mensagem: null, link: null, lido: false, created_at: new Date(t).toISOString() },
    ];
    expect(dedupAndSort(items).length).toBe(2);
  });
});
