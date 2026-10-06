import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { featureForPath, isPathEntitled } from "@/lib/saas/featureRouteMap";

const ready = (f: string[]) => ({ status: "ready" as const, features: new Set(f) });

describe("Gates de plano em portais especializados", () => {
  it("mapeia apenas correspondências inequívocas", () => {
    expect(featureForPath("/app/visita/123")).toBe("visitas_tecnicas");
    expect(featureForPath("/app/checkin/abc")).toBe("visitas_tecnicas");
    expect(featureForPath("/portal-parceiro/pedidos")).toBe("pedidos_b2b");
    expect(featureForPath("/portal-parceiro/novo")).toBe("pedidos_b2b");
    expect(featureForPath("/portal-parceiro/catalogo")).toBe("catalogo_precos");
    expect(featureForPath("/portal-parceiro/simulacoes-equipe")).toBe("simulacoes");
    expect(featureForPath("/portal-parceiro/fichas")).toBe("fichas_tecnicas");
    // Sem feature inequívoca: inalteradas
    for (const p of ["/app", "/app/perfil", "/app/catalogo", "/app/fazendas", "/portal-parceiro/dashboard", "/portal-parceiro/financeiro", "/portal-parceiro/perfil", "/portal"]) {
      expect(featureForPath(p)).toBeNull();
    }
  });

  it("matriz Base/Essencial/Gestão/Completo", () => {
    const base = ready(["visitas_tecnicas"]);
    const ess = ready(["catalogo_precos", "pedidos_b2b"]);
    expect(isPathEntitled("/app/visita/novo", base)).toBe(true);
    expect(isPathEntitled("/portal-parceiro/pedidos", base)).toBe(false);
    expect(isPathEntitled("/portal-parceiro/pedidos", ess)).toBe(true);
    expect(isPathEntitled("/portal-parceiro/simulador", ess)).toBe(false);
    expect(isPathEntitled("/app/visita/novo", ess)).toBe(false);
  });

  it("estados não prontos falham fechado em rotas mapeadas e preservam não mapeadas", () => {
    for (const s of ["loading", "error", "legacy_unversioned", "blocked", "no_subscription"] as const) {
      expect(isPathEntitled("/portal-parceiro/pedidos", { status: s })).toBe(false);
      expect(isPathEntitled("/portal-parceiro/dashboard", { status: s })).toBe(true);
    }
  });

  it("gate é aninhado dentro dos guards de vínculo/perfil (condição adicional)", () => {
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toMatch(/<TechnicalFeatureGuard \/>}>\s*<Route element={<EntitlementOutlet \/>}>/);
    expect(app).toMatch(/<B2BRouteGuard><PortalParceiroLayout \/><\/B2BRouteGuard>}>\s*<Route element={<EntitlementOutlet \/>}>/);
    const gate = readFileSync("src/components/guards/EntitlementOutlet.tsx", "utf8");
    expect(gate).toContain("isPathEntitled");
    expect(gate).not.toMatch(/roles?\.includes/);
  });
});
