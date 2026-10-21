import { readFileSync } from "node:fs";
import ts from "typescript";
import { expect, it } from "vitest";
import { corsHeadersFor, handlePreflight, isTrustedOrigin } from "../../../supabase/functions/_shared/comunicacao/cors";
const candidate = readFileSync("scripts/receipt-cancel-currency-20261021/edge-layout-review/index.ts.review", "utf8");
const v93 = readFileSync("scripts/receipt-cancel-currency-20261021/edge-review/index.ts.review", "utf8");
const runtime = readFileSync("supabase/functions/generate-financial-receipt/index.ts", "utf8");
it("runtime canônico é a v95 byte-exata (edge-layout-review)", () => { expect(runtime).toBe(candidate); });
const org = "007bb519-cba0-4704-be2c-cb93ad010048";
const id = "00000000-0000-4000-8000-000000000002";
// Width-proportional fake font: 0.55em per char, throws on chars outside WinAnsi-like range.
const font = (name: string) => ({ name, widthOfTextAtSize: (t: string, s: number) => {
  if ([...t].some(c => c.codePointAt(0)! > 0x2122)) throw new Error("unencodable"); return t.length * s * 0.55; } });
async function render(source: string, status: string, reason: string, description: string) {
  const pages: { texts: { text: string; x: number; size: number; font: any }[] }[] = []; const uploads: string[] = [];
  const pdf = { create: async () => ({ embedFont: async (n: string) => font(n),
    addPage: () => { const p = { texts: [] as any[] }; pages.push(p);
      return { drawText: (text: string, o: any) => p.texts.push({ text, ...o }), drawLine() {}, drawRectangle() {} }; },
    save: async () => new Uint8Array([1]) }) };
  let reads = 0;
  const rec = { id, organization_id: org, receipt_number: "REC-2026-000002", receipt_year: 2026, customer_id: null, amount: 1,
    issued_at: "2026-10-21T12:00:00Z", payment_date: "2026-10-21", status, cancel_reason: reason, description, authenticity_code: "A", public_verification_token: "t" };
  const q: any = { eq: () => q, select: () => q, maybeSingle: async () => ({ data: reads++ === 0 ? rec : { status }, error: null }),
    update: () => { const u: any = { eq: () => u, then: (r: any) => r({ error: null }) }; return u; } };
  const client = { from: () => q, auth: { getUser: async () => ({ data: { user: { id: "actor", email: "a@example.invalid" } } }) },
    rpc: async () => ({ data: org, error: null }), storage: { from: () => ({ upload: async (p: string) => { uploads.push(p); return { error: null }; } }) } };
  let handler: any;
  const js = ts.transpileModule(source.replace(/^import .*;\s*/gm, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  new Function("Deno", "createClient", "PDFDocument", "StandardFonts", "rgb", "corsHeadersFor", "handlePreflight", "isTrustedOrigin", js)(
    { env: { get: () => "x" }, serve: (f: any) => { handler = f; } }, () => client, pdf, { Helvetica: "regular", HelveticaBold: "bold" }, () => ({}), corsHeadersFor, handlePreflight, isTrustedOrigin);
  const res = await handler(new Request("https://i.invalid", { method: "POST", headers: { Authorization: "Bearer s", Origin: "https://app.cultivofarm.com.br" }, body: JSON.stringify({ receipt_id: id }) }));
  return { body: await res.json(), pages, uploads };
}
const overflow = (pages: any[]) => pages.flatMap(p => p.texts).filter((t: any) => t.text !== "CANCELADO" && t.x + font("").widthOfTextAtSize(t.text, t.size) > 565 + 0.01);
const joined = (pages: any[], size: number) => pages.flatMap(p => p.texts).filter((t: any) => t.size === size && t.text !== "CANCELADO" && !/^(Este recibo|Código de)/.test(t.text)).map((t: any) => t.text).join(" ").replace(/\s+/g, " ");
const REASON = ("Motivo sintético extenso de homologação autorizado sem valor comercial ").repeat(40) + "FIM-DO-MOTIVO";
const DESC = "Recebimento ref. parcela 1 de Conta a receber fictícia de homologação B2B produto sintético sem valor comercial FIM-DA-DESCRICAO";

it("baseline v93 overflows the right margin with long description/reason (reproduces REC-2026-000002)", async () => {
  const r = await render(v93, "CANCELED", REASON, DESC); expect(overflow(r.pages).length).toBeGreaterThan(0);
});
it("candidate wraps by font width, paginates and keeps the full reason and description", async () => {
  const r = await render(candidate, "CANCELED", REASON, DESC);
  expect(overflow(r.pages)).toEqual([]); expect(r.pages.length).toBeGreaterThan(1);
  expect(joined(r.pages, 9)).toContain(`Motivo: ${REASON}`.replace(/\s+/g, " ").trim());
  expect(joined(r.pages, 11)).toContain(`Referente a: ${DESC}`);
  for (const p of r.pages) expect(p.texts.filter((t: any) => t.text === "CANCELADO")).toHaveLength(1);
  expect(r.body).toEqual({ path: `${org}/2026/REC-2026-000002.canceled.pdf`, receipt_number: "REC-2026-000002", status: "CANCELED" });
  expect(r.uploads).toEqual([`${org}/2026/REC-2026-000002.canceled.pdf`]);
});
it("candidate splits a single unbroken token wider than the line without losing characters", async () => {
  const token = "X".repeat(400); const r = await render(candidate, "CANCELED", token, DESC);
  expect(overflow(r.pages)).toEqual([]); expect(joined(r.pages, 9).replace(/ /g, "")).toContain("Motivo:" + token);
});
it("ISSUED stays status-bound, has no watermark or reason, and never signs", async () => {
  const r = await render(candidate, "ISSUED", REASON, DESC);
  expect(r.body).toEqual({ path: `${org}/2026/REC-2026-000002.pdf`, receipt_number: "REC-2026-000002", status: "ISSUED" });
  expect(r.pages.flatMap(p => p.texts).some((t: any) => t.text === "CANCELADO" || t.text.startsWith("Motivo"))).toBe(false);
  expect(candidate).not.toContain("createSignedUrl"); expect(candidate).toContain('supabase.rpc("h15_actor_organization")');
});
it("candidate changes only PDF layout: auth, tenant, status-bound storage and response are byte-identical", () => {
  const cut = (s: string) => [s.slice(s.indexOf("Deno.serve("), s.indexOf("    const pdf = await PDFDocument.create();")), s.slice(s.indexOf("    const bytes = await pdf.save();"))];
  expect(cut(candidate)).toEqual(cut(v93));
});
