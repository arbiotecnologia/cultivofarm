# Bateria 02d (crédito de produção no HML). Prefixo copiado de test_hml_pg.py por credit/make_credit_test.py; não editar.
#!/usr/bin/env python3
"""Bateria PostgreSQL descartável do perfil Financeiro B2B. Auth sintética (GUC sub/iat):
NÃO prova JWT/PostgREST/RLS/Storage hospedados."""
import json, os, shutil, subprocess, tempfile, time, hashlib
from pathlib import Path
HM = Path(__file__).resolve().parent.parent; H = HM.parent
TMP = Path(tempfile.mkdtemp(prefix="b2bfin-pg-", dir="/tmp")); TMP.chmod(0o777)
os.environ["PATH"] = str(Path(shutil.which("initdb")).resolve().parent) + os.pathsep + os.environ["PATH"]  # mesma instalação real ($libdir coerente)
PRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
PORT = os.environ.get("B2BFIN_PORT", "55652")
PSQL = ["psql", "-X", "-h", str(TMP), "-p", PORT, "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1", "-d", "postgres"]
results = []
PINS = json.loads((H / "pins.json").read_text())
def U(n): return f"10000000-0000-0000-0000-{n:012d}"
ORG_A, ORG_B = "00000000-0000-0000-0000-0000000000a1", "00000000-0000-0000-0000-0000000000b1"
P1, P2, PB = "20000000-0000-0000-0000-000000000001", "20000000-0000-0000-0000-000000000002", "20000000-0000-0000-0000-000000000003"
G1, F1, F2, FB, T1, FM, FR, FI, FX, FV, FP, ADM, ADMB, NEW1, NEW2 = (U(i) for i in range(1, 16))
IAT = int(time.time())

def run(sql, error=None):
    c = subprocess.run(PSQL, input=sql, text=True, capture_output=True)
    if error is not None:
        assert c.returncode != 0 and error in c.stderr, (error, c.stdout, c.stderr); return c.stderr
    if c.returncode: raise AssertionError(c.stderr)
    return c.stdout.strip()
def check(name, sql, expected=None, error=None):
    out = run(sql, error)
    if expected is not None: assert out == str(expected), (name, out, expected)
    results.append({"name": name, "status": "PASS"}); print("PASS", name)
def act(uid, sql, iat=IAT):
    claims = json.dumps({"sub": uid, "role": "authenticated", "iat": iat})
    return f"SET request.jwt.claim.sub='{uid}';SET request.jwt.claims='{claims}';SET ROLE authenticated;\n{sql}"
def svc(sql):
    return "SET request.jwt.claim.role='service_role';SET request.jwt.claims='{\"role\":\"service_role\"}';\n" + sql
def own(uid, partner): return act(uid, f"SELECT string_agg(r->>'numero',',' ORDER BY r->>'numero') FROM jsonb_array_elements(public.rpc_portal_partner_financial('{partner}',true)->'rows') r;")
def cap(uid, key="allowed"): return act(uid, f"SELECT public.b2b_finance_capability_v1()->>'{key}';")
LOAD = ["platform_private.platform_actor_access_ready", "platform_private.has_role", "has_role", "platform_private.h15_actor_organization",
        "h15_actor_organization", "is_platform_superadmin", "is_valid_b2b_partner_user",
        "platform_private.b2b_own_obligations_owner", "platform_private.b2b_own_obligations", "rpc_portal_partner_financial",
        
        "rpc_partner_message_counters",
        "platform_private.b2b_credit_config_block"]
