import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20261038000000_d51_provisioning_fencing.sql", "utf8");
const recovery = readFileSync("src/pages/ResetPassword.tsx", "utf8");
const app = readFileSync("src/App.tsx", "utf8");
const adminPassword = readFileSync("supabase/functions/admin-update-user-password/index.ts", "utf8");

describe("D51 — provisionamento recuperável e concorrente", () => {
  it("serializa por e-mail e exige lease vigente para concluir", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("lease_token IS DISTINCT FROM p_lease_token");
    expect(migration).toContain("lease_expires_at <= clock_timestamp()");
    expect(migration).toContain("platform_stale_lease");
  });

  it("completed é terminal e a retomada exige origem em app_metadata", () => {
    expect(migration).toContain("j.status='ativo'");
    expect(migration).toContain("raw_app_meta_data->>'provisioning_request_id'");
    expect(migration).not.toMatch(/raw_user_meta_data->>'provisioning_request_id'/);
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
    expect(adminPassword).toContain("callerProfile.organization_id !== targetProfile.organization_id");
    expect(adminPassword).toContain("targetIsSuper === true");
    expect(adminPassword).not.toContain("updateError.message");
  });
});