import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { montarDadosEntrega, validarRespostaCriarEntrega } from "@/lib/entregas/payloadEntrega";

describe("Especificação offline de criação OS/entrega — não prova RPC/JWT", () => {
  it("cadastro manual continua INSERT existente, sem inventar rpc_criar_os", () => {
    const source = readFileSync("src/pages/OrdensServico.tsx", "utf8");
    expect(source).toMatch(/from\("ordens_servico"\)\s*\.insert/);
    expect(source).not.toContain('rpc("rpc_criar_os"');
  });
  it("assinatura capturada de criação entrega é preservada, não implica EXECUTE", () => {
    const source = readFileSync("scripts/os-delivery-reopening-20261027/live/public.rpc_cockpit_criar_entrega_v1.sql.review", "utf8");
    expect(source).toContain("rpc_cockpit_criar_entrega_v1(p_os_id uuid, p_origem text, p_estoque_produto_id uuid, p_quantidade numeric, p_dados jsonb");
  });
  it("volume/status não viram autoridade em p_dados", () => {
    const payload = montarDadosEntrega({ quantidade_entregue: 8, volume_entregue_ml: 9000, status: "entregue", motorista: " Nome " });
    expect(payload).not.toHaveProperty("quantidade_entregue");
    expect(payload).not.toHaveProperty("volume_entregue_ml"); expect(payload).not.toHaveProperty("status");
    expect(payload.motorista).toBe("Nome");
  });
  it("criação sem recibo não é sucesso; replay só com envelope existente", () => {
    expect(() => validarRespostaCriarEntrega({ success: true })).toThrow();
    expect(() => validarRespostaCriarEntrega({ error: null })).toThrow();
    expect(validarRespostaCriarEntrega({ success: true, entrega_id: "22222222-2222-4222-8222-222222222222", replay: true }).replay).toBe(true);
  });
  it("release composto permanece barreira, não altera estado por estes testes", () => {
    const source = readFileSync("scripts/delivery-stock-release-20261027/release.sql.review", "utf8");
    expect(source).toMatch(/RAISE EXCEPTION/i);
  });
});