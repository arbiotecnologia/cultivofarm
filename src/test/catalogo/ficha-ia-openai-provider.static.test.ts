import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const source = readFileSync("supabase/functions/ai-generate-ficha-campo/index.ts", "utf8");
const transport = readFileSync("supabase/functions/_shared/openai.ts", "utf8");
describe("provedor OpenAI da ficha técnica", () => {
  it("mantém credencial no servidor e transporte direto sem gateway intermediário", () => {
    expect(transport).toContain("Deno.env.get('OPENAI_API_KEY')");
    expect(transport).toContain("https://api.openai.com/v1/responses");
    expect(transport).toContain("store: false");
    expect(source).not.toContain("GEMINI_API_KEY");
    expect(source).not.toContain("LOVABLE_API_KEY");
  });
  it("preserva autorização antes da geração e saída estruturada", () => {
    expect(source.indexOf("await requireActiveCatalogSuperadmin")).toBeLessThan(source.indexOf("await generateResponse"));
    expect(source).toContain("type: 'json_schema'");
    expect(source).toContain("parseRespostaIA(responseText(aiData))");
    expect(source).toContain("status: 'pendente'");
  });
});
