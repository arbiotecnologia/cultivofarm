/**
 * Auditoria 06/11/2026 — pedido pelo parceiro B2B (AR Bio, comprador fictício).
 * Caracteriza o estado ATUAL dos contratos de frontend/tipos gerados. Estes testes
 * NÃO provam JWT/RLS nem estado hospedado; quando um contrato novo for instalado e
 * os tipos regenerados, as asserções "BLOCKED" devem falhar e ser revisadas.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readOwnerOrderCapability, ownerOrderRoute } from "@/lib/comercial/ownerOrderAccess";

const types = readFileSync(resolve(__dirname, "../../integrations/supabase/types.ts"), "utf8");
const novoPedido = readFileSync(resolve(__dirname, "../../pages/portal-parceiro/NovoPedido.tsx"), "utf8");

function rpcBlock(name: string): string {
  const start = types.indexOf(`      ${name}: {`);
  expect(start, `RPC ${name} ausente nos tipos`).toBeGreaterThan(-1);
  const end = types.indexOf("\n      }\n", start);
  return types.slice(start, end);
}

describe("B1 — capacidade de criação do pedido (gate servidor, fail-closed)", () => {
  it("abre somente com contrato exato C2_OWNER_ORDER_V1 e order_create true", () => {
    expect(readOwnerOrderCapability({ contract: "C2_OWNER_ORDER_V1", order_create: true })).toBe(true);
    for (const raw of [null, undefined, {}, [], { contract: "C2_OWNER_ORDER_V1" },
      { contract: "C2_OWNER_ORDER_V1", order_create: false }, { contract: "C2_OWNER_ORDER_V1", order_create: "true" },
      { contract: "OUTRO", order_create: true }]) {
      expect(readOwnerOrderCapability(raw)).toBe(false);
    }
  });
  it("carrinho exige também a rota exata e a feature pedidos_b2b", () => {
    expect(ownerOrderRoute("/portal-parceiro/catalogo", true, new Set(["pedidos_b2b"]))).toBe(true);
    expect(ownerOrderRoute("/portal-parceiro/catalogo", true, new Set())).toBe(false);
    expect(ownerOrderRoute("/portal-parceiro/catalogo", false, new Set(["pedidos_b2b"]))).toBe(false);
    expect(ownerOrderRoute("/portal-parceiro/novo", true, new Set(["pedidos_b2b"]))).toBe(false);
  });
});

describe("B2 — sólidos por embalagem inteira (BLOCKED: contrato de pedido ausente)", () => {
  it("create/simulate não aceitam embalagem nem preço por embalagem", () => {
    for (const rpc of ["create_partner_order_secure", "simulate_b2b_payment_plan_secure"]) {
      const block = rpcBlock(rpc);
      expect(block).not.toMatch(/packaging/);
      expect(block).not.toMatch(/unidade_conteudo/);
    }
  });
  it("NovoPedido: líquido segue volume_ml × litro; embalagem só pelo candidato confirmado (B2B_PARTNER_PACKAGING_ORDER_V1)", () => {
    expect(novoPedido).toMatch(/volume_ml \/ 1000/);
    // Ainda BLOCKED em produção: o leitor/linha de embalagem só abre com o contrato instalado e confirmado.
    expect(novoPedido).toContain("usePartnerPackagingOffers(isSimulationMode ? null : partner?.id)");
    expect(novoPedido).toContain('packagingOffers.data?.state === "available"');
    expect(novoPedido).not.toMatch(/solid_pack/);
  });
  it("o cadastro de apresentação sólida existe no catálogo (não é o bloqueio)", () => {
    expect(types).toMatch(/solid_pack_offer_save_v1: \{/);
    expect(types).toMatch(/product_packagings: \{/);
    expect(types).toMatch(/peso_liquido_kg: number/);
  });
});

describe("B3 — meio de pagamento escolhido pelo comprador (BLOCKED)", () => {
  it("pedido/simulação recebem só a condição comercial, sem meio de pagamento", () => {
    for (const rpc of ["create_partner_order_secure", "simulate_b2b_payment_plan_secure"]) {
      expect(rpcBlock(rpc)).not.toMatch(/payment_method/);
    }
    expect(rpcBlock("rpc_b2b_list_selectable_payment_plans")).not.toMatch(/payment_method/);
  });
});
