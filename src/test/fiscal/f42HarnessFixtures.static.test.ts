/**
 * Regressão estática do kit F4.2.
 *
 * Contrato real do banco (auditado em supabase/migrations):
 *   rpc_fiscal_calculate_invoice_v1 e rpc_fiscal_reserve_nfe_number_v1
 *   abortam com FISCAL_INVOICE_NOT_DRAFT quando fiscal_invoices.status <> 'DRAFT'.
 *
 * Este teste falha se qualquer fixture fiscal de cálculo/reserva voltar a ser
 * criada fora de DRAFT, ou se as provas de DRAFT sumirem do setup/verify.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../../restoration/fase-f4-2");
const read = (f: string) => readFileSync(resolve(root, f), "utf8");

const setup = read("10-setup.sql");
const verify = read("30-verify.sql");

/** Extrai o literal de status de cada INSERT em public.fiscal_invoices. */
function invoiceStatuses(sql: string): string[] {
  const out: string[] = [];
  const re = /INSERT INTO public\.fiscal_invoices\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\);/g;
  for (let m = re.exec(sql); m; m = re.exec(sql)) {
    const cols = m[1].split(",").map((c) => c.trim().toLowerCase());
    const vals = m[2].split(",").map((v) => v.trim());
    const i = cols.indexOf("status");
    expect(i, "INSERT em fiscal_invoices sem coluna status explicita").toBeGreaterThanOrEqual(0);
    out.push(vals[i].replace(/'/g, ""));
  }
  return out;
}

describe("F4.2 — fixtures fiscais devem nascer em DRAFT", () => {
  it("todo INSERT sintetico em fiscal_invoices usa status DRAFT", () => {
    const statuses = invoiceStatuses(setup);
    expect(statuses.length).toBeGreaterThanOrEqual(2);
    for (const s of statuses) expect(s).toBe("DRAFT");
  });

  it("nenhum status PENDING sobrevive no setup do harness", () => {
    expect(setup).not.toMatch(/'PENDING'/);
  });

  it("setup aborta fail-closed se alguma fixture ficar fora de DRAFT", () => {
    expect(setup).toMatch(/F42_SETUP: fixtures fiscais devem nascer em DRAFT/);
  });

  it("verify possui gate de DRAFT para as fixtures da tag", () => {
    expect(verify).toMatch(/G17 FAIL: % documento\(s\) sinteticos fora de DRAFT/);
  });
});
