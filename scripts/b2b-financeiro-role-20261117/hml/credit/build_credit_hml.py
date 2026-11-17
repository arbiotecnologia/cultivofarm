#!/usr/bin/env python3
"""Gera o pacote 02d (crédito canônico de PRODUÇÃO no HML) a partir de: corpos LIVE de produção em ../../captured (md5 em
../../pins.json), núcleos/leitores do 02b de produção (gerado por build.py) e estrutura das tabelas B4 de produção
(prod-b4-tables.json). Nunca editar os .sql gerados à mão; drift aborta."""
import hashlib, json, re
from pathlib import Path
D = Path(__file__).resolve().parent; H = D.parent.parent
PINS = json.loads((H / "pins.json").read_text()); B4 = json.loads((D / "prod-b4-tables.json").read_text())
PROD02B = (H / "02b-install.sql.review").read_text(); HML02B = (D.parent / "02b-install-hml.sql.review").read_text()
# Funções da cadeia efetivamente alcançadas pelo leitor do Financeiro (núcleos SEM b2b_integration_actor):
HELPERS = ["platform_private.b2b_credit_config_block", "platform_private.b2b_debtor_partner", "platform_private.b2b_receivable_partner_scope",
           "platform_private.b2b_allocation_money_row", "platform_private.b2b_legacy_money_row", "platform_private.b2b_proven_money_row_internal",
           "platform_private.b2b_order_residual"]
TABLE_ORDER = ["platform_private.b2b_authorized_documents", "platform_private.b2b_document_allocations", "platform_private.b2b_allocation_reversals",
               "platform_private.price_schedule_snapshots", "platform_private.b2b_financial_forecasts",
               "platform_private.b2b_order_condition_snapshots", "platform_private.b2b_order_condition_quote_snapshots"]
def body(n):
    t = (H / "captured" / f"{n}.sql").read_text()
    assert hashlib.md5(t.encode()).hexdigest() == PINS[n][1], ("DRIFT", n); return t.rstrip()
def prosrc(fdef):
    m = re.search(r"AS \$(\w*)\$(.*)\$\1\$", fdef, re.S); return m.group(2)
def section(text, start):
    i = text.index(start); j = text.index("$function$;", text.index("AS $function$", i) + 13) + len("$function$;"); return text[i:j]
def md5(s): return hashlib.md5(s.encode()).hexdigest()
CORES = [section(PROD02B, "CREATE OR REPLACE FUNCTION platform_private.b2b_credit_balances_core("),
         section(PROD02B, "CREATE OR REPLACE FUNCTION platform_private.b2b_credit_exposure_core(")]
PROD_CAP = section(PROD02B, "CREATE FUNCTION platform_private.b2b_finance_capability_core()").replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
PROD_CRED = section(PROD02B, "CREATE FUNCTION platform_private.b2b_finance_credit_core()").replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
HML_CAP = section(HML02B, "CREATE FUNCTION platform_private.b2b_finance_capability_core()").replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
HML_CRED = section(HML02B, "CREATE FUNCTION platform_private.b2b_finance_credit_core()").replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION", 1)
assert "credit_chain_unavailable" in HML_CAP and "own_finance_credit_unavailable" in HML_CRED and "b2b_credit_exposure_core" in PROD_CRED
P = {"hml_cap": md5(prosrc(HML_CAP)), "hml_cred": md5(prosrc(HML_CRED)), "prod_cap": md5(prosrc(PROD_CAP)), "prod_cred": md5(prosrc(PROD_CRED)),
     "cores": {c.split("FUNCTION ")[1].split("(")[0]: md5(prosrc(c)) for c in CORES}, "helpers": {n: PINS[n][1] for n in HELPERS},
     "tables": {t: B4["tables"][t]["colsig"] for t in TABLE_ORDER}}
FP = """ IF to_regprocedure('platform_private.homolog_validation_block_receivable_insert()') IS NULL THEN RAISE EXCEPTION 'B2B_FIN_02D_REF_UNPROVEN: impressão digital HML ausente'; END IF;
 IF coalesce(current_setting('app.expected_ref', true), '') <> 'vrlcdwmlytukrjezrrnf' THEN RAISE EXCEPTION 'B2B_FIN_02D_REF_UNPROVEN: SET app.expected_ref'; END IF;"""
