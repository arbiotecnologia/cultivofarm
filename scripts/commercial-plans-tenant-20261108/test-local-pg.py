#!/usr/bin/env python3
"""PostgreSQL descartável; Auth e dependências externas ao recorte são sintéticas."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import os
import shutil
import subprocess
import tempfile

H = Path(__file__).resolve().parent
TMP = Path(tempfile.mkdtemp(prefix="commercial-plans-tenant-", dir="/tmp"))
TMP.chmod(0o777)
PRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
PSQL = ["psql", "-X", "-h", str(TMP), "-p", "55546", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"]
results = []


def run(sql, error=None):
    completed = subprocess.run(PSQL, input=sql, text=True, capture_output=True)
    if error is not None:
        assert completed.returncode != 0 and error in completed.stderr, (error, completed.stdout, completed.stderr)
        return completed.stderr
    if completed.returncode:
        raise AssertionError(completed.stderr)
    return completed.stdout.strip()


def check(name, sql, expected=None, error=None):
    output = run(sql, error)
    if expected is not None:
        assert output == str(expected), (name, output, expected)
    results.append({"name": name, "status": "PASS"})
    print("PASS", name)
    return output


def actor(uid, sql):
    return f"SET request.jwt.claim.sub='{uid}';SET ROLE authenticated;\n{sql}"


def extract(path, name):
    import re
    text = Path(path).read_text()
    match = re.search(r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public|platform_private)\." + re.escape(name) + r"\s*\(", text, re.I)
    assert match, name
    start = match.start()
    tail = text[match.end():]
    marker = re.search(r"\bAS\s*(\$function\$|\$\$)", tail, re.I)
    tag = marker.group(1)
    end = tail.find(tag + ";", marker.end())
    assert end >= 0, name
    return text[start:match.end()] + tail[:end + len(tag) + 1]


A = "aaaaaaaa-0000-0000-0000-000000000001"
B = "bbbbbbbb-0000-0000-0000-000000000001"
UA = "aaaaaaaa-0000-0000-0000-000000000002"
UB = "bbbbbbbb-0000-0000-0000-000000000002"
OA = "aaaaaaaa-1111-0000-0000-000000000001"
OB = "bbbbbbbb-1111-0000-0000-000000000001"
PA = "aaaaaaaa-2222-0000-0000-000000000001"
PB = "bbbbbbbb-2222-0000-0000-000000000001"
PLAN_A1 = "aaaaaaaa-4444-0000-0000-000000000001"
PLAN_A2 = "aaaaaaaa-4444-0000-0000-000000000002"
PLAN_B1 = "bbbbbbbb-4444-0000-0000-000000000001"
PLAN_AMBIG = "cccccccc-4444-0000-0000-000000000001"
ASN_A = "aaaaaaaa-5555-0000-0000-000000000001"
ASN_B = "bbbbbbbb-5555-0000-0000-000000000001"
ASN_AMBIG = "cccccccc-5555-0000-0000-000000000001"
METHOD = "dddddddd-6666-0000-0000-000000000001"
CATEGORY = "dddddddd-7777-0000-0000-000000000001"

try:
    subprocess.run(PRIV + ["initdb", "-D", str(TMP / "data"), "-A", "trust", "-U", "postgres"], check=True, capture_output=True)
    subprocess.run(PRIV + ["pg_ctl", "-D", str(TMP / "data"), "-l", str(TMP / "log"), "-o", f'-k {TMP} -h "" -p 55546', "start", "-w"], check=True, capture_output=True)
    run((H / "test-fixture.sql").read_text())

    migration = Path("supabase/migrations/20260730014752_0e6b78a5-0b6c-49ec-a2cf-74be2f62905e.sql")
    for name in ("fn_b2b_can_admin_plans", "fn_b2b_plan_selectable", "fn_b2b_plan_referenced", "tg_cpp_guard_financial_immutability", "_cpp_validate_payload", "_cpp_audit"):
        run("SET check_function_bodies=off;" + extract(migration, name))
    p1 = Path("scripts/owner-orders-20261023/p1-isolation")
    for name in ("c2p1_internal_actor", "c2p1_assignment_allowed"):
        run("SET check_function_bodies=off;" + extract(p1 / "core.sql.review", name))
    run("SET check_function_bodies=off;" + extract(p1 / "channels-core.sql.review", "c2p1_snapshot_allowed"))
    b3 = Path("scripts/b2b-payment-condition-v1-rebase-20261106/02-install.sql.review")
    for name in ("b2b_condition_cfg_actor", "b2b_condition_seller", "b2b_choice", "b2b_condition_mode", "b2b_list_payment_condition_options_secure"):
        run("SET check_function_bodies=off;" + extract(b3, name))
    for file in sorted((H / "capture" / "functions").glob("*.sql")):
        run("SET check_function_bodies=off;" + file.read_text() + ";")

    run("""
