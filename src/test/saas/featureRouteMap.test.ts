import { describe, expect, it } from "vitest";
import { featureForPath, isPathEntitled } from "@/lib/saas/featureRouteMap";

describe("S3 — mapa rota → funcionalidade", () => {
  it("mapeia rotas de módulos e subrotas", () => {
    expect(featureForPath("/financeiro/receber")).toBe("contas_receber");
    expect(featureForPath("/fiscal/documentos")).toBe("emissao_nfe_nfse");
    expect(featureForPath("/visita-tecnica/abc")).toBe("visitas_tecnicas");
    expect(featureForPath("/estoque/embalagens")).toBe("estoque_embalagens");
  });
  it("não confunde prefixos parecidos e ignora rotas sem plano", () => {
    expect(featureForPath("/lotes-x")).toBeNull();
    expect(featureForPath("/clientes")).toBeNull();
    expect(featureForPath("/")).toBeNull();
  });
  it("carregamento e erro bloqueiam apenas rotas contratáveis", () => {
    expect(isPathEntitled("/fiscal/documentos", { status: "loading" })).toBe(false);
    expect(isPathEntitled("/fiscal/documentos", { status: "error" })).toBe(false);
    expect(isPathEntitled("/clientes", { status: "error" })).toBe(true);
  });
  it("legado e assinatura bloqueada falham fechado; Superadmin mantém gestão", () => {
    expect(isPathEntitled("/fiscal/documentos", { status: "legacy_unversioned" })).toBe(false);
    expect(isPathEntitled("/fiscal/documentos", { status: "blocked" })).toBe(false);
    expect(isPathEntitled("/fiscal/documentos", { status: "platform_superadmin" })).toBe(true);
    expect(isPathEntitled("/configuracoes", { status: "legacy_unversioned" })).toBe(true);
  });
  it("bloqueia rota fora do plano e libera a contratada", () => {
    const st = { status: "ready" as const, features: new Set(["contas_receber"]) };
    expect(isPathEntitled("/financeiro/receber", st)).toBe(true);
    expect(isPathEntitled("/financeiro/pagar", st)).toBe(false);
    expect(isPathEntitled("/clientes", st)).toBe(true);
  });
});
