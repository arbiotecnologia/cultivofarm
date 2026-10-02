import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const settingsEdge = read("supabase/functions/communication-provider-settings/index.ts");
const testEdge = read("supabase/functions/test-communication-email/index.ts");
const tenantSettings = read("src/pages/Configuracoes.tsx");
const platformHome = read("src/pages/plataforma/PlataformaHome.tsx");
const providerUi = read("src/pages/configuracoes/ComunicacaoConfigTab.tsx");
const worker = read("supabase/functions/process-communication-outbox/index.ts");
const runtimeConfig = read("supabase/functions/_shared/comunicacao/runtime-config.ts");

describe("D51.2-F — isolamento SaaS da configuração global", () => {
  it.each([
    ["provider settings", settingsEdge],
    ["teste SMTP", testEdge],
  ])("%s exige JWT e is_platform_superadmin, sem papel tenant", (_name, source) => {
    expect(source).toContain('req.headers.get("Authorization")');
    expect(source).toContain("auth.getUser(token)");
    expect(source).toContain('rpc("is_platform_superadmin"');
    expect(source).toContain("_user_id: uid");
    expect(source).toContain("isSuperadmin !== true");
    expect(source).toContain('error: "forbidden"');
    expect(source).not.toMatch(/r\.role\s*===\s*["']administrador["']/);
    expect(source).not.toMatch(/user_metadata|raw_user_meta_data/);
  });

  it("nega tenant admin antes de leitura, mutação, rate limit ou socket", () => {
    const settingsAuth = settingsEdge.indexOf("await authorizePlatformSuperadmin(req, origin)");
    expect(settingsAuth).toBeGreaterThan(-1);
    expect(settingsAuth).toBeLessThan(settingsEdge.indexOf("await loadPublicView(sb)"));
    expect(settingsAuth).toBeLessThan(settingsEdge.indexOf('sb.rpc("rpc_service_apply_provider_settings"'));

    const testAuthorization = testEdge.indexOf("isSuperadmin !== true");
    expect(testAuthorization).toBeGreaterThan(-1);
    expect(testAuthorization).toBeLessThan(testEdge.indexOf('p_action: "test_smtp"'));
    expect(testAuthorization).toBeLessThan(testEdge.indexOf("await sendEmail("));
  });

  it("mantém 401/403 sanitizados e nenhuma resposta de diagnóstico sensível", () => {
    for (const source of [settingsEdge, testEdge]) {
      expect(source).toContain('error: "unauthorized"');
      expect(source).toContain('error: "invalid_token"');
      expect(source).toContain('error: "forbidden"');
      expect(source).not.toMatch(/user_metadata|raw_user_meta_data/);
      expect(source).not.toMatch(/SERVICE_KEY\s*[,}]|service_role\s*[,}]/);
    }
  });

  it("remove o provider global do tenant e reutiliza o mesmo componente em /plataforma", () => {
    expect(tenantSettings).not.toContain("ComunicacaoConfigTab");
    expect(tenantSettings).not.toContain('value="comunicacao"');
    expect(platformHome).toContain('import ComunicacaoConfigTab from "@/pages/configuracoes/ComunicacaoConfigTab"');
    expect(platformHome).toContain('<TabsTrigger value="comunicacao">');
    expect(platformHome).toContain("<ComunicacaoConfigTab />");
    expect(providerUi).not.toContain('roles.includes("administrador")');
  });

  it("preserva workers server-side sem conceder papel operacional ao superadmin", () => {
    expect(worker).toContain("loadRuntimeConfig");
    expect(runtimeConfig).toContain("rpc_service_load_provider_runtime_config");
    expect(platformHome).not.toMatch(/user_roles|administrador.*superadmin|superadmin.*administrador/);
  });
});