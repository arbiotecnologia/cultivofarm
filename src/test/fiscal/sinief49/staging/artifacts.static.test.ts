/**
 * Fase SINIEF 4.0.1 — Auditoria estática do pacote de certificação.
 * Sem tocar em banco/Supabase.
 */
import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const DIR = path.resolve(ROOT, "restoration/fiscal-sinief49-fase4");
const read = (rel: string) => fs.readFileSync(path.resolve(ROOT, rel), "utf8");

const PROD_REF = "navfzbwgwzruipouyfnk";
const STAGING_REF = "ikaauvsflpmamgxmkhoq";

const PRE = read("restoration/fiscal-sinief49-fase4/00-snapshot-pre.sql");
const POST = read("restoration/fiscal-sinief49-fase4/01-snapshot-post.sql");
const FIX = read("restoration/fiscal-sinief49-fase4/10-fixtures.sql.tpl");
const SCE = read("restoration/fiscal-sinief49-fase4/11-scenarios.sql.tpl");
const CLE = read("restoration/fiscal-sinief49-fase4/99-cleanup.sql");
const README = read("restoration/fiscal-sinief49-fase4/README.md");
const RUNNER = read("restoration/fiscal-sinief49-fase4/runner/run-staging.ts");

const strip = (s: string) =>
  s.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("SINIEF 4.0.1 · artefatos presentes", () => {
  test("todos existem", () => {
    for (const f of [
      "00-snapshot-pre.sql",
      "01-snapshot-post.sql",
      "10-fixtures.sql.tpl",
      "11-scenarios.sql.tpl",
      "99-cleanup.sql",
      "README.md",
      "runner/run-staging.ts",
    ]) {
      expect(fs.existsSync(path.join(DIR, f)), f).toBe(true);
    }
  });
  test("SQLs .sql antigos (10/11) removidos — fonte é .tpl", () => {
    expect(fs.existsSync(path.join(DIR, "10-fixtures.sql"))).toBe(false);
    expect(fs.existsSync(path.join(DIR, "11-scenarios.sql"))).toBe(false);
  });
});

describe("SINIEF 4.0.1 · snapshots são READ-ONLY + fail-fast real", () => {
  for (const [name, sql] of [["pre", PRE], ["post", POST]] as const) {
    test(`${name}: sem DDL/DML de escrita`, () => {
      const s = strip(sql).toUpperCase();
      for (const kw of ["INSERT ","UPDATE ","DELETE ","TRUNCATE","DROP ","ALTER ","CREATE TABLE","CREATE INDEX","CREATE POLICY","GRANT ","REVOKE "]) {
        expect(s).not.toContain(kw);
      }
    });
    test(`${name}: RAISE EXCEPTION em DO $$ para marker ausente/duplicado/prod/ref divergente`, () => {
      expect(sql).toMatch(/DO \$guard\$/);
      expect(sql).toMatch(/RAISE EXCEPTION[^;]*marker[^;]*ausente/i);
      expect(sql).toMatch(/RAISE EXCEPTION[^;]*duplicado/i);
      expect(sql).toMatch(/RAISE EXCEPTION[^;]*PRODUÇÃO/i);
      expect(sql).toContain(STAGING_REF);
      expect(sql).toContain(PROD_REF);
    });
  }
  test("post: asserts fail-fast para colunas/tabelas/RLS/policy/grant/event_types", () => {
    expect(POST).toMatch(/\$asserts\$/);
    for (const kw of ["direction","fiscal_operation_type","fin_nfe","tp_nf_debito","tp_nf_credito","nature_operation","tax_authority_notes","legal_basis","legal_version","legal_effective_date"]) {
      expect(POST).toContain(`'${kw}'`);
    }
    for (const t of ["fiscal_invoice_references","fiscal_invoice_item_references","fiscal_stock_loss_contexts"]) {
      expect(POST).toContain(`'${t}'`);
    }
    // Bloqueia UPDATE/DELETE/ALL nas 3 novas tabelas.
    expect(POST).toMatch(/UPDATE\/DELETE\/ALL detectada/);
    // 13 legados + 7 novos.
    for (const e of ["CREATED","REPLACEMENT_REQUIRED","SINIEF_ADVANCE_PAYMENT_ISSUED","SINIEF_RECIPIENT_NOT_FOUND_ISSUED"]) {
      expect(POST).toContain(`'${e}'`);
    }
  });
});