CREATE TRIGGER trg_cpp_guard_financial BEFORE UPDATE OR DELETE ON public.commercial_payment_plans FOR EACH ROW EXECUTE FUNCTION public.tg_cpp_guard_financial_immutability();
CREATE TRIGGER c2p1_assignment_fence BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_payment_plan_assignments FOR EACH ROW EXECUTE FUNCTION platform_private.c2p1_assignment_fence();
CREATE TRIGGER c2p1_item_fence BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_condition_item_prices FOR EACH ROW EXECUTE FUNCTION platform_private.c2p1_item_fence();
CREATE TRIGGER c2p1_rule_fence BEFORE INSERT OR UPDATE OR DELETE ON public.commercial_price_rules FOR EACH ROW EXECUTE FUNCTION platform_private.c2p1_rule_fence();
CREATE POLICY cppa_admin_read ON public.commercial_payment_plan_assignments FOR SELECT TO authenticated USING(platform_private.c2p1_assignment_allowed(buyer_scope,partner_id,customer_id));
CREATE POLICY ccip_admin_read ON public.commercial_condition_item_prices FOR SELECT TO authenticated USING(platform_private.c2p1_item_allowed(assignment_id,plan_id,buyer_scope,partner_id,customer_id));
CREATE POLICY cpr_internal_select ON public.commercial_price_rules FOR SELECT TO authenticated USING(platform_private.c2p1_assignment_allowed(buyer_scope,partner_id,customer_id));
REVOKE INSERT,UPDATE,DELETE ON public.commercial_payment_plans,public.commercial_payment_plan_assignments,public.commercial_condition_item_prices,public.commercial_price_rules FROM authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform_private TO authenticated;
""")

    run(f"""
