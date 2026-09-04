#!/usr/bin/env node
// H7O — Aplicador fail-fast de migrations no STAGING (ikaauvsflpmamgxmkhoq) com registro exato no ledger.
//
// Para cada arquivo (ordem dos argumentos):
//   1) recusa produção (navfzbwgwzruipouyfnk) e qualquer DSN que não seja o staging autorizado;
//   2) confere o marcador server-side public.fiscal_environment_marker (STAGING, produção fiscal off);
//   3) se a versão já existe no ledger: exige statements[1] == conteúdo do arquivo (md5) e pula (idempotente);
//      se difere → ABORT (nunca sobrescreve ledger);
//   4) caso contrário: BEGIN; executa o SQL do arquivo; INSERT em supabase_migrations.schema_migrations
//      (version, name, statements=[conteúdo exato], created_by); COMMIT — tudo na MESMA transação;
//   5) reconfere md5(ledger) == md5(arquivo).
// Nunca imprime o DSN nem segredos. Usa o driver `pg` já presente em node_modules.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";

const PROD_REF = "navfzbwgwzruipouyfnk";
const STAGING_REF = "ikaauvsflpmamgxmkhoq";

const dsn = process.env.STAGING_DSN;
if (!dsn) { console.error("ABORT: STAGING_DSN ausente"); process.exit(4); }
if (dsn.includes(PROD_REF)) { console.error("ABORT: DSN aponta PRODUCAO"); process.exit(2); }
if (!dsn.includes(STAGING_REF)) { console.error("ABORT: DSN nao e o staging autorizado"); process.exit(2); }

const files = process.argv.slice(2);
if (files.length === 0) { console.error("uso: h7o-apply.mjs <migration.sql> [...]"); process.exit(1); }

const md5 = (s) => createHash("md5").update(s, "utf8").digest("hex");
const CREATED_BY = process.env.H7O_CREATED_BY || "h7o-apply.mjs (psql-equivalent, staging)";

// Supabase usa certificado próprio na cadeia; semântica libpq para sslmode=require (sem verify-full).
const dsnCompat = dsn.includes("uselibpqcompat=") ? dsn : dsn + (dsn.includes("?") ? "&" : "?") + "uselibpqcompat=true";
const client = new pg.Client({ connectionString: dsnCompat, ssl: { rejectUnauthorized: false }, application_name: "h7o-apply" });
await client.connect();

try {
  const marker = await client.query(
    "select project_ref, environment_label, production_emission_allowed from public.fiscal_environment_marker limit 1");
  const m = marker.rows[0];
  if (!m || m.project_ref !== STAGING_REF || m.environment_label !== "STAGING" || m.production_emission_allowed) {
    console.error("ABORT: marcador de ambiente invalido/ausente"); process.exit(3);
  }
  console.log(`marker OK: ${m.project_ref} ${m.environment_label}`);

  for (const file of files) {
    const base = basename(file);
    const mt = base.match(/^(\d{14})_(.+)\.sql$/);
    if (!mt) { console.error(`ABORT: nome invalido: ${base}`); process.exit(1); }
    const version = mt[1], name = mt[2];
    const content = readFileSync(file, "utf8");
    const fileMd5 = md5(content);

    const existing = await client.query(
      "select statements from supabase_migrations.schema_migrations where version = $1", [version]);
    if (existing.rowCount > 0) {
      const st = existing.rows[0].statements || [];
      const dbMd5 = md5(st.join("\n"));
      if (dbMd5 === fileMd5) { console.log(`SKIP  ${base} ja aplicada (md5 ${fileMd5})`); continue; }
      console.error(`ABORT: versao ${version} ja existe no ledger com conteudo DIFERENTE (repo=${fileMd5} db=${dbMd5})`);
      process.exit(5);
    }

    console.log(`APPLY ${base} ...`);
    try {
      await client.query("begin");
      await client.query(content);
      await client.query(
        "insert into supabase_migrations.schema_migrations(version, name, statements, created_by) values ($1, $2, $3, $4)",
        [version, name, [content], CREATED_BY]);
      await client.query("commit");
    } catch (e) {
      try { await client.query("rollback"); } catch {}
      console.error(`FAIL  ${base}: ${e.message}`);
      process.exit(6);
    }
    const check = await client.query(
      "select md5(array_to_string(statements, E'\\n')) as m from supabase_migrations.schema_migrations where version = $1", [version]);
    if (check.rows[0]?.m !== fileMd5) { console.error(`ABORT: ledger ${version} nao confere apos aplicar`); process.exit(7); }
    console.log(`OK    ${base} aplicada e registrada (md5 ${fileMd5})`);
  }
} finally {
  await client.end();
}
