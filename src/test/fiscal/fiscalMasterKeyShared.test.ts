import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { deriveMasterKey } from "../../../supabase/functions/_shared/fiscal/masterKey";

const hex = (b: Uint8Array | null) => (b ? Buffer.from(b).toString("hex") : null);

describe("chave mestra fiscal — derivação única do upload", () => {
  it("base64 de 32 bytes usa os bytes decodificados", async () => {
    const raw = randomBytes(32);
    expect(hex(await deriveMasterKey(raw.toString("base64")))).toBe(raw.toString("hex"));
  });

  it("vetor fixo base64 (00..1f)", async () => {
    const bytes = Uint8Array.from({ length: 32 }, (_, i) => i);
    const b64 = Buffer.from(bytes).toString("base64");
    expect(hex(await deriveMasterKey(b64))).toBe(Buffer.from(bytes).toString("hex"));
  });

  it("valor bruto >=32 que não é base64 de 32 bytes usa SHA-256 do valor", async () => {
    const raw = "frase-secreta-de-teste-com-mais-de-32-caracteres!";
    const expected = createHash("sha256").update(raw, "utf8").digest("hex");
    expect(hex(await deriveMasterKey(raw))).toBe(expected);
  });

  it("base64 válido de tamanho diferente de 32 e >=32 chars cai em SHA-256", async () => {
    const raw = Buffer.from(randomBytes(48)).toString("base64"); // 64 chars, 48 bytes
    expect(hex(await deriveMasterKey(raw))).toBe(createHash("sha256").update(raw).digest("hex"));
  });

  it("curto, vazio ou ausente => indisponível", async () => {
    expect(await deriveMasterKey("curto")).toBeNull();
    expect(await deriveMasterKey("")).toBeNull();
    expect(await deriveMasterKey(null)).toBeNull();
    expect(await deriveMasterKey(undefined)).toBeNull();
  });
});

describe("chave mestra fiscal — quatro funções usam o mesmo módulo", () => {
  const fns = ["fiscal-certificate-upload", "fiscal-event-sign", "fiscal-sefaz-transport", "fiscal-xml-engine"];
  it.each(fns)("%s importa a derivação compartilhada sem cópia local", (fn) => {
    const src = readFileSync(`supabase/functions/${fn}/index.ts`, "utf8");
    expect(src).toContain('import { decodeMasterKey } from "../_shared/fiscal/masterKey.ts";');
    expect(src).toContain("await decodeMasterKey()");
    expect(src).not.toMatch(/function decodeMasterKey|function decodeKeyB64/);
    expect(src).not.toMatch(/Deno\.env\.get\("FISCAL_[A-Z_]*MASTER_KEY"\)\s*[,;)]/);
  });
  it("o módulo lê somente a variável canônica e não loga", () => {
    const src = readFileSync("supabase/functions/_shared/fiscal/masterKey.ts", "utf8");
    expect(src.match(/Deno\.env\.get\(/g)?.length).toBe(1);
    expect(src).toContain('Deno.env.get("FISCAL_CERTIFICATE_MASTER_KEY")');
    expect(src).not.toMatch(/console\./);
  });
});

describe("transporte SEFAZ — resolução de rascunho só no status", () => {
  const src = readFileSync("supabase/functions/fiscal-sefaz-transport/index.ts", "utf8");
  it("fallback restrito a action=status sem invoice_id, antes do h15", () => {
    expect(src).toContain('if (action === "status" && !invoiceId)');
    expect(src.indexOf('if (action === "status" && !invoiceId)'))
      .toBeLessThan(src.indexOf('if (["status", "receipt", "consult"].includes(action))'));
    expect(src.match(/resolveStatusDraftInvoice\(/g)?.length).toBe(2);
  });
  it("usa o cliente autenticado (RLS), empresa atual, NFE HML DRAFT, limit 2 e nega ambiguidade", () => {
    const fn = src.slice(src.indexOf("async function resolveStatusDraftInvoice"), src.indexOf("Deno.serve("));
    expect(fn).toContain("authed.rpc(\"h15_actor_organization\")");
    expect(fn).not.toContain("admin.");
    for (const t of ['.eq("document_model", "NFE")', '.eq("environment", "HOMOLOGATION")',
      '.eq("normalized_status", "DRAFT")', ".limit(2)", "FISCAL_STATUS_DRAFT_AMBIGUOUS", "FISCAL_STATUS_DRAFT_REQUIRED"]) {
      expect(fn).toContain(t);
    }
  });
  it("mantém h15_service_actor_invoice_access e exige invoice para recibo/consulta", () => {
    expect(src).toContain('if (!invoiceId) return json({ error: "invoice_id_required" }, 400, headers);');
    expect(src.match(/h15_service_actor_invoice_access/g)!.length).toBeGreaterThanOrEqual(2);
  });
  it("mTLS envia folha + cadeia do certificado do emitente", () => {
    expect(src).toContain("[bundle.certPem, ...bundle.chainPem].join");
  });
});
