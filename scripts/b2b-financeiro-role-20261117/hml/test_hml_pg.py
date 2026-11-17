# GERADO por hml/make_hml_test.py; não editar.
#!/usr/bin/env python3
"""Bateria PostgreSQL descartável do perfil Financeiro B2B. Auth sintética (GUC sub/iat):
NÃO prova JWT/PostgREST/RLS/Storage hospedados."""
import json, os, shutil, subprocess, tempfile, time, hashlib
from pathlib import Path
HM = Path(__file__).resolve().parent; H = HM.parent
TMP = Path(tempfile.mkdtemp(prefix="b2bfin-pg-", dir="/tmp")); TMP.chmod(0o777)
os.environ["PATH"] = str(Path(shutil.which("initdb")).resolve().parent) + os.pathsep + os.environ["PATH"]  # mesma instalação real ($libdir coerente)
PRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
PORT = os.environ.get("B2BFIN_PORT", "55641")
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
        "h15_actor_organization", "is_platform_superadmin", "platform_private.require_service_role", "is_valid_b2b_partner_user",
        "platform_private.b2b_own_obligations_owner", "platform_private.b2b_own_obligations", "rpc_portal_partner_financial",
        "platform_private.external_provisioning_scope", "admin_provision_user_profile_v1", "b2b_finish_provisioning",
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
    check("finish_mapeia_papel_financeiro", "SELECT pg_get_functiondef('public.b2b_finish_provisioning(uuid,uuid,uuid)'::regprocedure) LIKE '%WHEN ''parceiro_b2b_financeiro''=ANY(rs) THEN ''financeiro''%';", "t")
    check("post_pass", (HM / "03-post-hml.sql.readonly").read_text(), "POST_PASS")
    # Dados
    run(f"""INSERT INTO organizations(id) VALUES('{ORG_A}'),('{ORG_B}');
INSERT INTO partner_accounts(id,commercial_owner_organization_id,razao_social,nome_fantasia) VALUES('{P1}','{ORG_A}','P1 LTDA','P1'),('{P2}','{ORG_A}','P2 LTDA','P2'),('{PB}','{ORG_B}','PB LTDA','PB');
INSERT INTO platform_private.t_ent VALUES('{ORG_A}','pedidos_b2b'),('{ORG_A}','contas_receber'),('{ORG_A}','catalogo_precos'),('{ORG_B}','pedidos_b2b'),('{ORG_B}','contas_receber'),('{ORG_B}','catalogo_precos');
INSERT INTO profiles(user_id,organization_id) SELECT u, CASE WHEN u IN ('{FB}','{ADMB}') THEN '{ORG_B}'::uuid ELSE '{ORG_A}'::uuid END FROM unnest(ARRAY['{G1}','{F1}','{F2}','{FB}','{T1}','{FM}','{FR}','{FI}','{FX}','{FV}','{FP}','{ADM}','{ADMB}']::uuid[]) u;
INSERT INTO user_roles VALUES('{G1}','parceiro_b2b'),('{F1}','parceiro_b2b_financeiro'),('{F2}','parceiro_b2b_financeiro'),('{FB}','parceiro_b2b_financeiro'),
 ('{T1}','parceiro_b2b_tecnico'),('{FM}','parceiro_b2b_financeiro'),('{FM}','parceiro_b2b_tecnico'),('{FR}','parceiro_b2b_financeiro'),('{FI}','parceiro_b2b_financeiro'),
 ('{FX}','parceiro_b2b_financeiro'),('{FV}','parceiro_b2b_financeiro'),('{FP}','parceiro_b2b_financeiro'),('{ADM}','administrador'),('{ADMB}','administrador');
INSERT INTO partner_users(partner_id,user_id,papel,tenant_id) VALUES('{P1}','{G1}','gestor','{ORG_A}'),('{P1}','{F1}','financeiro','{ORG_A}'),('{P2}','{F2}','financeiro','{ORG_A}'),
 ('{PB}','{FB}','financeiro','{ORG_B}'),('{P1}','{T1}','tecnico','{ORG_A}'),('{P1}','{FM}','financeiro','{ORG_A}'),('{P1}','{FI}','financeiro','{ORG_A}'),('{P1}','{FP}','tecnico','{ORG_A}');
INSERT INTO partner_users(partner_id,user_id,papel,tenant_id,valid_from) VALUES('{P1}','{FV}','financeiro','{ORG_A}',now()+interval '1 day');
INSERT INTO partner_users(partner_id,user_id,papel,tenant_id,valid_from,revoked_at,revoked_by,revoke_reason) VALUES('{P1}','{FR}','financeiro','{ORG_A}',now()-interval '2 day',now()-interval '1 day','{ADM}','saiu');
UPDATE profiles SET ativo=false WHERE user_id='{FI}';
INSERT INTO partner_orders(id,partner_id,numero) VALUES('30000000-0000-0000-0000-000000000001','{P1}','PED-P1'),('30000000-0000-0000-0000-000000000002','{P2}','PED-P2'),('30000000-0000-0000-0000-000000000003','{PB}','PED-PB');
INSERT INTO accounts_receivable(id,total_amount,partner_id,origin_type,origin_id,organization_id) VALUES
 ('40000000-0000-0000-0000-000000000001',1000,'{P1}','B2B_ORDER','30000000-0000-0000-0000-000000000001','{ORG_A}'),
 ('40000000-0000-0000-0000-000000000002',2000,'{P2}','B2B_ORDER','30000000-0000-0000-0000-000000000002','{ORG_A}'),
 ('40000000-0000-0000-0000-000000000003',3000,'{PB}','B2B_ORDER','30000000-0000-0000-0000-000000000003','{ORG_B}');
INSERT INTO partner_order_financial_links(partner_order_id,receivable_id,partner_id) SELECT origin_id,id,partner_id FROM accounts_receivable;
INSERT INTO accounts_receivable_installments(receivable_id,installment_number,due_date,original_amount,received_amount,status,organization_id)
 SELECT id,1,current_date+30,total_amount,0,'OPEN',organization_id FROM accounts_receivable;
UPDATE partner_orders po SET final_amount_with_interest=a.total_amount FROM accounts_receivable a WHERE a.origin_id=po.id;
INSERT INTO platform_private.b2b_authorized_documents(id,organization_id,partner_id,order_id,kind,source_digest,state)
 SELECT gen_random_uuid(),organization_id,partner_id,origin_id,'NFE','dg-'||id,'AUTHORIZED' FROM accounts_receivable;
UPDATE accounts_receivable a SET b2b_document_id=d.id FROM platform_private.b2b_authorized_documents d WHERE d.order_id=a.origin_id;
INSERT INTO platform_private.b2b_document_allocations(document_id,organization_id,order_id,partner_id,receivable_id,source_digest,principal,financed_interest,items,item_money,rows)
 SELECT a.b2b_document_id,a.organization_id,a.origin_id,a.partner_id,a.id,'dg-'||a.id,a.total_amount,0,'[]','[]',
  jsonb_build_array(jsonb_build_object('installment_number',1,'amount',i.original_amount,'principal_amount',i.original_amount,'interest_amount',0,'due_date',i.due_date))
 FROM accounts_receivable a JOIN accounts_receivable_installments i ON i.receivable_id=a.id;
INSERT INTO partner_orders(id,partner_id,numero,status,final_amount_with_interest) VALUES('30000000-0000-0000-0000-000000000011','{P1}','PED-P1-PEND','pendente',500);
INSERT INTO platform_private.b4_order_condition_snapshots(order_id,organization_id,partner_id,financed_total) VALUES('30000000-0000-0000-0000-000000000011','{ORG_A}','{P1}',500);""")
    # Positivos
    check("financeiro_capacidade_propria", cap(F1) + "SELECT public.b2b_finance_capability_v1()->>'partner_id';", f"true\n{P1}")
    check("financeiro_capacidade_sem_escrita_credito_bloqueado", act(F1, "SELECT (c->>'writes')||(c->>'credit_read')||(c->>'export') FROM public.b2b_finance_capability_v1() c;"), "falsefalsetrue")
    run(f"""INSERT INTO partner_financial_settings VALUES('{P1}',10000,0,true,'block'),('{P2}',5000,0,false,'block'),('{PB}',7000,0,false,'block');
INSERT INTO partner_order_messages(order_id,status) VALUES('30000000-0000-0000-0000-000000000001','nao_lida'),('30000000-0000-0000-0000-000000000002','nao_lida');""")
    cred = lambda uid, k: act(uid, f"SELECT public.b2b_finance_credit_v1()->>'{k}';")
    check("hml_capacidade_credito_fechado", cap(F1, "credit_read"), "false")
    check("hml_capacidade_motivo", cap(F1, "credit_reason"), "credit_chain_unavailable")
    check("hml_leitor_credito_fechado", cred(F1, "credit_limit"), error="own_finance_credit_unavailable")
    check("hml_exposicao_legada_intacta", "SELECT md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure));", "213ac31f3a30816ead75365b0d1fed18")
    check("hml_sem_nucleo_credito", "SELECT to_regprocedure('platform_private.b2b_credit_exposure_core(uuid,numeric,uuid)') IS NULL AND to_regprocedure('platform_private.b2b_credit_balances_core(uuid,uuid,uuid)') IS NULL;", "t")
    check("contadores_mensagens_fechados_financeiro", act(F1, "SELECT public.rpc_partner_message_counters(NULL);"), error="permission_denied")
    check("contadores_mensagens_fechados_irmao_explicito", act(F1, f"SELECT public.rpc_partner_message_counters('{P2}');"), error="permission_denied")
    check("contadores_gestor_regressao", act(G1, "SELECT public.rpc_partner_message_counters(NULL)->>'nao_lidas';"), "1")
    check("financeiro_le_obrigacoes_proprias", own(F1, P1), "PED-P1")
    check("financeiro_parcelas_proprias", act(F1, f"SELECT jsonb_array_length(public.rpc_portal_partner_financial('{P1}',true)->'rows'->0->'installments');"), "1")
    check("financeiro_p2_mesma_empresa_isolado", own(F2, P2), "PED-P2")
    check("financeiro_outro_tenant_isolado", own(FB, PB), "PED-PB")
    # Negativos de escopo
    check("financeiro_nega_parceiro_irmao", own(F1, P2), error="own_finance_forbidden")
    check("financeiro_irmao_nega_p1", own(F2, P1), error="own_finance_forbidden")
    check("financeiro_nega_outro_tenant", own(F1, PB), error="own_finance_forbidden")
    check("financeiro_outro_tenant_nega_p1", own(FB, P1), error="own_finance_forbidden")
    check("financeiro_partner_null_negado", act(F1, "SELECT public.rpc_portal_partner_financial(NULL,true);"), error="own_finance_forbidden")
    check("contrato_legado_exige_flag", act(F1, f"SELECT public.rpc_portal_partner_financial('{P1}',false);"), error="own_finance_contract_required")
    for nm, uid in [("tecnico", T1), ("misto_financeiro_tecnico", FM), ("revogado", FR), ("perfil_inativo", FI), ("sem_vinculo", FX), ("vigencia_futura", FV), ("papel_vinculo_divergente", FP)]:
        check(f"{nm}_sem_capacidade", cap(uid), "false")
        check(f"{nm}_obrigacoes_negadas", own(uid, P1), error="own_finance_forbidden")
        check(f"{nm}_credito_negado", act(uid, "SELECT public.b2b_finance_credit_v1();"), error="own_finance_credit_unavailable")
    check("misto_nao_vale_como_tecnico", act(FM, f"SELECT public.is_valid_b2b_partner_user('{FM}','{P1}');"), "f")
    check("financeiro_nao_vale_validador_b2b", act(F1, f"SELECT public.is_valid_b2b_partner_user('{F1}','{P1}');"), "f")
    # Regressão gestor
    check("gestor_regressao_le_proprio", own(G1, P1), "PED-P1")
    check("gestor_regressao_nega_irmao", own(G1, P2), error="own_finance_forbidden")
    check("gestor_nao_e_ator_financeiro", cap(G1, "reason"), "not_finance_actor")
    check("gestor_regressao_pedidos_diretos", act(G1, "SELECT count(*) FROM partner_orders WHERE partner_id <> '" + P1 + "';"), "0")
    # Leituras/escritas diretas
    check("financeiro_pedidos_diretos_zero", act(F1, "SELECT count(*) FROM partner_orders;"), "0")
    check("financeiro_titulos_diretos_zero", act(F1, "SELECT count(*) FROM accounts_receivable;"), "0")
    check("financeiro_links_diretos_fechados", act(F1, "SELECT count(*) FROM partner_order_financial_links;"), "0")
    check("financeiro_conta_parceiro_direta_fechada", act(F1, "SELECT count(*) FROM partner_accounts;"), "0")
    check("tecnico_links_preservados", act(T1, "SELECT count(*) FROM partner_order_financial_links;"), "1")
    check("financeiro_nao_cria_pedido", act(F1, f"INSERT INTO partner_orders(id,partner_id,numero) VALUES(gen_random_uuid(),'{P1}','X');"), error="row-level security")
    check("financeiro_nao_baixa_titulo", act(F1, "UPDATE accounts_receivable SET status='PAID' RETURNING id;"), "")
    check("financeiro_nao_altera_limite_vinculo", act(F1, f"INSERT INTO partner_order_financial_links(partner_order_id,receivable_id,partner_id) VALUES(gen_random_uuid(),gen_random_uuid(),'{P1}');"), error="row-level security")
    check("helper_privado_sem_execute", act(F1, "SELECT platform_private.b2b_finance_actor_partner();"), error="permission denied")
    check("anon_sem_capacidade", "SET ROLE anon; SELECT public.b2b_finance_capability_v1();", error="permission denied")
    # Entitlement e sessão
    run(f"DELETE FROM platform_private.t_ent WHERE org='{ORG_A}' AND feature_key='contas_receber'")
    check("sem_entitlement_capacidade", cap(F1, "reason"), "not_entitled")
    check("sem_entitlement_leitura_negada", own(F1, P1), error="own_finance_forbidden")
    run(f"INSERT INTO platform_private.t_ent VALUES('{ORG_A}','contas_receber')")
    run(f"INSERT INTO platform_private.user_authz_epoch VALUES('{F1}', to_timestamp({IAT}+10))")
    check("token_anterior_a_epoca_negado", own(F1, P1), error="own_finance_forbidden")
    check("token_novo_apos_epoca_aceito", own(F1, P1).replace(f'"iat": {IAT}', f'"iat": {IAT+20}'), "PED-P1")
    run(f"DELETE FROM platform_private.user_authz_epoch")
    run(f"UPDATE partner_users SET revoked_at=now(), revoked_by='{ADM}', revoke_reason='fim' WHERE user_id='{F2}'")
    check("revogacao_retira_acesso", own(F2, P2), error="own_finance_forbidden")
    check("revogacao_retira_credito", act(F2, "SELECT public.b2b_finance_credit_v1();"), error="own_finance_credit_unavailable")
    run(f"UPDATE organizations SET status='suspensa' WHERE id='{ORG_B}'")
    check("empresa_inativa_retira_acesso", own(FB, PB), error="own_finance_forbidden")
    run(f"UPDATE organizations SET status='ativa' WHERE id='{ORG_B}'; UPDATE partner_accounts SET ativo=false WHERE id='{P1}'")
    check("parceiro_inativo_retira_acesso", own(F1, P1), error="own_finance_forbidden")
    run(f"UPDATE partner_accounts SET ativo=true WHERE id='{P1}'; DELETE FROM user_roles WHERE user_id='{F1}'")
    check("papel_removido_retira_acesso", cap(F1), "false")
    run(f"INSERT INTO user_roles VALUES('{F1}','parceiro_b2b_financeiro')")
    check("papel_restaurado_volta", own(F1, P1), "PED-P1")
    # Provisionamento canônico
    def scope(actor, roles, partner):
        pa = f"'{partner}'" if partner else "NULL"
        return act(actor, f"SELECT (platform_private.external_provisioning_scope('{actor}',ARRAY[{roles}]::app_role[],{pa},ARRAY[]::uuid[],NULL)->>'organization_id');")
    run("GRANT EXECUTE ON FUNCTION platform_private.external_provisioning_scope(uuid,app_role[],uuid,uuid[],uuid) TO authenticated;")
    check("cadastro_financeiro_escopo_ok", scope(ADM, "'parceiro_b2b_financeiro'", P1), ORG_A)
    check("cadastro_financeiro_exclusivo", scope(ADM, "'parceiro_b2b_financeiro','parceiro_b2b_tecnico'", P1), error="c2_finance_role_exclusive")
    check("cadastro_financeiro_com_gestor_negado", scope(ADM, "'parceiro_b2b_financeiro','parceiro_b2b'", P1), error="c2_finance_role_exclusive")
    check("cadastro_financeiro_exige_parceiro", scope(ADM, "'parceiro_b2b_financeiro'", None), error="c2_partner_required")
    check("cadastro_admin_outro_tenant_negado", scope(ADMB, "'parceiro_b2b_financeiro'", P1), error="external_provisioning_forbidden")
    check("cadastro_nao_admin_negado", scope(G1, "'parceiro_b2b_financeiro'", P1), error="external_provisioning_forbidden")
    check("cadastro_tecnico_regressao", scope(ADM, "'parceiro_b2b_tecnico'", P1), ORG_A)
    run(f"INSERT INTO profiles(user_id,organization_id) VALUES('{NEW1}','{ORG_A}'),('{NEW2}','{ORG_A}')")
    prov = lambda u, roles, papel: svc(f"SELECT public.admin_provision_user_profile_v1('{u}','n@x.io','N',ARRAY[{roles}]::app_role[],ARRAY[]::uuid[],NULL,'{P1}',{papel});")
    check("provisao_papel_divergente_negada", prov(NEW1, "'parceiro_b2b_financeiro'", "'tecnico'"), error="invalid_partner_link")
    check("provisao_tecnico_com_papel_financeiro_negada", prov(NEW1, "'parceiro_b2b_tecnico'", "'financeiro'"), error="invalid_partner_link")
    check("provisao_papel_nulo_negada", prov(NEW1, "'parceiro_b2b_financeiro'", "NULL"), error="invalid_partner_link")
    check("provisao_sem_service_role_negada", act(ADM, f"SELECT public.admin_provision_user_profile_v1('{NEW1}','n@x.io','N',ARRAY['parceiro_b2b_financeiro']::app_role[],ARRAY[]::uuid[],NULL,'{P1}','financeiro');"), error="platform_forbidden")
    run(prov(NEW1, "'parceiro_b2b_financeiro'", "'financeiro'"))
    check("provisao_financeiro_grava_vinculo", f"SELECT papel||':'||partner_id||':'||tenant_id FROM partner_users WHERE user_id='{NEW1}';", f"financeiro:{P1}:{ORG_A}")
    check("provisionado_le_proprio", own(NEW1, P1), "PED-P1")
    run(prov(NEW2, "'parceiro_b2b'", "'gestor'"))
    check("provisao_gestor_regressao", f"SELECT papel FROM partner_users WHERE user_id='{NEW2}';", "gestor")
    check("papel_vinculo_invalido_rejeitado", f"UPDATE partner_users SET papel='diretor' WHERE user_id='{NEW1}';", error="partner_users_papel_check")
    # Reversão
    rb = (HM / "04-rollback-hml.sql.review").read_text()
    check("rollback_recusa_papel_ativo", "SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + rb, error="B2B_FIN_ROLLBACK_ACTIVE_ROLE")
    run("DELETE FROM user_roles WHERE role='parceiro_b2b_financeiro'; DELETE FROM partner_users WHERE papel='financeiro';")
    run("SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + rb)
    pins = json.loads((H / "pins.json").read_text())
    for n in ["platform_private.b2b_own_obligations_owner", "platform_private.external_provisioning_scope", "admin_provision_user_profile_v1", "b2b_finish_provisioning", "rpc_partner_message_counters"]:
        sch, _, fn = n.rpartition(".")
        check(f"rollback_restaura_{fn}", f"SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='{sch or 'public'}' AND p.proname='{fn}';", pins[n][1])
    check("rollback_remove_capacidade", "SELECT to_regprocedure('public.b2b_finance_capability_v1()') IS NULL;", "t")
    check("rollback_exposicao_legada_intacta", "SELECT md5(pg_get_functiondef('public.fn_b2b_credit_exposure(uuid,numeric,uuid)'::regprocedure));", "213ac31f3a30816ead75365b0d1fed18")
    check("rollback_gestor_preservado", own(G1, P1), "PED-P1")
finally:
    subprocess.run(PRIV + ["pg_ctl", "-D", str(data), "stop", "-m", "fast"], capture_output=True)
    shutil.rmtree(TMP, ignore_errors=True)
    (HM / "evidence-hml-local.json").write_text(json.dumps({"total": len(results), "results": results, "note": "PostgreSQL descartável; auth sintética; não prova JWT/RLS hospedados"}, indent=1, ensure_ascii=False))
print(f"TOTAL {len(results)} PASS")