PIN_FN = ""
def _fx(e, kind):
    return {"fmd5": f"(SELECT md5(p.prosrc) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname=({e}) AND p.prokind='f')",
            "fdef": f"(SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname=({e}) AND p.prokind='f')",
            "colsig": f"(SELECT md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull, ',' ORDER BY a.attnum)) FROM pg_attribute a WHERE a.attrelid=to_regclass({e}) AND a.attnum>0 AND NOT a.attisdropped)"}[kind]
def inline(sql):
    return re.sub(r"pg_temp\.(fmd5|fdef|colsig)\(([^()]*)\)", lambda m: _fx(m.group(2), m.group(1)), sql)
def pre_checks(stage):
    j = json.dumps(P)
    return PIN_FN + f"""DO $$ DECLARE p jsonb := '{j}'; k text; v text;
BEGIN
{FP}
 IF to_regprocedure('platform_private.b2b_credit_balances(uuid,uuid)') IS NOT NULL OR to_regprocedure('platform_private.b2b_integration_actor(uuid)') IS NOT NULL THEN
  RAISE EXCEPTION 'B2B_FIN_02D_UNEXPECTED: cadeia B4 pública presente — recapturar antes'; END IF;
 IF pg_temp.fmd5('platform_private.b2b_finance_credit_core') IS DISTINCT FROM p->>'{"hml_cred" if stage=="pre" else "prod_cred"}'
  OR pg_temp.fmd5('platform_private.b2b_finance_capability_core') IS DISTINCT FROM p->>'{"hml_cap" if stage=="pre" else "prod_cap"}' THEN
  RAISE EXCEPTION 'B2B_FIN_02D_DRIFT: leitores Financeiro HML fora do estado esperado ({stage})'; END IF;
 FOR k, v IN SELECT key, value #>> '{{}}' FROM jsonb_each(p->'helpers') LOOP
  IF pg_temp.fdef(k) IS NOT NULL AND pg_temp.fdef(k) <> v THEN RAISE EXCEPTION 'B2B_FIN_02D_DRIFT: % existe no HML com corpo diferente de produção', k; END IF;
  {"" if stage=="pre" else "IF pg_temp.fdef(k) IS DISTINCT FROM v THEN RAISE EXCEPTION 'B2B_FIN_02D_POST: % ausente/divergente', k; END IF;"}
 END LOOP;
 FOR k, v IN SELECT key, value #>> '{{}}' FROM jsonb_each(p->'tables') LOOP
  IF to_regclass(k) IS NOT NULL AND pg_temp.colsig(k) <> v THEN RAISE EXCEPTION 'B2B_FIN_02D_DRIFT: tabela % difere de produção', k; END IF;
  {"" if stage=="pre" else "IF to_regclass(k) IS NULL THEN RAISE EXCEPTION 'B2B_FIN_02D_POST: % ausente', k; END IF;"}
 END LOOP;
 {"" if stage=="pre" else "FOR k, v IN SELECT key, value #>> '{}' FROM jsonb_each(p->'cores') LOOP IF pg_temp.fmd5(k) IS DISTINCT FROM v THEN RAISE EXCEPTION 'B2B_FIN_02D_POST: núcleo % divergente', k; END IF; END LOOP;"}
 IF to_regclass('public.receivable_payments') IS NULL OR to_regclass('public.partner_order_payment_schedule') IS NULL OR to_regclass('public.financial_audit_log') IS NULL THEN
  RAISE EXCEPTION 'B2B_FIN_02D_DEP: tabela pública da cadeia ausente'; END IF;
END $$;
"""
created = []
inst = ["-- GERADO por build_credit_hml.py; não editar. HML vrlcdwmlytukrjezrrnf SOMENTE. Pré: 02b HML instalado (crédito fechado).",
        "-- Instala a MESMA cadeia de crédito de produção (corpos LIVE md5-pinados) só no caminho privado do Financeiro;",
        "-- NÃO cria b2b_integration_actor/b2b_credit_balances públicos nem altera fn_b2b_credit_exposure legado do HML.",
        "-- Costuras declaradas: FKs para tabelas ausentes no HML (holiday_calendars, b2b_condition_versions) e gatilhos de",
        "-- imutabilidade das tabelas B4 omitidos; tabelas ficam vazias, RLS ON, sem GRANT (só postgres) — escrita fiscal B4 fechada.",
        "BEGIN;", "SET LOCAL lock_timeout = '5s';", pre_checks("pre"),
        "CREATE TABLE platform_private.b2b_fin_02d_objects(kind text NOT NULL, name text PRIMARY KEY);",
        "REVOKE ALL ON platform_private.b2b_fin_02d_objects FROM PUBLIC;"]
