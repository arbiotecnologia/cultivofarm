import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Incidente 2026-09-18: a reconexão do Supabase republicou automaticamente as 37
 * Edge Functions com verify_jwt=false e reduziu supabase/config.toml a apenas
 * `project_id`. Este teste falha se a declaração explícita de proteção de
 * gateway voltar a ser removida ou rebaixada.
 */

const ROOT = resolve(__dirname, "../../..");
const toml = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");

const MUST_REQUIRE_JWT = [
  "fiscal-binding-diagnostics",
  "fiscal-certificate-revoke",
  "fiscal-certificate-upload",
  "fiscal-cnpj-lookup",
  "fiscal-event-sign",
  "fiscal-preflight",
  "fiscal-sefaz-transport",
  "fiscal-xml-engine",
  "create-user",
  "platform-invite-org-admin",
  "admin-update-user-password",
  "list-portal-users",
  "enviar-pdf-aplicacao",
  "enviar-pdf-visita",
  "sync-clima",
] as const;

function blockOf(name: string): string | null {
  const match = toml.match(
    new RegExp(`\\[functions\\.${name}\\]([\\s\\S]*?)(?=\\n\\[|$)`),
  );
  if (!match) return null;
  // Comentários não são configuração: descartá-los evita falso positivo.
  return match[1]
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
}

describe("config.toml — proteção de gateway das Edge Functions", () => {
  it("mantém o projeto canônico", () => {
    expect(toml).toContain('project_id = "swzpzcwiasxmjutrmvkm"');
  });

  it.each(MUST_REQUIRE_JWT)("%s exige verify_jwt = true", (name) => {
    const block = blockOf(name);
    expect(block, `bloco [functions.${name}] ausente`).not.toBeNull();
    expect(block).toMatch(/verify_jwt\s*=\s*true/);
    expect(block).not.toMatch(/verify_jwt\s*=\s*false/);
  });

  it("preserva o empacotamento dos XSDs do motor XML", () => {
    const block = blockOf("fiscal-xml-engine")!;
    expect(block).toContain("./functions/fiscal-xml-engine/xsd/*.xsd");
    expect(block).toContain("./functions/fiscal-xml-engine/xsd/manifest.json");
  });

  it("mantém o webhook de status do WhatsApp sem JWT (autenticação própria)", () => {
    expect(blockOf("whatsapp-status-webhook")).toMatch(
      /verify_jwt\s*=\s*false/,
    );
  });
});
