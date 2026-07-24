/**
 * Fase SINIEF 4.0 — Auditoria estática dos artefatos do pacote de certificação.
 *
 * Objetivos (SEM tocar em banco/Supabase):
 *  - Snapshots são SOMENTE LEITURA e possuem marker check.
 *  - Fixtures/cenários/cleanup estão restritos ao staging AR-Bio-TEMP.
 *  - Nunca referenciam ref de produção.
 *  - Não introduzem provedor/XML/URL SEFAZ/secret hardcoded.
 *  - Cenários cobrem os 7 casos SINIEF 49/2025.
 *  - Runbook exige ordem correta e não pede migration repair automático.
 *  - fiscal-preflight mantém canTransmit=false hardcoded.
 */
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.resolve(ROOT, "restoration/fiscal-sinief49-fase4");

function read(rel: string): string {
  return fs.readFileSync(path.resolve(ROOT, rel), "utf8");
}

const PROD_REF = "navfzbwgwzruipouyfnk";
const STAGING_REF = "ikaauvsflpmamgxmkhoq";

const PRE = read("restoration/fiscal-sinief49-fase4/00-snapshot-pre.sql");
const POST = read("restoration/fiscal-sinief49-fase4/01-snapshot-post.sql");
const FIX = read("restoration/fiscal-sinief49-fase4/10-fixtures.sql");
const SCE = read("restoration/fiscal-sinief49-fase4/11-scenarios.sql");
const CLE = read("restoration/fiscal-sinief49-fase4/99-cleanup.sql");
const README = read("restoration/fiscal-sinief49-fase4/README.md");

const stripComments = (sql: string) =>
  sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("SINIEF 49 · artefatos existem", () => {
  test("todos os arquivos do pacote existem", () => {
    for (const f of [
      "00-snapshot-pre.sql",
      "01-snapshot-post.sql",
      "10-fixtures.sql",
      "11-scenarios.sql",
      "99-cleanup.sql",
      "README.md",
    ]) {
      expect(fs.existsSync(path.join(DIR, f)), f).toBe(true);
    }
  });
});

describe("SINIEF 49 · snapshots são SOMENTE LEITURA e checam marker", () => {
  for (const [name, sql] of [
    ["pre", PRE],
    ["post", POST],
  ] as const) {
    test(`${name}: sem DDL/DML de escrita`, () => {
      const s = stripComments(sql);
      for (const kw of [
        "INSERT ",
        "UPDATE ",
        "DELETE ",
        "TRUNCATE",
        "DROP ",
        "ALTER ",
        "CREATE TABLE",
        "CREATE INDEX",
        "CREATE POLICY",
        "GRANT ",
        "REVOKE ",
      ]) {
        expect(s.toUpperCase()).not.toContain(kw);
      }
    });
    test(`${name}: verifica marker _fiscal_staging_marker='STAGING' e ref esperado`, () => {
      expect(sql).toMatch(/_fiscal_staging_marker/);
      expect(sql).toContain(STAGING_REF);
    });
  }
});

describe("SINIEF 49 · fixtures/cenários/cleanup: staging apenas, marker enforced", () => {
  for (const [name, sql] of [
    ["fixtures", FIX],
    ["cenarios", SCE],
    ["cleanup", CLE],
  ] as const) {
    test(`${name}: transacional`, () => {
      expect(sql).toMatch(/\bBEGIN;/);
      expect(sql).toMatch(/\bCOMMIT;/);
    });
    test(`${name}: guard marker + ref staging`, () => {
      expect(sql).toMatch(/_fiscal_staging_marker/);
      expect(sql).toContain(STAGING_REF);
      expect(sql).toMatch(/RAISE EXCEPTION/);
    });
    test(`${name}: nunca referencia ref de produção`, () => {
      expect(sql).not.toContain(PROD_REF);
    });
  }
});