fk_ok = ("partner_orders(", "accounts_receivable(", "platform_private.b2b_document_allocations(", "platform_private.b2b_authorized_documents(")
for t in TABLE_ORDER:
    ddl = B4["tables"][t]["ddl"]; fks = [f for f in (B4["tables"][t]["fks"] or "").split(" ; ") if f and f.split("REFERENCES ")[1].startswith(fk_ok)]
    fks = [f.replace("REFERENCES partner_orders(", "REFERENCES public.partner_orders(").replace("REFERENCES accounts_receivable(", "REFERENCES public.accounts_receivable(") for f in fks]
    full = ddl[:-1] + "".join(", " + f for f in fks) + ")"
    inst.append(f"""DO $d$ BEGIN IF to_regclass('{t}') IS NULL THEN
 EXECUTE '{full.replace("'", "''")}';
 EXECUTE 'ALTER TABLE {t} ENABLE ROW LEVEL SECURITY'; EXECUTE 'REVOKE ALL ON {t} FROM PUBLIC';
 INSERT INTO platform_private.b2b_fin_02d_objects VALUES ('table', '{t}'); END IF; END $d$;""")
for v, ddl in B4["views"].items():
    inst.append(f"""DO $d$ BEGIN IF to_regclass('{v}') IS NULL THEN EXECUTE '{ddl.replace("'", "''")}'; EXECUTE 'REVOKE ALL ON {v} FROM PUBLIC';
 INSERT INTO platform_private.b2b_fin_02d_objects VALUES ('view', '{v}'); END IF; END $d$;""")
for n in HELPERS:
    b = body(n)
    inst.append(f"DO $d$ BEGIN IF pg_temp.fdef('{n}') IS NULL THEN EXECUTE {'$q$' + b + '$q$'}; INSERT INTO platform_private.b2b_fin_02d_objects VALUES ('function', '{n}'); END IF; END $d$;")
