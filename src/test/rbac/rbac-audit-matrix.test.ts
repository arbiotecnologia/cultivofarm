import { describe, expect, it } from "vitest";
import {
  AUDIT_USERS,
  LANCAMENTO_PROBES,
  ROUTE_PROBES,
  type AuditRole,
} from "../../../scripts/rbac-audit/matrix";
import { ACTIVE_ROLES, canAccess, canWrite, getHomeForRole } from "@/lib/permissions";

/**
 * Guarda de consistência da rotina de auditoria RBAC.
 * Garante que a matriz de expectativas continue alinhada com `permissions.ts`
 * quando rotas/papéis mudarem.
 */
describe("auditoria RBAC — matriz", () => {
  it("cobre todos os papéis ativos com um usuário de teste", () => {
    const covered = new Set(AUDIT_USERS.map((u) => u.role));
    for (const role of ACTIVE_ROLES as unknown as AuditRole[]) {
      expect(covered.has(role), `papel sem usuário de auditoria: ${role}`).toBe(true);
    }
  });

  it("não tem e-mails duplicados", () => {
    const emails = AUDIT_USERS.map((u) => u.email);
    expect(new Set(emails).size).toBe(emails.length);
  });

  it("toda rota auditada é reconhecida por canAccess para ao menos um papel", () => {
    for (const probe of ROUTE_PROBES) {
      const someone = AUDIT_USERS.some((u) => canAccess(u.role, probe.route));
      expect(someone, `rota sem nenhum papel autorizado: ${probe.route}`).toBe(true);
    }
  });

  it("todo papel esperado em um lançamento também pode escrever na rota correspondente", () => {
    for (const probe of LANCAMENTO_PROBES) {
      for (const role of probe.expectedRoles) {
        expect(
          canWrite(role, probe.route),
          `${role} deveria ter escrita em ${probe.route} (lançamento ${probe.id})`,
        ).toBe(true);
      }
    }
  });

  it("cada papel tem rota-home resolvível", () => {
    for (const user of AUDIT_USERS) {
      expect(getHomeForRole(user.role).startsWith("/")).toBe(true);
    }
  });

  it("probes de lançamento usam apenas FKs sintéticas (não persistem dados)", () => {
    for (const probe of LANCAMENTO_PROBES) {
      const values = Object.values(probe.payload).filter((v) => typeof v === "string") as string[];
      const uuids = values.filter((v) => /^[0-9a-f-]{36}$/i.test(v));
      for (const uuid of uuids) {
        expect(uuid).toBe("00000000-0000-4000-8000-0000000000ff");
      }
    }
  });
});