describe("SINIEF 49 · nenhum artefato introduz transmissão/provedor/segredo", () => {
  const bag = [PRE, POST, FIX, SCE, CLE, README].join("\n");
  test("sem provedor/URL/transmissão/XML", () => {
    const noComments = bag
      .split("\n")
      .filter((l) => !l.trim().startsWith("--") && !l.trim().startsWith("#"))
      .join("\n");
    expect(noComments).not.toMatch(/sefaz/i);
    expect(noComments).not.toMatch(/focus[_-]?nfe/i);
    expect(noComments).not.toMatch(/https?:\/\/(?!.*supabase\.co)/i);
    expect(noComments).not.toMatch(/\btransmit\b/i);
    expect(noComments).not.toMatch(/<\?xml/);
  });
  test("sem secrets aparentes hardcoded", () => {
    expect(bag).not.toMatch(/SUPABASE_ACCESS_TOKEN\s*=/);
    expect(bag).not.toMatch(/service_role_key\s*=\s*['"]ey/i);
    expect(bag).not.toMatch(/sb_secret_[A-Za-z0-9]{8,}/);
    expect(bag).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  });
});

describe("SINIEF 49 · fixtures cobrem os 6 papéis alvo + no-role", () => {
  test("papéis presentes em user_roles", () => {
    for (const role of ["administrador", "financeiro", "gestor", "administrativo", "cliente_produtor"]) {
      expect(FIX).toContain(`'${role}'`);
    }
    // no-role explícito: usuário f106 não recebe INSERT em user_roles.
    expect(FIX).toMatch(/f106.*SEM papel/is);
  });
  test("usuários usam domínio determinístico para cleanup", () => {
    expect(FIX).toMatch(/@sinief49\.fixture\.local/);
    expect(CLE).toMatch(/@sinief49\.fixture\.local/);
  });
});

describe("SINIEF 49 · cenários cobrem os 7 tipos + produto + microrganismo", () => {
  const scenarios = [
    "ADVANCE_PAYMENT",
    "EFFECTIVE_SALE_AFTER_ADVANCE",
    "STOCK_LOSS",
    "VALUE_QUANTITY_REDUCTION",
    "DELIVERY_REFUSAL_TOTAL",
    "DELIVERY_REFUSAL_PARTIAL",
    "RECIPIENT_NOT_FOUND",
  ];
  for (const s of scenarios) {
    test(`cenario ${s} presente`, () => {
      expect(SCE).toContain(`'${s}'`);
    });
  }
  test("relation_types e reference_types SINIEF 49 exercitados", () => {
    for (const t of ["ADVANCE_PAYMENT_OF", "REDUCTION_OF", "TOTAL_REFUSAL_OF", "PARTIAL_REFUSAL_OF", "RECIPIENT_NOT_FOUND_OF"]) {
      expect(SCE).toContain(`'${t}'`);
    }
    expect(SCE).toContain("'PARTIAL_REFUSAL_ITEM'");
    expect(SCE).toContain("'REDUCTION_ITEM'");
    expect(SCE).toContain("'PERISHMENT'");
  });
  test("nenhum serviço/NFS-e nos cenários", () => {
    expect(SCE.toLowerCase()).not.toMatch(/service_fiscal_profiles|nfse|nfs-e/);
  });
});

describe("SINIEF 49 · cleanup é determinístico e restrito às fixtures", () => {
  test("filtra por marcador FIXTURE ou prefixo UUID sintético", () => {
    expect(CLE).toMatch(/FIXTURE sinief49-fx/);
    expect(CLE).toMatch(/00000000-0000-4000-8000-0000000000/);
  });
  test("ordem respeita FKs (item_references → references → contexts → items → invoices)", () => {
    const idx = (s: string) => CLE.indexOf(s);
    expect(idx("fiscal_invoice_item_references")).toBeGreaterThan(-1);
    expect(idx("fiscal_invoice_item_references")).toBeLessThan(idx("fiscal_invoice_references"));
    expect(idx("fiscal_invoice_references")).toBeLessThan(idx("fiscal_stock_loss_contexts"));
    expect(idx("fiscal_stock_loss_contexts")).toBeLessThan(idx("fiscal_invoice_items"));
    expect(idx("fiscal_invoice_items")).toBeLessThan(idx("fiscal_invoices"));
  });
});

describe("SINIEF 49 · runbook (README) impõe ordem e proíbe migration repair", () => {
  test("ordem canônica presente", () => {
    const order = [
      "00-snapshot-pre.sql",
      "20260807000000_fiscal_sinief_49_scaffolding.sql",
      "01-snapshot-post.sql",
      "10-fixtures.sql",
      "11-scenarios.sql",
      "verify-fiscal-types",
      "verify-fiscal-types-sinief49",
      "typecheck",
      "vitest",
      "99-cleanup.sql",
    ];
    let cursor = 0;
    for (const tok of order) {
      const at = README.indexOf(tok, cursor);
      expect(at, `token fora de ordem: ${tok}`).toBeGreaterThan(-1);
      cursor = at;
    }
  });
  test("proíbe migration repair automático sem divergência", () => {
    expect(README).toMatch(/migration repair.*proibido.*sem divergência/i);
  });
  test("staging-only nunca aponta produção", () => {
    expect(README).toContain(STAGING_REF);
    expect(README).toContain(PROD_REF);
    expect(README).toMatch(/Ref proibido[^\n]*navfzbwgwzruipouyfnk/);
  });
});

describe("SINIEF 49 · invariantes runtime preservados", () => {
  test("fiscal-preflight mantém canTransmit=false e provider=NONE", () => {
    const pf = read("supabase/functions/fiscal-preflight/index.ts");
    expect(pf).toMatch(/canTransmit:\s*false\s+as\s+const/);
    expect(pf).toMatch(/provider:\s*"NONE"\s+as\s+const/);
  });
  test("featureFlags.fiscalEmissionEnabled = false", () => {
    const flags = read("src/config/featureFlags.ts");
    expect(flags).toMatch(/fiscalEmissionEnabled\s*:\s*false/);
  });
});
