import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const receiptEdge = readFileSync(resolve(root, "supabase/functions/generate-financial-receipt/index.ts"), "utf8");
const reportEdge = readFileSync(resolve(root, "supabase/functions/generate-financial-report/index.ts"), "utf8");

describe("D51.5 P0-A — financeiro e Storage", () => {
  it("deriva o tenant no servidor e não aceita organization_id no recibo", () => {
    expect(receiptEdge).toContain('supabase.rpc("h15_actor_organization")');
    expect(receiptEdge).toContain('.eq("organization_id", organizationId)');
    expect(receiptEdge).not.toMatch(/body\?\.organization_id|body\.organization_id/);
  });

  it("valida recibo e cliente no mesmo tenant antes do arquivo", () => {
    expect(receiptEdge).toContain('.from("financial_receipts")');
    expect(receiptEdge).toContain('.from("clientes")');
    expect(receiptEdge).toContain('rec.customer_id && !customer');
    expect(receiptEdge).toContain('const issuedPath = `${organizationId}/');
  });

  it("não emite URL assinada (v95 status-bound)", () => {
    expect(receiptEdge).not.toContain("createSignedUrl");
  });

  it("exportação deriva tenant e grava em prefixo da organização", () => {
    expect(reportEdge).toContain('supabase.rpc("h15_actor_organization")');
    expect(reportEdge).toContain('const path = `${organizationId}/${userData.user.id}/');
    expect(reportEdge).not.toMatch(/body\?\.organization_id|body\.organization_id/);
  });
});