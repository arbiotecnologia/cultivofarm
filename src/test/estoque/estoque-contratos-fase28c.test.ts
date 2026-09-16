import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const path = (p: string) => resolve(process.cwd(), p);
const read = (p: string) => readFileSync(path(p), "utf8");

const MOTOR = "src/lib/estoque/motorEstoque.ts";
const ENTREGAS = "src/pages/Entregas.tsx";
const HOOK_ESTEIRA = "src/hooks/useEsteiraLaboratorio.ts";
const DIALOG_RESERVA = "src/components/cockpit/ReservarEstoqueDialog.tsx";
const DIALOG_MOTIVO = "src/components/estoque/MotivoEmbalagemDialog.tsx";
const DIRS = ["src/components/estoque", "src/components/cockpit", "src/components/entregas"];

function arquivosDe(dir: string) {
  return readdirSync(path(dir))
    .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"))
    .map((f) => `${dir}/${f}`);
}

describe("FASE 28C — escrita de estoque somente server-side", () => {
  it("nenhum componente faz update/insert/delete/upsert direto em estoque_produto", () => {
    const infratores: string[] = [];
    for (const dir of DIRS) {
      for (const arquivo of arquivosDe(dir)) {
        const conteudo = read(arquivo);
        if (
          /from\(\s*["']estoque_produto["']\s*\)[\s\S]{0,300}?\.(update|insert|delete|upsert)\(/.test(
            conteudo,
          )
        ) {
          infratores.push(arquivo);
        }
      }
    }
    expect(infratores).toEqual([]);
  });

  it("nenhum componente faz escrita direta em estoque_movimentacoes", () => {
    const infratores: string[] = [];
    for (const dir of DIRS) {
      for (const arquivo of arquivosDe(dir)) {
        const conteudo = read(arquivo);
        if (
          /from\(\s*["']estoque_movimentacoes["']\s*\)[\s\S]{0,300}?\.(update|insert|delete|upsert)\(/.test(
            conteudo,
          )
        ) {
          infratores.push(arquivo);
        }
      }
    }
    expect(infratores).toEqual([]);
  });
});

describe("FASE 28C — contrato do motor e das entregas", () => {
  it("motorEstoque continua chamando rpc_estoque_operar_v1 com idempotência", () => {
    const c = read(MOTOR);
    expect(c).toContain("rpc_estoque_operar_v1");
    expect(c).toContain("p_idempotency_key");
    expect(c).toContain("export function chaveIdempotencia");
    expect(c).toContain("export async function operarEstoque");
  });

  it("Entregas.tsx mantém operarEstoque e as chaves canônicas", () => {
    const c = read(ENTREGAS);
    expect(c).toContain("operarEstoque");
    expect(c).toContain("entrega-expedicao");
    expect(c).toContain("entrega-estorno");
    expect(c).toContain("mensagemErroEstoque");
  });
});

describe("FASE 28C — proteções de interface", () => {
  it("ReservarEstoqueDialog previne clique duplo", () => {
    const c = read(DIALOG_RESERVA);
    expect(/submitting|isPending|isSubmitting/.test(c)).toBe(true);
    expect(c).toMatch(/disabled=\{[^}]*(submitting|isPending|isSubmitting)/);
  });

  it("MotivoEmbalagemDialog mantém validação de motivo curto", () => {
    const c = read(DIALOG_MOTIVO);
    expect(c).toContain("motivo.trim().length < 3");
  });

  it("helpers puros de reserva continuam isolados de I/O", () => {
    const c = read("src/components/cockpit/reservaCalc.ts");
    expect(c).not.toContain("@/integrations/supabase/client");
  });
});

describe("FASE 28C — risco A1 documentado e congelado", () => {
  it("useEsteiraLaboratorio continua usando reservar_estoque_item (sem alteração nesta fase)", () => {
    expect(read(HOOK_ESTEIRA)).toContain("reservar_estoque_item");
  });

  it("relatório 28B documenta os riscos A1 e A2", () => {
    const rel = "docs/auditorias/estoque-fase28b-auditoria.md";
    expect(existsSync(path(rel))).toBe(true);
    const c = read(rel);
    expect(c).toContain("A1 —");
    expect(c).toContain("A2 —");
  });

  it("relatório 28C existe e registra 28B CERTIFICADA", () => {
    const rel = "docs/auditorias/estoque-fase28c-blindagem.md";
    expect(existsSync(path(rel))).toBe(true);
    expect(read(rel)).toContain("28B CERTIFICADA");
  });

  it("nenhuma migration nova nesta frente", () => {
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
    ]);
    const foraDoPadrao = migs
      .filter((f: string) => f.slice(0, 14) > "20260905000000")
      .filter((f: string) => !/_h\d/.test(f) && !excecoesConhecidas.has(f));
    expect(foraDoPadrao).toEqual([]);
  });
});

describe("FASE 28C — contratos preservados fora do escopo", () => {
  it("carrinho, pedido B2B e catálogo intactos", () => {
    expect(read("src/hooks/useCreatePartnerOrder.ts")).toContain("create_partner_order_secure");
    expect(read("src/hooks/usePartnerCatalog.ts")).toContain("get_partner_catalog_secure");
    expect(read("src/pages/portal-parceiro/NovoPedido.tsx")).toContain("AddToCartDialog");
  });
});
