import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
// Estático: o painel lança o erro RPC antes de qualquer sucesso/invalidação; react-query sem retry de mutation por padrão.
const src = readFileSync("src/components/financeiro/DocumentosPanel.tsx", "utf8");
const remove = src.slice(src.indexOf("const remove = useMutation"), src.indexOf("const isStaff"));
describe("rpc_financial_document_soft_delete PT409/PT404 — cliente", () => {
  it("erro é lançado (sem checar código) antes de sucesso", () => {
    expect(remove).toMatch(/if \(error\) throw error;/);
    expect(remove.indexOf("throw error")).toBeLessThan(remove.indexOf("Documento removido"));
    expect(remove).not.toMatch(/retry\s*:/);
    expect(remove).not.toMatch(/40001|P0002|PT409|PT404/);
  });
  it("erro mostra mensagem só no contexto atual", () => {
    expect(remove).toMatch(/onError: \(e: Error, \{ current \}\) => \{ if \(current\(\)\) toast\.error\(e\.message\); \}/);
  });
});
