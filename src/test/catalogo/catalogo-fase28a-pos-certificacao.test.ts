import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const path = (p: string) => resolve(process.cwd(), p);
const read = (p: string) => readFileSync(path(p), "utf8");
const exists = (p: string) => existsSync(path(p));

const REPORT_27E = "docs/auditorias/catalogo-fase27e-certificacao-final.md";
const TEST_27E = "src/test/catalogo/catalogo-fase27e-certificacao-final.test.ts";
const REPORT_28A = "docs/auditorias/ar-bio-pos-catalogo-fase28a-mapa-proxima-frente.md";
const APP = "src/App.tsx";
const NAV = "src/config/navigation.ts";
const HOOK_PARTNER = "src/hooks/usePartnerCatalog.ts";
const HOOK_PARTNER_TEC = "src/hooks/usePartnerCatalogTecnico.ts";
const HOOK_ORDER = "src/hooks/useCreatePartnerOrder.ts";
const NOVO_PEDIDO = "src/pages/portal-parceiro/NovoPedido.tsx";
const MOBILE = "src/pages/app/MobileCatalogoTecnico.tsx";

describe("FASE 28A — artefatos de certificação presentes", () => {
  it("relatório e teste da 27E existem", () => {
    expect(exists(REPORT_27E)).toBe(true);
    expect(exists(TEST_27E)).toBe(true);
  });

  it("relatório 27E conclui a frente como apta", () => {
    expect(read(REPORT_27E)).toMatch(/FINALIZADA E APTA/);
  });

  it("relatório 28A existe e registra 27E CERTIFICADA", () => {
    expect(exists(REPORT_28A)).toBe(true);
    expect(read(REPORT_28A)).toContain("27E CERTIFICADA");
  });

  it("relatório 28A recomenda uma próxima frente e prompts futuros", () => {
    const c = read(REPORT_28A);
    expect(c).toMatch(/Frente recomendada/i);
    for (const fase of ["28B", "28C", "28D"]) expect(c).toContain(fase);
  });
});

describe("FASE 28A — rotas do Catálogo preservadas", () => {
  it("/base-tecnica e /protocolos continuam registrados", () => {
    const c = read(APP);
    expect(c).toMatch(/path="\/base-tecnica"/);
    expect(c).toMatch(/path="\/protocolos"[\s\S]{0,120}to="\/base-tecnica"/);
  });

  it("navegação mantém o rótulo Catálogo e a rota legada", () => {
    const c = read(NAV);
    expect(c).toContain('label: "Catálogo"');
    expect(c).toContain('legacyRoutes: ["/protocolos", "/comercial/catalogo"]');
  });
});

describe("FASE 28A — contratos B2B preservados", () => {
  it("hooks de catálogo do parceiro seguem nas RPCs seguras", () => {
    expect(read(HOOK_PARTNER)).toContain("get_partner_catalog_secure");
    expect(read(HOOK_PARTNER_TEC)).toContain("get_partner_catalog_tecnico_secure");
  });

  it("useCreatePartnerOrder segue em create_partner_order_secure com unidade_medida", () => {
    const c = read(HOOK_ORDER);
    expect(c).toContain("create_partner_order_secure");
    expect(c).toContain("unidade_medida");
  });

  it("NovoPedido mantém AddToCartDialog e as unidades canônicas", () => {
    const c = read(NOVO_PEDIDO);
    expect(c).toContain("AddToCartDialog");
    expect(c).toContain("hectare");
    expect(c).toContain("dose_100ml");
  });
});

describe("FASE 28A — mobile/produtor sem exposição interna", () => {
  it("MobileCatalogoTecnico não expõe custo interno nem auditoria", () => {
    const c = read(MOBILE);
    expect(c).not.toContain("catalog_technical_audit_logs");
    expect(c).not.toMatch(/custo_interno|custo interno/i);
    expect(c).not.toMatch(/auditoria/i);
  });
});

describe("FASE 28A — nenhuma migration nova nesta fase", () => {
  it("a última migration segue sendo o hardening do digest", () => {
    const migrations = readdirSync(path("supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort();
    // H3: baseline preservado; posteriores apenas das fases de homologação.
    expect(migrations).toContain("20260905000000_hardening_digest_schema_v1.sql");
    // Exceção conhecida: migration pendente do simulador comercial, com gate
    // NO-GO registrado em restoration/commercial-package/verification.md.
    const excecoesConhecidas = new Set([
      "20261027000000_commercial_simulator_hardening_v1.sql",
      // Fase C1 — migrations da redução da base reconciliadas e registradas
      // no histórico oficial do banco canônico (schema_migrations).
      "20261029000000_fiscal_base_reduction_v1.sql",
      "20261030000000_fiscal_base_reduction_audit_v1.sql",
      // Fase de homologação fiscal — trava de segurança do preview de transporte.
      "20261034000000_fiscal_transport_preview_safety.sql",
      // Gate S0→S1 — hardening de autorização (revogações de EXECUTE + WITH CHECK
      // nas policies de UPDATE de profiles). Sem alteração de dados.
      "20260922152558_478f5ed2-5b4b-45b3-9e48-9d7131c05f49.sql",
      // Fase S1 — núcleo de dados SaaS (tabelas saas_*/organization_subscriptions).
      // Não altera nenhuma tabela de negócio existente.
      "20260922154526_3c081c07-9ce8-4f78-8355-a660aef594b4.sql",
      // Fase Superadmin — papel de plataforma SaaS: enum, trava de concessão
      // e correção de guards/policies. Nenhum usuário criado, nenhum dado alterado.
      "20260922160033_90eac344-6cbb-45dc-8b61-275cbc8d11cc.sql",
      "20260922160218_b19bd8e6-cb90-4d27-805e-c97272039918.sql",
      "20260922160417_ea6c34e3-2ae3-44fb-9777-909e5cd46774.sql",
      "20260922160736_29af83f9-2f0d-4770-91d4-264de788ccc5.sql",
      // Home provisória do superadmin — apenas policy de leitura nas tabelas SaaS.
      "20260922211137_7eae146c-4343-4633-a7ea-844c9e857ee6.sql",
    ]);
    const foraDoPadrao = migrations
      .filter((f: string) => f.slice(0, 14) > "20260905000000")
      .filter((f: string) => !/_h\d/.test(f) && !excecoesConhecidas.has(f));
    expect(foraDoPadrao).toEqual([]);
  });
});