describe("SINIEF 4.0.1 · fixtures/cenários: templates parametrizados sem auth.users", () => {
  for (const [name, sql] of [["fixtures", FIX], ["scenarios", SCE]] as const) {
    test(`${name}: transacional + guard fail-fast`, () => {
      expect(sql).toMatch(/\bBEGIN;/);
      expect(sql).toMatch(/\bCOMMIT;/);
      expect(sql).toMatch(/RAISE EXCEPTION/);
      expect(sql).toContain(STAGING_REF);
      expect(sql).toContain(PROD_REF);
    });
    test(`${name}: NÃO cria/mexe em auth.users`, () => {
      expect(sql).not.toMatch(/INSERT\s+INTO\s+auth\.users/i);
      expect(sql).not.toMatch(/DELETE\s+FROM\s+auth\.users/i);
      expect(sql).not.toMatch(/UPDATE\s+auth\.users/i);
    });
    test(`${name}: usa placeholders psql :'u_*' / :'seed_user_id'`, () => {
      expect(sql).toMatch(/:'seed_user_id'/);
    });
  }
  test("fixtures: user_roles usa :'u_*' e cobre 5 papéis + no-role", () => {
    for (const v of ["u_admin","u_fin","u_gestor","u_adm","u_prod"]) {
      expect(FIX).toContain(`:'${v}'`);
    }
    expect(FIX).toMatch(/u_none.*SEM papel/is);
    for (const r of ["administrador","financeiro","gestor","administrativo","cliente_produtor"]) {
      expect(FIX).toContain(`'${r}'`);
    }
  });
  test("fixtures/scenarios: payloads respeitam campos NOT NULL", () => {
    // fiscal_invoices: invoice_type + status + created_by
    for (const sql of [FIX, SCE]) {
      expect(sql).toMatch(/invoice_type[\s\S]*?'NFE'/);
      expect(sql).toMatch(/status[\s\S]*?'PENDING'/);
      expect(sql).toMatch(/:'seed_user_id'::uuid/);
    }
    // fiscal_invoice_items: item_sequence + item_kind
    for (const sql of [FIX, SCE]) {
      expect(sql).toMatch(/fiscal_invoice_items[\s\S]*?item_sequence[\s\S]*?item_kind/);
      expect(sql).toContain("'PRODUCT'");
    }
  });
  test("scenarios: cobre os 7 cenários SINIEF", () => {
    for (const s of ["ADVANCE_PAYMENT","EFFECTIVE_SALE_AFTER_ADVANCE","STOCK_LOSS","VALUE_QUANTITY_REDUCTION","DELIVERY_REFUSAL_TOTAL","DELIVERY_REFUSAL_PARTIAL","RECIPIENT_NOT_FOUND"]) {
      expect(SCE).toContain(`'${s}'`);
    }
  });
});

describe("SINIEF 4.0.1 · cleanup: dependências → domínio → user_roles; SEM auth.users", () => {
  test("guard fail-fast", () => {
    expect(CLE).toMatch(/DO \$guard\$/);
    expect(CLE).toMatch(/RAISE EXCEPTION[^;]*PRODUÇÃO/i);
  });
  test("nunca deleta em auth.users", () => {
    expect(CLE).not.toMatch(/DELETE\s+FROM\s+auth\.users/i);
    expect(CLE).not.toMatch(/UPDATE\s+auth\.users/i);
  });
  test("ordem dos DELETEs respeita FKs", () => {
    const deletes = Array.from(CLE.matchAll(/DELETE FROM public\.(\w+)/g)).map((m) => m[1]);
    const pos = (t: string) => deletes.indexOf(t);
    expect(pos("fiscal_invoice_item_references")).toBeGreaterThanOrEqual(0);
    expect(pos("fiscal_invoice_item_references")).toBeLessThan(pos("fiscal_invoice_items"));
    expect(pos("fiscal_invoice_references")).toBeLessThan(pos("fiscal_invoices"));
    expect(pos("fiscal_stock_loss_contexts")).toBeLessThan(pos("fiscal_invoices"));
    expect(pos("fiscal_invoice_items")).toBeLessThan(pos("fiscal_invoices"));
    expect(pos("user_roles")).toBeGreaterThan(pos("fiscal_invoices"));
  });
  test("fail-fast zero fixture residual", () => {
    expect(CLE).toMatch(/\$verify\$/);
    expect(CLE).toMatch(/fixture residual/i);
  });
});