for c in CORES:
    n = c.split("FUNCTION ")[1].split("(")[0]
    inst.append(c.replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION", 1)); inst.append(f"INSERT INTO platform_private.b2b_fin_02d_objects VALUES ('function', '{n}');")
inst += [PROD_CAP, PROD_CRED,
 """DO $d$ DECLARE f regprocedure; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace JOIN platform_private.b2b_fin_02d_objects o ON o.kind='function' AND o.name=s.nspname||'.'||p.proname LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', f); END LOOP; END $d$;""",
 "REVOKE ALL ON FUNCTION platform_private.b2b_finance_capability_core() FROM PUBLIC, anon, service_role; GRANT EXECUTE ON FUNCTION platform_private.b2b_finance_capability_core() TO authenticated;",
 "REVOKE ALL ON FUNCTION platform_private.b2b_finance_credit_core() FROM PUBLIC, anon, service_role; GRANT EXECUTE ON FUNCTION platform_private.b2b_finance_credit_core() TO authenticated;",
 pre_checks("post"), "SELECT 'INSTALL_02D_OK' k, (SELECT jsonb_agg(name ORDER BY name) FROM platform_private.b2b_fin_02d_objects) criados;", "COMMIT;"]
(D / "02d-install-credit-hml.sql.review").write_text(inline("\n".join(inst) + "\n"))
(D / "01d-pre-credit-hml.sql.readonly").write_text(inline("-- GERADO; HML somente leitura. Deve retornar PRE_02D_PASS antes do 02d.\nBEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n" + pre_checks("pre") +
  "SELECT 'PRE_02D_PASS' k, (SELECT jsonb_object_agg(k, to_regclass(k) IS NOT NULL) FROM jsonb_object_keys('" + json.dumps(P["tables"]) + "'::jsonb) k) tabelas_existentes,\n (SELECT jsonb_object_agg(k, pg_temp.fdef(k)) FROM jsonb_object_keys('" + json.dumps(P["helpers"]) + "'::jsonb) k) helpers_md5;\nROLLBACK;\n"))
QA = ["cdb78993-89e4-48db-956e-f40b014a8146", "9d53f280-f828-4af8-a08c-3574263dc466", "6100c3ac-ff5b-4596-a0e3-92665a5dcaab"]
(D / "03d-post-credit-hml.sql.readonly").write_text(inline("-- GERADO; HML somente leitura após 02d. POST_02D_PASS + snapshot do núcleo para os 3 parceiros QA.\nBEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n" + pre_checks("post") +
 """DO $$ BEGIN
 IF has_function_privilege('authenticated','platform_private.b2b_credit_exposure_core(uuid,numeric,uuid)','EXECUTE') OR has_function_privilege('anon','platform_private.b2b_credit_exposure_core(uuid,numeric,uuid)','EXECUTE')
  OR has_function_privilege('authenticated','platform_private.b2b_credit_balances_core(uuid,uuid,uuid)','EXECUTE') OR has_function_privilege('anon','public.b2b_finance_credit_v1()','EXECUTE')
  THEN RAISE EXCEPTION 'B2B_FIN_02D_POST: ACL ampla'; END IF; END $$;
SELECT 'POST_02D_PASS' k, p::text partner, platform_private.b2b_credit_exposure_core(p, 0, NULL) snapshot FROM unnest('{""" + ",".join(QA) + """}'::uuid[]) p;
ROLLBACK;
"""))
rb = ["-- GERADO por build_credit_hml.py; não editar. Volta o HML ao estado 02b (crédito fechado) e remove SÓ o que o 02d criou (ledger).",
      "BEGIN;", "SET LOCAL lock_timeout = '5s';", PIN_FN,
      f"""DO $$ BEGIN
{FP}
 IF to_regclass('platform_private.b2b_fin_02d_objects') IS NULL THEN RAISE EXCEPTION 'B2B_FIN_04D_NOT_INSTALLED'; END IF;
 IF pg_temp.fmd5('platform_private.b2b_finance_credit_core') <> '{P["prod_cred"]}' OR pg_temp.fmd5('platform_private.b2b_finance_capability_core') <> '{P["prod_cap"]}' THEN RAISE EXCEPTION 'B2B_FIN_04D_DRIFT'; END IF;
END $$;""", HML_CAP, HML_CRED,
      """DO $$ DECLARE o record; n bigint; f regprocedure; BEGIN
 FOR o IN SELECT * FROM platform_private.b2b_fin_02d_objects WHERE kind='function' LOOP
  FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname=o.name LOOP EXECUTE 'DROP FUNCTION '||f; END LOOP; END LOOP;
 FOR o IN SELECT * FROM platform_private.b2b_fin_02d_objects WHERE kind='view' LOOP EXECUTE 'DROP VIEW '||o.name; END LOOP;
 FOR o IN SELECT * FROM platform_private.b2b_fin_02d_objects WHERE kind='table' ORDER BY CASE name WHEN 'platform_private.b2b_allocation_reversals' THEN 0 WHEN 'platform_private.b2b_document_allocations' THEN 1 ELSE 2 END LOOP
  EXECUTE 'SELECT count(*) FROM '||o.name INTO n; IF n <> 0 THEN RAISE EXCEPTION 'B2B_FIN_04D_REFUSED: % tem linhas — preservar histórico', o.name; END IF; EXECUTE 'DROP TABLE '||o.name; END LOOP;
 DROP TABLE platform_private.b2b_fin_02d_objects;
END $$;""",
      f"""DO $$ BEGIN IF pg_temp.fmd5('platform_private.b2b_finance_credit_core') <> '{P["hml_cred"]}' OR pg_temp.fmd5('platform_private.b2b_finance_capability_core') <> '{P["hml_cap"]}' THEN RAISE EXCEPTION 'B2B_FIN_04D_RESTORE_DRIFT'; END IF; END $$;""",
      "REVOKE ALL ON FUNCTION platform_private.b2b_finance_credit_core() FROM PUBLIC, anon, service_role; GRANT EXECUTE ON FUNCTION platform_private.b2b_finance_credit_core() TO authenticated;",
      "REVOKE ALL ON FUNCTION platform_private.b2b_finance_capability_core() FROM PUBLIC, anon, service_role; GRANT EXECUTE ON FUNCTION platform_private.b2b_finance_capability_core() TO authenticated;",
      "SELECT 'ROLLBACK_02D_OK' k;", "COMMIT;"]
(D / "04d-rollback-credit-hml.sql.review").write_text(inline("\n".join(rb) + "\n"))
(D / "credit-pins.json").write_text(json.dumps(P, indent=1))
(D / "SHA256SUMS").write_text("".join(f"{hashlib.sha256((D/f).read_bytes()).hexdigest()}  {f}\n" for f in
  ["prod-b4-tables.json", "01d-pre-credit-hml.sql.readonly", "02d-install-credit-hml.sql.review", "03d-post-credit-hml.sql.readonly", "04d-rollback-credit-hml.sql.review", "credit-pins.json"]))
print("ok", P["hml_cap"], P["prod_cap"])
