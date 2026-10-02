import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = [
  "supabase/migrations/20261002001921_8739ba87-e301-4e68-82b2-d253bbac84dd.sql",
  "supabase/migrations/20261002002408_e3ea8343-b974-4f3a-86bb-914f9196e6e1.sql",
  "supabase/migrations/20261002015343_ace68cd9-1438-46d2-a1dc-e6155763c467.sql",
  "supabase/migrations/20261002205411_56ad85cd-0235-4f93-9314-9b2a1b8931f9.sql",
].map((path) => readFileSync(path, "utf8")).join("\n");
const recovery = readFileSync("src/pages/ResetPassword.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const adminPassword = readFileSync("supabase/functions/admin-update-user-password/index.ts", "utf8");

describe("D51 — provisionamento recuperável e concorrente", () => {
  it("serializa por e-mail e exige lease vigente para concluir", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("lease_token IS DISTINCT FROM p_lease_token");
    expect(migration).toMatch(/lease_expires_at\s*<=\s*clock_timestamp\(\)/);
    expect(migration).toContain("platform_stale_lease");
  });

  it("completed é terminal e a retomada exige origem em app_metadata", () => {
    expect(migration).toContain("j.status='ativo'");
    expect(migration).toContain("raw_app_meta_data->>'provisioning_request_id'");
  });

  it("reenvio reaproveita a conta e renova link ou senha", () => {
    const edge = readFileSync("supabase/functions/platform-invite-org-admin/index.ts", "utf8");
    expect(edge).toContain('if (userId && modo === "link")');
    expect(edge).toContain('else if (userId)');
    expect(edge).not.toContain("listUsers");
  });

  it("bloqueia configuração SMTP incompatível antes do claim de provisionamento", () => {
    const edge = readFileSync("supabase/functions/platform-invite-org-admin/index.ts", "utf8");
    expect(edge).toContain("getSmtpConfigError(runtimeEnv)");
    expect(edge.indexOf("getSmtpConfigError(runtimeEnv)")).toBeLessThan(edge.indexOf('"platform_claim_org_admin_provisioning"'));
  });

  it("envio do convite tem lease/fencing, cooldown e grants somente server-side", () => {
    expect(migration).toContain("platform_claim_org_admin_email_delivery");
    expect(migration).toContain("email_delivery_status='sending'");
    expect(migration).toContain("email_lease_token IS DISTINCT FROM p_lease_token");
    expect(migration).toContain("platform_email_cooldown");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.platform_claim_org_admin_email_delivery[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.platform_claim_org_admin_email_delivery[\s\S]*TO service_role/);
  });

  it("bloqueia retry ambíguo sem confirmação e audita confirmação explícita", () => {
    expect(migration).toContain("email_ambiguous_confirmation_required");
    expect(migration).toContain("p_confirm_ambiguous_email_retry");
    expect(migration).toContain("invite.email_ambiguous_retry_confirmed");
    expect(migration).toContain("email_delivery_status='ambiguous'");
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.platform_mark_org_admin_email_ambiguous[\s\S]*TO service_role/);
  });

  it("remove execução do caminho legado MD5", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION platform_private.conclude_provisional_password()");
  });
});

describe("D51 — senha e isolamento", () => {
  it("oferece recovery, reconhece PASSWORD_RECOVERY e limpa tokens da URL", () => {
    expect(app).toContain('path="/reset-password"');
    expect(recovery).toContain('event === "PASSWORD_RECOVERY"');
    expect(recovery).toContain("window.history.replaceState");
    expect(recovery).not.toMatch(/console\.(log|warn|error)/);
  });

  it("troca administrativa exige mesma organização e bloqueia superadmin", () => {
    expect(adminPassword).toContain("admin_can_update_user_password_server");
    expect(adminPassword).not.toContain("updateError.message");
  });
});