import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const path = (p: string) => resolve(process.cwd(), p);
const read = (p: string) => readFileSync(path(p), "utf8");
const exists = (p: string) => existsSync(path(p));

const REPORT_28A = "docs/auditorias/ar-bio-pos-catalogo-fase28a-mapa-proxima-frente.md";
const TEST_28A = "src/test/catalogo/catalogo-fase28a-pos-certificacao.test.ts";
const REPORT_27E = "docs/auditorias/catalogo-fase27e-certificacao-final.md";
const REPORT_28B = "docs/auditorias/estoque-fase28b-auditoria.md";

const MOTOR = "src/lib/estoque/motorEstoque.ts";
const RESERVA_CALC = "src/components/cockpit/reservaCalc.ts";
const ENTREGAS = "src/pages/Entregas.tsx";
const HOOK_ESTEIRA = "src/hooks/useEsteiraLaboratorio.ts";

describe("FASE 28B — certificação da Fase 28A", () => {
  it("artefatos da 28A existem", () => {
    expect(exists(REPORT_28A)).toBe(true);
    expect(exists(TEST_28A)).toBe(true);
    expect(exists(REPORT_27E)).toBe(true);
  });

  it("28A registra 27E CERTIFICADA e recomenda Estoque/Volumes", () => {
    const c = read(REPORT_28A);
    expect(c).toContain("27E CERTIFICADA");
    expect(c).toMatch(/ESTOQUE\/VOLUMES/i);
    expect(c).toMatch(/motor de estoque/i);
  });

  it("28A contém os prompts 28B, 28C e 28D", () => {
    const c = read(REPORT_28A);
    for (const fase of ["28B", "28C", "28D"]) expect(c).toContain(fase);
  });

  it("nenhuma migration nova além do baseline de hardening digest", () => {
    const migs = readdirSync(path("supabase/migrations")).filter((f) => f.endsWith(".sql")).sort();
    // H3: o baseline segue presente; migrations posteriores pertencem apenas
    // às fases de homologação (H1/H2/H3) e não a esta frente.
    expect(migs).toContain("20260905000000_hardening_digest_schema_v1.sql");
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
    ]);
    const foraDoPadrao = migs
      .filter((f: string) => f.slice(0, 14) > "20260905000000")
      .filter((f: string) => !/_h\d/.test(f) && !excecoesConhecidas.has(f));
    expect(foraDoPadrao).toEqual([]);
  });

  it("relatório 28B registra 28A CERTIFICADA", () => {
    expect(exists(REPORT_28B)).toBe(true);
    expect(read(REPORT_28B)).toContain("28A CERTIFICADA");
  });
});

describe("FASE 28B — contrato do motor de estoque", () => {
  it("motorEstoque.ts existe e usa a RPC canônica", () => {
    expect(exists(MOTOR)).toBe(true);
    expect(read(MOTOR)).toContain("rpc_estoque_operar_v1");
  });

  it("ações canônicas de estoque preservadas", () => {
    const c = read(MOTOR);
    for (const acao of [
      "reserva",
      "cancelamento_reserva",
      "expedicao",
      "entrega",
      "estorno_expedicao",
      "ajuste",
      "perda",
      "descarte",
      "devolucao",
    ]) {
      expect(c).toContain(`"${acao}"`);
    }
  });

  it("tipos de referência canônicos preservados", () => {
    const c = read(MOTOR);
    for (const ref of [
      "ordem_servico",
      "ordem_servico_onfarm",
      "partner_order",
      "envase",
      "lote",
      "manual",
      "sistema",
    ]) {
      expect(c).toContain(`"${ref}"`);
    }
  });

  it("motor expõe idempotência e mapeamento de erros ESTQ_*", () => {
    const c = read(MOTOR);
    expect(c).toContain("chaveIdempotencia");
    expect(c).toContain("p_idempotency_key");
    expect(c).toContain("mensagemErroEstoque");
    for (const cod of [
      "ESTQ_SALDO_INSUFICIENTE",
      "ESTQ_IDEMPOTENCY_CONFLITO",
      "ESTQ_UPDATE_DIRETO_BLOQUEADO",
      "ESTQ_MOTIVO_OBRIGATORIO",
    ]) {
      expect(c).toContain(cod);
    }
  });

  it("helpers puros de reserva permanecem exportados", () => {
    const c = read(RESERVA_CALC);
    for (const fn of ["fmtEmb", "computeTotals", "findInvalidIds", "clampQty"]) {
      expect(c).toContain(`export function ${fn}`);
    }
  });
});

describe("FASE 28B — componentes e integrações mapeados", () => {
  const arquivos = [
    "src/components/estoque/ReservaDialog.tsx",
    "src/components/estoque/ReservarEmbalagemEntregaDialog.tsx",
    "src/components/estoque/MotivoEmbalagemDialog.tsx",
    "src/components/estoque/EmbalagemMovimentacoesTimeline.tsx",
    "src/components/estoque/EstoqueBI.tsx",
    "src/components/cockpit/ReservarEstoqueDialog.tsx",
    "src/components/entregas/SeletorLoteEnvasado.tsx",
    "src/components/entregas/ConfirmarEntregaDialog.tsx",
    HOOK_ESTEIRA,
    ENTREGAS,
  ];

  it("todos os arquivos auditados existem", () => {
    expect(arquivos.filter((f) => !exists(f))).toEqual([]);
  });

  it("Entregas.tsx usa o motor canônico com chaves de idempotência", () => {
    const c = read(ENTREGAS);
    expect(c).toContain("operarEstoque");
    expect(c).toContain("entrega-expedicao");
    expect(c).toContain("entrega-estorno");
  });

  it("nenhum componente de estoque escreve direto em estoque_produto", () => {
    const dirs = ["src/components/estoque", "src/components/cockpit", "src/components/entregas"];
    const infratores: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(path(dir))) {
        if (!f.endsWith(".tsx") && !f.endsWith(".ts")) continue;
        const c = read(`${dir}/${f}`);
        if (/from\(\s*["']estoque_produto["']\s*\)[\s\S]{0,200}?\.(update|insert|delete|upsert)\(/.test(c)) {
          infratores.push(`${dir}/${f}`);
        }
      }
    }
    expect(infratores).toEqual([]);
  });

  it("diálogo de reserva do cockpit protege contra clique duplo", () => {
    expect(read("src/components/cockpit/ReservarEstoqueDialog.tsx")).toContain("submitting");
  });
});

describe("FASE 28B — contratos preservados (catálogo/portais/carrinho)", () => {
  it("rotas e RPCs de catálogo/parceiro intactas", () => {
    expect(read("src/hooks/usePartnerCatalog.ts")).toContain("get_partner_catalog_secure");
    expect(read("src/hooks/useCreatePartnerOrder.ts")).toContain("create_partner_order_secure");
    expect(read("src/pages/portal-parceiro/NovoPedido.tsx")).toContain("AddToCartDialog");
  });
});