CHAIN = []
data = TMP / "data"
try:
    subprocess.run(PRIV + ["initdb", "-D", str(data), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(PRIV + ["pg_ctl", "-D", str(data), "-l", str(TMP / "log"), "-o", f"-k {TMP} -h \"\" -p {PORT}", "start", "-w"], check=True, capture_output=True)
    run((H / "fixture.sql").read_text())
    for n in LOAD: run((H / "captured" / f"{n}.sql").read_text() + ";")
    for n in CHAIN:  # cadeia LIVE: md5 pinado e ACL LIVE (só postgres)
        assert hashlib.md5((H / "captured" / f"{n}.sql").read_text().encode()).hexdigest() == PINS[n][1], ("DRIFT", n)
        run(f"DO $$ DECLARE f regprocedure; BEGIN FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname||'.'||p.proname='{n}' LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||f||' FROM PUBLIC'; END LOOP; END $$;")
    run((HM / "captured" / "admin_provision_user_profile_v1.sql").read_text() + ";")  # corpo HML 9a2e228a
    run("ALTER TABLE public.partner_orders ADD COLUMN total numeric(12,2);" + (HM / "captured" / "fn_b2b_credit_exposure.sql").read_text() + ";")  # corpo HML 213ac31f  # ACL LIVE: só postgres
    run("REVOKE ALL ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_b2b_credit_exposure(uuid,numeric,uuid) TO authenticated;"
        "GRANT EXECUTE ON FUNCTION public.rpc_partner_message_counters(uuid) TO authenticated;")
    run("GRANT EXECUTE ON FUNCTION public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid) TO authenticated;"
        "REVOKE ALL ON FUNCTION public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid) FROM PUBLIC, anon;")
    run((H / "fixture-post.sql").read_text())
    pre = (HM / "01-pre-hml.sql.readonly").read_text()
    check("pre_ref_divergente_falha", "SET app.expected_ref='wrong';\n" + pre, error="B2B_FIN_PRE_REF_UNPROVEN")
    # Drift simulado: corpo diferente aborta o PRE.
    run("CREATE OR REPLACE FUNCTION platform_private.b2b_own_obligations_owner(p_partner_id uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;")
    check("pre_drift_aborta", "SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + pre, error="B2B_FIN_PRE_DRIFT")
    run((H / "captured" / "platform_private.b2b_own_obligations_owner.sql").read_text() + ";")
    check("pre_pass", "SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + pre, "PRE_PASS|f")
    check("install_sem_enum_aborta", "SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + (HM / "02b-install-hml.sql.review").read_text(), error="B2B_FIN_INSTALL_ENUM_MISSING")
    run((HM / "02a-install-enum-hml.sql.review").read_text())
    run("SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + (HM / "02b-install-hml.sql.review").read_text())
    check("post_pass", (HM / "03-post-hml.sql.readonly").read_text(), "POST_PASS")
    CR = HM / "credit"
    run("CREATE FUNCTION platform_private.homolog_validation_block_receivable_insert() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED' USING ERRCODE='42501'; END$$;")  # impressão digital HML
    # HML real não tem tabelas B4: remove as SINTÉTICAS da fixture (a bateria geral as usa como costura).
    run("DROP TABLE platform_private.b2b_allocation_reversals, platform_private.b2b_document_allocations, platform_private.b2b_authorized_documents, platform_private.price_schedule_snapshots, platform_private.b2b_financial_forecasts, platform_private.b4_order_condition_snapshots CASCADE;")
    E = "SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n"
    check("02d_pre_ref_obrigatorio", (CR / "01d-pre-credit-hml.sql.readonly").read_text(), error="B2B_FIN_02D_REF_UNPROVEN")
    run("CREATE TABLE platform_private.b2b_financial_forecasts(x int);")
    check("02d_pre_tabela_divergente_aborta", E + (CR / "01d-pre-credit-hml.sql.readonly").read_text(), error="B2B_FIN_02D_DRIFT: tabela")
    run("DROP TABLE platform_private.b2b_financial_forecasts;")
    run("CREATE FUNCTION platform_private.b2b_debtor_partner(p uuid) RETURNS uuid LANGUAGE sql AS $$ SELECT p $$;")
    check("02d_pre_helper_divergente_aborta", E + (CR / "01d-pre-credit-hml.sql.readonly").read_text(), error="B2B_FIN_02D_DRIFT: platform_private.b2b_debtor_partner")
    run("DROP FUNCTION platform_private.b2b_debtor_partner(uuid);")
    check("02d_pre_pass", E + (CR / "01d-pre-credit-hml.sql.readonly").read_text() + "SELECT 1;", None)
    run(f"""INSERT INTO organizations(id) VALUES('{ORG_A}'),('{ORG_B}');
INSERT INTO partner_accounts(id,commercial_owner_organization_id,razao_social,nome_fantasia) VALUES('{P1}','{ORG_A}','P1 LTDA','P1'),('{P2}','{ORG_A}','P2 LTDA','P2'),('{PB}','{ORG_B}','PB LTDA','PB');
INSERT INTO platform_private.t_ent VALUES('{ORG_A}','pedidos_b2b'),('{ORG_A}','contas_receber'),('{ORG_B}','pedidos_b2b'),('{ORG_B}','contas_receber');
INSERT INTO profiles(user_id,organization_id) SELECT u, CASE WHEN u IN ('{FB}') THEN '{ORG_B}'::uuid ELSE '{ORG_A}'::uuid END FROM unnest(ARRAY['{G1}','{F1}','{F2}','{FB}','{FR}','{ADM}']::uuid[]) u;
INSERT INTO user_roles VALUES('{G1}','parceiro_b2b'),('{F1}','parceiro_b2b_financeiro'),('{F2}','parceiro_b2b_financeiro'),('{FB}','parceiro_b2b_financeiro'),('{FR}','parceiro_b2b_financeiro'),('{ADM}','administrador');
INSERT INTO partner_users(partner_id,user_id,papel,tenant_id) VALUES('{P1}','{G1}','gestor','{ORG_A}'),('{P1}','{F1}','financeiro','{ORG_A}'),('{P2}','{F2}','financeiro','{ORG_A}'),('{PB}','{FB}','financeiro','{ORG_B}');
INSERT INTO partner_users(partner_id,user_id,papel,tenant_id,valid_from,revoked_at,revoked_by,revoke_reason) VALUES('{P1}','{FR}','financeiro','{ORG_A}',now()-interval '2 day',now()-interval '1 day','{ADM}','saiu');
INSERT INTO partner_orders(id,partner_id,numero) VALUES('30000000-0000-0000-0000-000000000001','{P1}','PED-P1'),('30000000-0000-0000-0000-000000000002','{P2}','PED-P2'),('30000000-0000-0000-0000-000000000003','{PB}','PED-PB');
INSERT INTO accounts_receivable(id,total_amount,partner_id,origin_type,origin_id,organization_id) VALUES
 ('40000000-0000-0000-0000-000000000001',1000,'{P1}','B2B_ORDER','30000000-0000-0000-0000-000000000001','{ORG_A}'),
 ('40000000-0000-0000-0000-000000000002',2000,'{P2}','B2B_ORDER','30000000-0000-0000-0000-000000000002','{ORG_A}'),
 ('40000000-0000-0000-0000-000000000003',3000,'{PB}','B2B_ORDER','30000000-0000-0000-0000-000000000003','{ORG_B}');
INSERT INTO partner_order_financial_links(partner_order_id,receivable_id,partner_id) SELECT origin_id,id,partner_id FROM accounts_receivable;
INSERT INTO accounts_receivable_installments(receivable_id,installment_number,due_date,original_amount,received_amount,status,organization_id)
 SELECT id,1,current_date+30,total_amount,0,'OPEN',organization_id FROM accounts_receivable;
UPDATE partner_orders po SET final_amount_with_interest=a.total_amount FROM accounts_receivable a WHERE a.origin_id=po.id;
INSERT INTO partner_financial_settings VALUES('{P1}',10000,0,true,'block'),('{P2}',5000,0,false,'block'),('{PB}',7000,0,false,'block');""")
    # Origem legada provada FICTÍCIA pelo MESMO fragmento do seed 05 (hml/seed/_legacy_origin.sql).
    run("CREATE TABLE IF NOT EXISTS public.partner_order_payment_terms(id uuid PRIMARY KEY, partner_order_id uuid NOT NULL, plan_name_snapshot text NOT NULL, plan_code_snapshot text NOT NULL, discount_percent_snapshot numeric NOT NULL, monthly_interest_percent_snapshot numeric NOT NULL, months_count_snapshot numeric NOT NULL, installment_count int, first_due_date date NOT NULL, table_amount numeric, discount_amount numeric, net_amount_after_discount numeric, financial_interest_amount numeric, final_amount numeric, approval_status text);"
        "CREATE SCHEMA qa_b2bfin; CREATE TABLE qa_b2bfin.manifest(kind text NOT NULL, label text, tbl regclass NOT NULL, id uuid NOT NULL, PRIMARY KEY (tbl, id));"
        + (HM / "seed" / "_legacy_origin.sql").read_text()
        + "SELECT qa_b2bfin.seed_legacy_origin(origin_id, id, partner_id, organization_id, id::text) FROM accounts_receivable;")
    cred = lambda uid, k: act(uid, f"SELECT public.b2b_finance_credit_v1()->>'{k}';")
    check("antes_02d_credito_fechado", cred(F1, "credit_limit"), error="own_finance_credit_unavailable")
    check("02d_install", E + (CR / "02d-install-credit-hml.sql.review").read_text(), None)
    post = (CR / "03d-post-credit-hml.sql.readonly").read_text().replace("cdb78993-89e4-48db-956e-f40b014a8146", P1).replace("9d53f280-f828-4af8-a08c-3574263dc466", P2).replace("6100c3ac-ff5b-4596-a0e3-92665a5dcaab", PB)
    snap = run(E + post); print(snap); assert snap.count("POST_02D_PASS") == 3 and '"credit_limit": 10000' in snap, snap; results.append({"name": "02d_post_pass_snapshot", "status": "PASS"})
    check("capacidade_credito_aberto", cap(F1, "credit_read"), "true")
    check("credito_A_limite", cred(F1, "credit_limit"), "10000.00")
    check("credito_A_partner", cred(F1, "partner_id"), P1)
    check("credito_A_exposicao", cred(F1, "exposicao_atual"), "1000.00")
    check("credito_A_disponivel", cred(F1, "credito_disponivel"), "9000.00")
    check("credito_B_exposicao_propria", cred(F2, "exposicao_atual"), "2000.00")
    check("credito_C_disponivel_proprio", cred(FB, "credito_disponivel"), "4000.00")
    # guarda real de produção ativa: sem a auditoria INSERT do writer, o crédito falha fechado (não soma às cegas)
    run("CREATE TABLE public._keep AS SELECT * FROM financial_audit_log WHERE entity_type='accounts_receivable_installments'; DELETE FROM financial_audit_log WHERE entity_type='accounts_receivable_installments' AND entity_id IN (SELECT id FROM accounts_receivable_installments WHERE receivable_id='40000000-0000-0000-0000-000000000001');")
    check("credito_sem_prova_writer_falha_fechado", cred(F1, "credit_limit"), error="B2B_LEGACY_WRITER_UNPROVEN")
    check("credito_outro_parceiro_nao_afetado", cred(F2, "credit_limit"), "5000.00")
    run("INSERT INTO financial_audit_log SELECT * FROM public._keep k WHERE NOT EXISTS (SELECT 1 FROM financial_audit_log f WHERE f.id=k.id); DROP TABLE public._keep;")
    check("credito_A_restabelecido", cred(F1, "credit_limit"), "10000.00")
    check("credito_B_mesma_empresa_isolado", cred(F2, "credit_limit"), "5000.00")
    check("credito_C_outro_tenant_isolado", cred(FB, "credit_limit"), "7000.00")
    check("credito_revogado_negado", cred(FR, "credit_limit"), error="42501" if False else "own_finance")
    check("credito_gestor_negado", cred(G1, "credit_limit"), error="own_finance")
    check("nucleo_sem_execute_cliente", act(F1, f"SELECT platform_private.b2b_credit_exposure_core('{P2}',0,NULL);"), error="permission denied")
    check("balancos_sem_execute_cliente", act(F1, f"SELECT platform_private.b2b_credit_balances_core('{P2}',NULL,'{ORG_A}');"), error="permission denied")
    check("sem_wrapper_publica_nova", "SELECT to_regprocedure('platform_private.b2b_credit_balances(uuid,uuid)') IS NULL AND to_regprocedure('platform_private.b2b_integration_actor(uuid)') IS NULL;", "t")
    # mesma fórmula: núcleo HML == núcleo de produção (corpo idêntico, md5)
    pins = json.loads((CR / "credit-pins.json").read_text())
    check("nucleos_identicos_producao", "SELECT string_agg(md5(prosrc),',' ORDER BY proname) FROM pg_proc WHERE proname IN ('b2b_credit_balances_core','b2b_credit_exposure_core');", ",".join(pins["cores"][k] for k in sorted(pins["cores"])))
    check("04d_rollback", E + (CR / "04d-rollback-credit-hml.sql.review").read_text(), None)
    check("apos_rollback_credito_fechado", cred(F1, "credit_limit"), error="own_finance_credit_unavailable")
    check("apos_rollback_capacidade_motivo", cap(F1, "credit_reason"), "credit_chain_unavailable")
    check("apos_rollback_sem_objetos", "SELECT to_regclass('platform_private.b2b_document_allocations') IS NULL AND to_regprocedure('platform_private.b2b_credit_exposure_core(uuid,numeric,uuid)') IS NULL AND to_regclass('platform_private.b2b_fin_02d_objects') IS NULL;", "t")
    check("02d_reinstala_apos_rollback", E + (CR / "02d-install-credit-hml.sql.review").read_text(), None)
    check("reinstalado_credito", cred(F1, "credit_limit"), "10000.00")
finally:
    subprocess.run(PRIV + ["pg_ctl", "-D", str(data), "stop", "-m", "immediate"], capture_output=True)
    (HM / "credit" / "evidence-credit-local.json").write_text(json.dumps({"total": len(results), "results": results, "note": "PostgreSQL descartável; auth sintética; cadeia de PRODUÇÃO real (md5); não prova JWT/RLS hospedados"}, indent=1, ensure_ascii=False))
