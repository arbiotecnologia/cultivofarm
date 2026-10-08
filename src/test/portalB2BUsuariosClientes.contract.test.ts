import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Fase 3 — Testes de contrato para logs B2B e documentação oficial
 * do modelo usuário B2B × cliente.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p: string) => fs.existsSync(path.join(root, p));

/** Retorna o conteúdo da migration mais recente que define uma função. */
function latestMigrationDefining(fnSignature: string): string {
  const dir = path.join(root, "supabase/migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const matches = files.filter((f) =>
    fs.readFileSync(path.join(dir, f), "utf8").includes(fnSignature),
  );
  if (matches.length === 0) {
    throw new Error(`No migration defines ${fnSignature}`);
  }
  return fs.readFileSync(path.join(dir, matches[matches.length - 1]), "utf8");
}

describe("Portal B2B — documentação oficial usuário × cliente", () => {
  const officialPath = "docs/portal-b2b-usuarios-clientes.md";

  it("documento oficial existe", () => {
    expect(exists(officialPath)).toBe(true);
  });

  it("documento oficial contém conceitos-chave do modelo vigente", () => {
    const doc = read(officialPath);
    expect(doc).toContain("partner_clients");
    expect(doc).toContain("partner_user_clients");
    expect(doc).toContain("get_b2b_user_clients_secure");
    expect(doc.toLowerCase()).toMatch(/simulador.*sem desconto/s);
    expect(doc.toLowerCase()).toContain("pedido oficial");
    expect(doc.toLowerCase()).toContain("condição comercial real");
  });

  it("docs/portal-b2b-tecnico-campo.md está marcado como histórico", () => {
    expect(read("docs/portal-b2b-tecnico-campo.md")).toContain(
      "DOCUMENTO HISTÓRICO",
    );
  });

  it("docs/portal-parceiro-b2b.md está marcado como histórico", () => {
    expect(read("docs/portal-parceiro-b2b.md")).toContain(
      "DOCUMENTO HISTÓRICO",
    );
  });
});

describe("Portal B2B — contrato de logs seguros", () => {
  const assignSql = latestMigrationDefining(
    "CREATE OR REPLACE FUNCTION public.assign_b2b_user_client_secure",
  );

  it("assign_b2b_user_client_secure não faz INSERT direto em partner_catalog_access_logs", () => {
    // Isola o corpo desta função para evitar falso positivo por outras funções na mesma migration.
    const start = assignSql.indexOf(
      "CREATE OR REPLACE FUNCTION public.assign_b2b_user_client_secure",
    );
    const rest = assignSql.slice(start);
    const end = rest.search(
      /\n\s*CREATE OR REPLACE FUNCTION|\n\s*REVOKE |\n\s*GRANT /,
    );
    const body = end >= 0 ? rest.slice(0, end) : rest;
    expect(body).not.toMatch(/insert\s+into\s+public\.partner_catalog_access_logs/i);
    expect(body).not.toMatch(/insert\s+into\s+partner_catalog_access_logs/i);
  });

  it("atribuição contida não grava log nem vínculo antes de negar o contrato", () => {
    expect(assignSql).toContain("MESSAGE='B2B_ASSIGNMENT_CONTRACT_UNAVAILABLE'");
    expect(assignSql).not.toMatch(/\b(insert|update|delete)\s+(into|public\.)/i);
    expect(assignSql).toContain("FROM PUBLIC,anon,authenticated");
  });

  it("partner_catalog_access_logs não tem policy INSERT aberta para authenticated", () => {
    const dir = path.join(root, "supabase/migrations");
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
    for (const f of files) {
      const sql = fs.readFileSync(path.join(dir, f), "utf8");
      // Detecta CREATE POLICY ... ON ... partner_catalog_access_logs ... FOR INSERT ... TO authenticated
      const regex =
        /create\s+policy[\s\S]*?on\s+(?:public\.)?partner_catalog_access_logs[\s\S]*?for\s+insert[\s\S]*?to\s+authenticated/gi;
      const matches = sql.match(regex) ?? [];
      // Aceita apenas se a mesma migration remove logo em seguida (não tratamos aqui);
      // exigimos que nenhuma migration recente crie tal policy sem drop posterior.
      for (const m of matches) {
        // Se existir, precisa haver DROP POLICY correspondente em migration posterior.
        const laterDrops = files
          .filter((g) => g > f)
          .some((g) =>
            /drop\s+policy[\s\S]*?on\s+(?:public\.)?partner_catalog_access_logs/i.test(
              fs.readFileSync(path.join(dir, g), "utf8"),
            ),
          );
        expect(
          laterDrops,
          `Policy INSERT aberta para authenticated em ${f} sem DROP posterior`,
        ).toBe(true);
      }
    }
  });
});