describe("SINIEF 4.0.1 · runner server-side prepared (não executado)", () => {
  test("usa auth.admin.createUser / deleteUser (nunca INSERT auth.users)", () => {
    expect(RUNNER).toMatch(/auth\.admin\.createUser/);
    expect(RUNNER).toMatch(/auth\.admin\.deleteUser/);
    expect(RUNNER).not.toMatch(/INSERT\s+INTO\s+auth\.users/i);
  });
  test("exige --execute; sem ele sai com código 2 e não toca Supabase", () => {
    expect(RUNNER).toMatch(/--execute/);
    expect(RUNNER).toMatch(/process\.exit\(2\)/);
  });
  test("bloqueia modo skip em enforce e rejeita PROD ref", () => {
    expect(RUNNER).toMatch(/resolveSinief49GuardMode/);
    expect(RUNNER).toMatch(/modo skip não permitido/i);
    expect(RUNNER).toContain("SINIEF49_PROD_PROJECT_REF");
  });
  test("faz login real (JWT) por usuário e valida persistência via service_role", () => {
    expect(RUNNER).toMatch(/signInWithPassword/);
    expect(RUNNER).toMatch(/access_token/);
    expect(RUNNER).toMatch(/persistence check/);
  });
  test("nunca imprime senha/JWT/anon/service_role", () => {
    // Não pode haver console.log direto de campos sensíveis.
    expect(RUNNER).not.toMatch(/console\.log\([^)]*password/i);
    expect(RUNNER).not.toMatch(/console\.log\([^)]*jwt/i);
    expect(RUNNER).not.toMatch(/console\.log\([^)]*serviceRoleKey/i);
    expect(RUNNER).toMatch(/REDACT/);
  });
  test("gera senhas em memória com crypto.randomBytes", () => {
    expect(RUNNER).toMatch(/randomBytes\(\s*32\s*\)/);
  });
  test("cobre os 5 papéis + no-role", () => {
    for (const r of ["administrador","financeiro","gestor","administrativo","cliente_produtor"]) {
      expect(RUNNER).toContain(`"${r}"`);
    }
    expect(RUNNER).toMatch(/key:\s*"none"[\s\S]*?role:\s*null/);
  });
  test("matriz RLS proíbe UPDATE/DELETE para todos e checa contagem", () => {
    expect(RUNNER).toMatch(/UPDATE\/DELETE:\s*NENHUM/);
    expect(RUNNER).toMatch(/count:\s*"exact"/);
  });
});

describe("SINIEF 4.0.1 · sem provedor/URL/transmissão/XML/secret aparente", () => {
  const bag = [PRE, POST, FIX, SCE, CLE].join("\n");
  test("SQLs limpos", () => {
    const s = strip(bag);
    expect(s).not.toMatch(/sefaz/i);
    expect(s).not.toMatch(/focus[_-]?nfe/i);
    expect(s).not.toMatch(/https?:\/\//i);
    expect(s).not.toMatch(/<\?xml/);
  });
  test("sem secrets hardcoded em nenhum artefato", () => {
    const all = bag + "\n" + README + "\n" + RUNNER;
    expect(all).not.toMatch(/SUPABASE_ACCESS_TOKEN\s*=\s*['"]?\S/);
    expect(all).not.toMatch(/service_role_key\s*=\s*['"]ey/i);
    expect(all).not.toMatch(/sb_secret_[A-Za-z0-9]{8,}/);
    expect(all).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/);
  });
});

describe("SINIEF 4.0.1 · README impõe ordem e proíbe migration repair", () => {
  test("ordem canônica presente", () => {
    const order = [
      "00-snapshot-pre.sql",
      "20260807000000_fiscal_sinief_49_scaffolding.sql",
      "01-snapshot-post.sql",
      "runner/run-staging.ts",
      "verify-fiscal-types",
      "verify-fiscal-types-sinief49",
      "typecheck",
      "vitest",
    ];
    let cursor = 0;
    for (const tok of order) {
      const at = README.indexOf(tok, cursor);
      expect(at, `fora de ordem: ${tok}`).toBeGreaterThan(-1);
      cursor = at;
    }
  });
  test("proíbe migration repair sem divergência", () => {
    expect(README).toMatch(/migration repair.*proibido.*sem divergência/i);
  });
  test("staging-only + rejeita produção", () => {
    expect(README).toContain(STAGING_REF);
    expect(README).toContain(PROD_REF);
    expect(README).toMatch(/Ref proibido[^\n]*navfzbwgwzruipouyfnk/);
  });
});

describe("SINIEF 4.0.1 · invariantes runtime preservados", () => {
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
