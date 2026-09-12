import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("supabase/functions/ai-generate-ficha-campo/index.ts", "utf8");

describe("provedor Gemini da ficha técnica", () => {
  it("usa somente segredo server-side e nunca envia a chave ao frontend", () => {
    expect(source).toContain("Deno.env.get('GEMINI_API_KEY')");
    expect(source).toContain("'x-goog-api-key': GEMINI_API_KEY");
    expect(source).not.toContain("LOVABLE_API_KEY");
    expect(source).not.toContain("ai.gateway.lovable.dev");
  });

  it("usa o endpoint oficial e saída JSON estruturada", () => {
    expect(source).toContain("generativelanguage.googleapis.com/v1beta/models/");
    expect(source).toContain("responseMimeType: 'application/json'");
    expect(source).toContain("responseSchema");
    expect(source).toContain("candidates?.[0]?.content?.parts");
  });

  it("não confunde credencial inválida do provedor com permissão do usuário", () => {
    expect(source).toContain("aiRes.status === 401 || aiRes.status === 403");
    expect(source).toContain("credencial do provedor inválida");
    expect(source).toContain("}, 503)");
  });
});