INSERT INTO public.organizations(id,partner_account_id) VALUES('{OA}',NULL),('{OB}',NULL);
INSERT INTO public.profiles(user_id,organization_id) VALUES('{A}','{OA}'),('{B}','{OB}'),('{UA}','{OA}'),('{UB}','{OB}');
INSERT INTO public.user_roles(user_id,role) VALUES('{A}','administrador'),('{B}','administrador'),('{UA}','parceiro_b2b'),('{UB}','parceiro_b2b');
INSERT INTO public.partner_accounts(id,commercial_owner_organization_id) VALUES('{PA}','{OA}'),('{PB}','{OB}');
INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES('{PA}','{UA}','gestor','{OA}'),('{PB}','{UB}','gestor','{OB}');
INSERT INTO public.payment_methods(id,name) VALUES('{METHOD}','Boleto sintético');
INSERT INTO public.financial_categories(id,name,type) VALUES('{CATEGORY}','Receita sintética','RECEITA');
INSERT INTO public.commercial_payment_plans(id,name,code,plan_type,max_days,months_count,installment_count,discount_percent,monthly_interest_percent,interest_type,requires_credit_approval,requires_guarantee,requires_financial_approval,active,sort_order,created_by,pricing_mode,version,root_plan_id,valid_from,is_default) VALUES
('{PLAN_A1}','Plano A1','PLAN-A1','custom',30,1,1,10,0,'none',false,false,false,true,1,'{A}','discount_from_base',1,'{PLAN_A1}',now()-interval '1 day',false),
('{PLAN_A2}','Plano A2','PLAN-A2','custom',30,1,1,0,0,'none',false,false,false,true,2,'{A}','discount_from_base',1,'{PLAN_A2}',now()-interval '1 day',false),
('{PLAN_B1}','Plano B1','PLAN-B1','custom',30,1,1,0,0,'none',false,false,false,true,1,'{B}','discount_from_base',1,'{PLAN_B1}',now()-interval '1 day',false),
('{PLAN_AMBIG}','Plano ambíguo','PLAN-AMBIG','custom',30,1,1,0,0,'none',false,false,false,true,3,'{A}','discount_from_base',1,'{PLAN_AMBIG}',now()-interval '1 day',false);
""")
    run(f"SET request.jwt.claim.sub='{A}';INSERT INTO public.commercial_payment_plan_assignments(id,plan_id,buyer_scope,partner_id,status,created_by) VALUES('{ASN_A}','{PLAN_A1}','partner','{PA}','published','{A}');")
    run(f"SET request.jwt.claim.sub='{B}';INSERT INTO public.commercial_payment_plan_assignments(id,plan_id,buyer_scope,partner_id,status,created_by) VALUES('{ASN_B}','{PLAN_B1}','partner','{PB}','published','{B}'),('{ASN_AMBIG}','{PLAN_AMBIG}','partner','{PB}','published','{B}');")

    check("ANTES: FSF lê planos ARBio pela RPC admin", actor(B, "SELECT count(*) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0);"), 4)
    check("ANTES: FSF lê ARBio pela listagem operacional admin", actor(B, f"SELECT count(*) FROM public.rpc_b2b_list_selectable_payment_plans() WHERE id='{PLAN_A1}';"), 1)
    check("ANTES: configuração B3 FSF expõe plano ARBio", actor(B, f"SELECT jsonb_array_length(b2b_payment_condition_config_list()->'plans')>=1 AND EXISTS(SELECT 1 FROM jsonb_array_elements(b2b_payment_condition_config_list()->'plans') x WHERE x->>'id'='{PLAN_A1}');"), "t")
    check("ANTES: FSF altera metadados ARBio", actor(B, f"SELECT public.rpc_admin_update_commercial_plan_metadata('{PLAN_A1}','ALTERADO POR B',NULL,NULL);"))
    check("ANTES: escrita indevida confirmada", f"SELECT name FROM public.commercial_payment_plans WHERE id='{PLAN_A1}';", "ALTERADO POR B")
    run(f"UPDATE public.commercial_payment_plans SET name='Plano A1' WHERE id='{PLAN_A1}';")

    check("PRE íntegro", "SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';" + (H / "01-pre.sql.readonly").read_text(), "4|3|1|0")
    run("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';" + (H / "02-install.sql.review").read_text())
    results.append({"name": "Instalação candidata transacional", "status": "PASS"})
    print("PASS instalação candidata transacional")
    check("proveniência A resolvida", f"SELECT organization_id FROM public.commercial_payment_plans WHERE id='{PLAN_A1}';", OA)
    check("proveniência B resolvida", f"SELECT organization_id FROM public.commercial_payment_plans WHERE id='{PLAN_B1}';", OB)
    check("família ambígua permanece NULL", f"SELECT organization_id IS NULL FROM public.commercial_payment_plans WHERE id='{PLAN_AMBIG}';", "t")
    check("POST íntegro", "SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';" + (H / "03-post.sql.readonly").read_text(), "4|3|1")

    check("DEPOIS: ARBio lista somente seus dois planos", actor(A, "SELECT count(*) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0);"), 2)
    check("DEPOIS: FSF lista somente seu plano", actor(B, "SELECT count(*) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0);"), 1)
    check("DEPOIS: FSF não lê ARBio operacionalmente", actor(B, f"SELECT count(*) FROM public.rpc_b2b_list_selectable_payment_plans() WHERE id='{PLAN_A1}';"), 0)
    check("DEPOIS: configuração B3 FSF não expõe ARBio", actor(B, f"SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(b2b_payment_condition_config_list()->'plans') x WHERE x->>'id'='{PLAN_A1}');"), "f")
    check("DEPOIS: leitura direta FSF isolada por RLS", actor(B, f"SELECT count(*) FROM public.commercial_payment_plans WHERE id IN('{PLAN_A1}','{PLAN_B1}','{PLAN_AMBIG}');"), 1)
    check("DEPOIS: comprador ARBio só lê plano publicado vinculado", actor(UA, f"SELECT id FROM public.rpc_b2b_list_selectable_payment_plans();"), PLAN_A1)
    check("DEPOIS: comprador FSF só lê seu plano", actor(UB, f"SELECT id FROM public.rpc_b2b_list_selectable_payment_plans();"), PLAN_B1)

    payload = json.dumps({"name":"Nova versão","code":"PLAN-A1","plan_type":"custom","max_days":30,"months_count":1,"installment_count":1,"discount_percent":10,"monthly_interest_percent":0,"interest_type":"none","pricing_mode":"discount_from_base","requires_credit_approval":False,"requires_guarantee":False,"requires_financial_approval":False}, separators=(",", ":"))
    check("FSF nega versão ARBio", actor(B, f"SELECT public.rpc_admin_version_commercial_plan('{PLAN_A1}','{payload}'::jsonb,'x');"), error="plan_not_found")
    check("FSF nega metadados ARBio", actor(B, f"SELECT public.rpc_admin_update_commercial_plan_metadata('{PLAN_A1}','B',NULL,NULL);"), error="plan_not_found")
    check("FSF nega ativação ARBio", actor(B, f"SELECT public.rpc_admin_set_commercial_plan_active('{PLAN_A1}',false,'x');"), error="plan_not_found")
    check("FSF nega padrão ARBio", actor(B, f"SELECT public.rpc_admin_set_default_commercial_plan('{PLAN_A1}');"), error="plan_not_found")
    check("FSF nega reordenação mista", actor(B, f"SELECT public.rpc_admin_reorder_commercial_plans('[{{\"id\":\"{PLAN_A1}\",\"sort_order\":9}},{{\"id\":\"{PLAN_B1}\",\"sort_order\":9}}]'::jsonb);"), error="not_authorized")
    check("reordenação negada não altera A", f"SELECT sort_order FROM public.commercial_payment_plans WHERE id='{PLAN_A1}';", 1)
    check("metadados negados não alteram A", f"SELECT name FROM public.commercial_payment_plans WHERE id='{PLAN_A1}';", "Plano A1")

    new_version = check("ARBio cria versão própria", actor(A, f"SELECT public.rpc_admin_version_commercial_plan('{PLAN_A1}','{payload}'::jsonb,'nova');"))
    check("versão herda tenant ARBio", f"SELECT organization_id FROM public.commercial_payment_plans WHERE id='{new_version}';", OA)
    check("versão ARBio invisível para FSF", actor(B, f"SELECT count(*) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0) WHERE id='{new_version}';"), 0)
    check("ARBio define padrão próprio", actor(A, f"SELECT public.rpc_admin_set_default_commercial_plan('{new_version}');"))
    check("FSF define e lê somente seu padrão", actor(B, f"SELECT public.rpc_admin_set_default_commercial_plan('{PLAN_B1}');SELECT count(*) FROM public.commercial_payment_plans WHERE is_default;"), 1)
    check("padrões pertencem a tenants distintos", f"SELECT string_agg(organization_id::text,',' ORDER BY organization_id::text) FROM public.commercial_payment_plans WHERE is_default;", f"{OA},{OB}")

    created_b = check("FSF cria plano com tenant próprio", actor(B, "SELECT public.rpc_admin_create_commercial_plan('{\"name\":\"Plano B2\",\"code\":\"PLAN-B2\",\"plan_type\":\"custom\",\"max_days\":30,\"months_count\":1,\"installment_count\":1,\"discount_percent\":0,\"monthly_interest_percent\":0,\"interest_type\":\"none\",\"pricing_mode\":\"discount_from_base\",\"requires_credit_approval\":false,\"requires_guarantee\":false,\"requires_financial_approval\":false}'::jsonb);"))
    check("plano criado por FSF não aparece para ARBio", actor(A, f"SELECT count(*) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0) WHERE id='{created_b}';"), 0)
    check("tenant do plano é imutável", f"UPDATE public.commercial_payment_plans SET organization_id='{OB}' WHERE id='{PLAN_A1}';", error="COMMERCIAL_PLAN_TENANT_IMMUTABLE")

    check("atribuição cruzada B para plano A negada", actor(B, f"SELECT public.rpc_cc_upsert_assignment(NULL,'{PLAN_A1}','partner','{PB}',NULL,CURRENT_DATE,NULL,'x');"), error="C2P1_FORBIDDEN")
    check("atribuição A para plano B negada", actor(A, f"SELECT public.rpc_cc_upsert_assignment(NULL,'{PLAN_B1}','partner','{PA}',NULL,CURRENT_DATE,NULL,'x');"), error="C2P1_FORBIDDEN")
    check("matriz cruzada negada", actor(A, f"SELECT public.rpc_cc_validate_matrix('{PLAN_B1}','partner','{PA}',NULL);"), error="C2P1_FORBIDDEN")
    check("simulação de matriz cruzada negada", actor(A, f"SELECT public.rpc_cc_simulate_price('partner','{PA}',NULL,'{PLAN_B1}',NULL,NULL,'litro',NULL,CURRENT_DATE,1);"), error="C2P1_FORBIDDEN")
    check("simulação legada comprador A com plano B negada", actor(UA, f"SELECT public.simulate_b2b_payment_plan_secure('{PA}','{PLAN_B1}','[]'::jsonb,NULL);"), error="plan_not_found")
    check("leitura direta de atribuição ambígua fechada", actor(B, f"SELECT count(*) FROM public.commercial_payment_plan_assignments WHERE id='{ASN_AMBIG}';"), 0)
    check("histórico de atribuição ambígua fechado", actor(B, f"SELECT count(*) FROM public.rpc_cc_list_assignments(NULL) WHERE id='{ASN_AMBIG}';"), 0)

    check("FSF não publica condição para plano ARBio", actor(B, f"SELECT public.b2b_payment_condition_publish('{PLAN_A1}','boleto','{METHOD}','{CATEGORY}',30,1,0,0);"), error="forbidden")
    published = check("ARBio publica condição própria", actor(A, f"SELECT public.b2b_payment_condition_publish('{PLAN_A2}','boleto','{METHOD}','{CATEGORY}',30,1,0,0)->>'contract';"), "B2B_PAYMENT_CONDITION_V1")
    check("ARBio atribui condição ao próprio parceiro", actor(A, f"SELECT public.b2b_payment_condition_assign('{PA}','{PLAN_A2}','boleto',1,true)->>'enabled';"), "true")
    assignment_a2 = check("ARBio cria atribuição comercial própria", actor(A, f"SELECT public.rpc_cc_upsert_assignment(NULL,'{PLAN_A2}','partner','{PA}',NULL,CURRENT_DATE,NULL,'x');"))
    check("ARBio publica atribuição comercial própria", actor(A, f"SELECT public.rpc_cc_publish_assignment('{assignment_a2}','x');"))
    check("comprador ARBio resolve meio publicado", actor(UA, f"SELECT platform_private.b2b_resolve_condition('{PA}','{PLAN_A2}',jsonb_build_object('payment_method','boleto','payment_condition_version',1,'payment_deadline_days',30),false)->>'payment_method_name';"), "Boleto sintético")
    check("comprador FSF não resolve condição ARBio", actor(UB, f"SELECT platform_private.b2b_resolve_condition('{PA}','{PLAN_A2}',jsonb_build_object('payment_method','boleto','payment_condition_version',1,'payment_deadline_days',30),false);"), error="forbidden_partner")
    check("revogação B3 fecha meio", actor(A, f"SELECT public.b2b_payment_condition_assign('{PA}','{PLAN_A2}','boleto',1,false);"))
    check("comprador perde condição após revogação", actor(UA, f"SELECT platform_private.b2b_resolve_condition('{PA}','{PLAN_A2}',jsonb_build_object('payment_method','boleto','payment_condition_version',1,'payment_deadline_days',30),false);"), error="payment_condition_unavailable")

    run(f"UPDATE public.partner_users SET revoked_at=now() WHERE user_id='{UA}';")
    check("revogação do vínculo comprador fecha leitura", actor(UA, "SELECT count(*) FROM public.rpc_b2b_list_selectable_payment_plans();"), 0)
    run(f"UPDATE public.partner_users SET revoked_at=NULL WHERE user_id='{UA}';UPDATE public.profiles SET ativo=false WHERE user_id='{B}';")
    check("perfil admin revogado fecha leitura", actor(B, "SELECT count(*) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0);"), error="not_authorized")
    check("perfil admin revogado fecha escrita", actor(B, f"SELECT public.rpc_admin_set_commercial_plan_active('{PLAN_B1}',false,'x');"), error="not_authorized")
    run(f"UPDATE public.profiles SET ativo=true WHERE user_id='{B}';")

    before = run("SELECT (SELECT count(*) FROM public.commercial_payment_plans)||'|'||(SELECT count(*) FROM public.commercial_payment_plan_assignments)||'|'||(SELECT count(*) FROM platform_private.b2b_condition_versions);")
    run("SET commercial_plans.review_project_ref='swzpzcwiasxmjutrmvkm';" + (H / "04-rollback-deny.sql.review").read_text())
    check("rollback fecha RPC admin", actor(A, "SELECT count(*) FROM public.rpc_admin_list_commercial_plans(NULL,'all',100,0);"), error="permission denied")
    check("rollback fecha leitura comprador", actor(UA, "SELECT count(*) FROM public.rpc_b2b_list_selectable_payment_plans();"), error="permission denied")
    check("rollback fecha configuração B3", actor(A, "SELECT public.b2b_payment_condition_config_list();"), error="permission denied")
    check("rollback fecha leitura direta", actor(A, "SELECT count(*) FROM public.commercial_payment_plans;"), 0)
    check("rollback preserva planos/atribuições/versões", "SELECT (SELECT count(*) FROM public.commercial_payment_plans)||'|'||(SELECT count(*) FROM public.commercial_payment_plan_assignments)||'|'||(SELECT count(*) FROM platform_private.b2b_condition_versions);", before)

    evidence = {
        "project_ref": "swzpzcwiasxmjutrmvkm",
        "status": "PASS",
        "checks": len(results),
        "results": results,
        "synthetic_seams": ["Auth por request.jwt.claim.sub", "h15/platform_actor_access_ready reduzidos", "C2 order guards e feature flag mínimos", "resolver de preço e tabelas fora do recorte reduzidos", "GRANT SELECT em fixture para exercitar RLS; produção não recebe GRANT"],
        "not_proven": ["JWT/PostgREST/RLS/Storage hospedados", "concorrência real de três sessões", "E2E de pedido", "instalação em produção"],
        "candidate_sha256": hashlib.sha256((H / "02-install.sql.review").read_bytes()).hexdigest(),
    }
    (H / "evidence").mkdir(exist_ok=True)
    (H / "evidence" / "local-pg.json").write_text(json.dumps(evidence, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(results)}/{len(results)} PASS; Auth sintética, sem prova hosted")
finally:
    subprocess.run(PRIV + ["pg_ctl", "-D", str(TMP / "data"), "stop", "-m", "immediate"], capture_output=True)
    shutil.rmtree(TMP, ignore_errors=True)
