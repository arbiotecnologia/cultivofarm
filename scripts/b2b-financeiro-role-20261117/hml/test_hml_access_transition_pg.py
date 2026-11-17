# Derivado de ../test_access_transition_pg.py: só ref/artefatos HML (núcleo e executor HML = md5 de produção).
#!/usr/bin/env python3
"""Transição canônica para/de Financeiro B2B (02c) em PostgreSQL descartável, sobre o ambiente da bateria
user-edit-access-email-links-20261117 (28 gatilhos de produção verbatim + candidato de produção) com os corpos
LIVE capturados do núcleo/exec pinados. Auth sintética: NÃO prova JWT/RLS hospedados."""
import json, os, shutil, subprocess, sys, tempfile, time, uuid, hashlib
from pathlib import Path
HM = Path(__file__).resolve().parent; H = HM.parent; UE = H.parent / "user-edit-access-email-links-20261117"
os.environ["PATH"] = str(Path(shutil.which("initdb")).resolve().parent) + os.pathsep + os.environ["PATH"]
tmp = tempfile.mkdtemp(prefix="b2bfin-at-", dir="/tmp"); os.chmod(tmp, 0o777); data = os.path.join(tmp, "d")
port = os.environ.get("B2BFIN_AT_PORT", "55642")
AS = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.geteuid() == 0 else []
subprocess.run(AS + ["initdb", "-D", data, "-U", "postgres", "--auth=trust"], check=True, capture_output=True)
subprocess.run(AS + ["pg_ctl", "-D", data, "-o", f"-p {port} -k {tmp} -c listen_addresses=''", "-l", os.path.join(tmp, "log"), "-w", "start"], check=True, capture_output=True)
PINS = json.loads((H / "pins.json").read_text())
results = []
def psql(sql, actor=None, ok=True):
    pre = ""
    if actor: sql = sql.replace("{ACTOR}", actor).replace("{IAT}", str(int(time.time()) + 3600)); pre = "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); SET ROLE service_role; "
    p = subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", pre + sql], capture_output=True, text=True)
    if ok and p.returncode: raise RuntimeError(p.stderr)
    return p
def load(path):
    p = subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qX", "-f", str(path)], capture_output=True, text=True)
    if p.returncode: raise RuntimeError(f"{path}: {p.stderr[-800:]}")
def check(name, cond, detail=""):
    results.append({"name": name, "status": "PASS" if cond else "FAIL"}); print(("PASS " + name) if cond else ("FAIL " + name + " " + detail))
def denied(name, sql, actor, code):
    p = psql(sql, actor, ok=False); check(name, p.returncode != 0 and code in p.stderr, p.stderr.strip()[-200:])
q = lambda s: psql(s).stdout.strip()
try:
    for f in ("harness-stubs.sql", "captured-prod-user-triggers-20261117.sql", "captured-prod-consumers-20261117.sql"): load(UE / f)
    PROD_ORGS = ("8eae2bc1-ad00-4402-9f57-564258e493ca","442444d9-263f-45d9-a991-a679498d06c3","4e537fd6-4632-4c70-a782-386dba3e8f9f","8f57c7dd-0557-4041-b401-7a00f7244626","007bb519-cba0-4704-be2c-cb93ad010048")
    psql("INSERT INTO public.organizations(id) VALUES " + ",".join(f"('{o}')" for o in PROD_ORGS))
    load(UE / "candidate.sql.review")
    # Corpos LIVE capturados substituem os do candidato (instalado em produção); md5 conferido após carga.
    for n in ("platform_private.user_admin_change_access_type_core", "tenant_admin_user_access_exec_v1"):
        load(H / "captured" / f"{n}.sql")
        sch, _, fn = n.rpartition(".")
        check(f"live_pin_{fn}", q(f"SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='{sch or 'public'}' AND p.proname='{fn}'") == PINS[n][1])
    psql("REVOKE ALL ON FUNCTION platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text) FROM PUBLIC")
    psql("ALTER TYPE public.app_role ADD VALUE 'parceiro_b2b_financeiro'")
    psql("ALTER TABLE public.partner_users ADD CONSTRAINT partner_users_papel_check CHECK (papel = ANY (ARRAY['gestor','tecnico','financeiro']))")
    c02 = (HM / "02c-install-access-transition-hml.sql.review").read_text()
    p = psql("SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + c02, ok=False)
    check("02c_exige_02b", p.returncode != 0 and "B2B_FIN_02C_REQUIRES_02B" in p.stderr, p.stderr[-200:])
    psql("CREATE FUNCTION public.b2b_finance_capability_v1() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$")  # marcador declarado do 02b
    p = psql("SET app.expected_ref='errado';\n" + c02, ok=False); check("02c_ref_divergente", p.returncode != 0 and "REF_UNPROVEN" in p.stderr)
    HP = json.loads((HM / "hml-pins.json").read_text())
    p = psql("SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + c02, ok=False)
    check("02c_drift_com_gatilhos_de_producao", p.returncode != 0 and "B2B_FIN_02C_DRIFT" in p.stderr, p.stderr[-200:])
    for n in ("cf_user_guards_v1.touch_related_profiles", "partner_users_derive_tenant"):  # corpos HML reais (C9)
        load(HM / "captured" / "c9" / f"{n}.sql"); sch, _, fn = n.rpartition(".")
        check(f"c9_pin_{fn}", q(f"SELECT md5(pg_get_functiondef(p.oid)) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='{sch or 'public'}' AND p.proname='{fn}'") == HP[n][1])
    psql("SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + c02)
    check("02c_sem_execute_cliente", q("SELECT has_function_privilege('authenticated','platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text,uuid,integer)','EXECUTE')::text || has_function_privilege('service_role','platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text,uuid,integer)','EXECUTE')::text") == "falsefalse")
    check("02c_exec_acl_preservada", q("SELECT has_function_privilege('authenticated','public.tenant_admin_user_access_exec_v1(uuid,bigint,text,jsonb)','EXECUTE')") == "f")
    # Dados sintéticos
    U = {k: str(uuid.uuid4()) for k in ["adminA", "adminB", "gest", "tec", "intA", "prodA", "finX", "outro"]}
    OA, OB = str(uuid.uuid4()), str(uuid.uuid4()); PA, PA2, PB = (str(uuid.uuid4()) for _ in range(3)); C1 = str(uuid.uuid4())
    org = {k: (OB if k == "adminB" else OA) for k in U}
    psql(f"INSERT INTO public.organizations(id) VALUES ('{OA}'),('{OB}')")
    psql("SET session_replication_role = replica; " + "; ".join(f"INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{U[n]}','{n}','{n}@ex.test','{org[n]}')" for n in ("adminA", "adminB")) +
         f"; INSERT INTO public.user_roles(user_id,role) VALUES ('{U['adminA']}','administrador'),('{U['adminB']}','administrador'); SET session_replication_role = origin")
    rest = [n for n in U if n not in ("adminA", "adminB")]
    psql("; ".join([f"INSERT INTO auth.users VALUES ('{U[n]}','{n}@ex.test')" for n in U] +
        [f"INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{U[n]}','{n}','{n}@ex.test','{org[n]}')" for n in rest] +
        [f"INSERT INTO public.clientes VALUES ('{C1}','Fazenda',null,'{OA}')",
         f"INSERT INTO public.partner_accounts VALUES ('{PA}',true,null,'{OA}'),('{PA2}',true,null,'{OA}'),('{PB}',true,null,'{OB}')",
         f"INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES ('{U['prodA']}','{C1}',true)",
         f"INSERT INTO public.user_roles(user_id,role) VALUES ('{U['gest']}','parceiro_b2b'),('{U['tec']}','parceiro_b2b_tecnico'),('{U['intA']}','financeiro'),('{U['prodA']}','cliente_produtor'),('{U['outro']}','parceiro_b2b')",
         f"INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES ('{PA}','{U['gest']}','gestor','{OA}'),('{PA}','{U['tec']}','tecnico','{OA}'),('{PA}','{U['outro']}','gestor','{OA}')"]))
    A, B = U["adminA"], U["adminB"]
    def AT(u, t, add=(), rm=(), partner=None, ver="omit", cli=None, key=None):
        a = {"user_id": u, "target": t, "roles": list(add), "remove_roles": list(rm), "idempotency_key": key or str(uuid.uuid4()), "reason": "transição de teste"}
        if partner: a["partner_id"] = partner
        if ver != "omit": a["expected_link_version"] = ver
        if cli: a["cliente_id"] = cli
        return "SELECT public.tenant_admin_user_access_exec_v1('{ACTOR}'::uuid,{IAT},'change_access_type','" + json.dumps(a) + "'::jsonb)"
    roles = lambda u: q(f"SELECT string_agg(role::text,',' ORDER BY role::text) FROM public.user_roles WHERE user_id='{u}'")
    link = lambda u: q(f"SELECT coalesce(string_agg(partner_id::text||':'||papel,',' ),'') FROM public.partner_users WHERE user_id='{u}' AND revoked_at IS NULL")
    ver = lambda u: int(q(f"SELECT version FROM public.partner_users WHERE user_id='{u}' AND revoked_at IS NULL"))
    F = "parceiro_b2b_financeiro"
    # Gestor → Financeiro
    denied("gestor_para_fin_sem_remover_incompat", AT(U["gest"], "b2b_finance", [F], ver=ver(U["gest"])), A, "incompatible_roles")
    denied("gestor_para_fin_cas_obsoleto", AT(U["gest"], "b2b_finance", [F], ["parceiro_b2b"], ver=ver(U["gest"]) + 7), A, "partner_link_conflict")
    denied("gestor_para_fin_sem_versao", AT(U["gest"], "b2b_finance", [F], ["parceiro_b2b"]), A, "partner_link_conflict")
    denied("gestor_para_fin_troca_parceiro_negada", AT(U["gest"], "b2b_finance", [F], ["parceiro_b2b"], partner=PA2, ver=ver(U["gest"])), A, "partner_link_change_unsupported")
    denied("fin_combinado_com_tecnico_negado", AT(U["gest"], "b2b_finance", [F, "parceiro_b2b_tecnico"], ["parceiro_b2b"], ver=ver(U["gest"])), A, "b2b_finance_roles_required")
    denied("admin_outro_tenant_negado", AT(U["gest"], "b2b_finance", [F], ["parceiro_b2b"], ver=ver(U["gest"])), B, "forbidden")
    v0 = ver(U["gest"]); r = json.loads(psql(AT(U["gest"], "b2b_finance", [F], ["parceiro_b2b"], ver=v0), A).stdout.strip().splitlines()[-1])
    check("gestor_para_fin_atomico", roles(U["gest"]) == F and link(U["gest"]) == f"{PA}:financeiro" and r["sessions_invalidated"] is True, f"{roles(U['gest'])} {link(U['gest'])}")
    check("gestor_para_fin_bump_versao", ver(U["gest"]) > v0)
    check("gestor_para_fin_auditado", q(f"SELECT count(*) FROM platform_private.user_admin_change_audit WHERE target_id='{U['gest']}' AND kind='access_type'") == "1")
    check("sessao_antiga_invalidada", q(f"SELECT count(*) FROM platform_private.user_authz_epoch WHERE user_id='{U['gest']}'") == "1")
    # Replay idempotente e chave reutilizada com payload diferente
    key = str(uuid.uuid4())
    # Financeiro → Técnico (papel do vínculo sincronizado)
    denied("fin_para_tec_cas_obsoleto", AT(U["gest"], "b2b", ["parceiro_b2b_tecnico"], [F], ver=v0), A, "partner_link_conflict")
    v1 = ver(U["gest"]); psql(AT(U["gest"], "b2b", ["parceiro_b2b_tecnico"], [F], ver=v1, key=key), A)
    denied("replay_chave_com_payload_diferente", AT(U["gest"], "b2b", ["parceiro_b2b"], [F], ver=v1, key=key), A, "idempotency_conflict")
    check("fin_para_tec_atomico", roles(U["gest"]) == "parceiro_b2b_tecnico" and link(U["gest"]) == f"{PA}:tecnico", f"{roles(U['gest'])} {link(U['gest'])}")
    p = psql(AT(U["gest"], "b2b", ["parceiro_b2b_tecnico"], [F], ver=v1, key=key), A); check("replay_idempotente_sem_nova_mutacao", roles(U["gest"]) == "parceiro_b2b_tecnico" and p.returncode == 0)
    # Técnico → Financeiro → Gestor
    psql(AT(U["tec"], "b2b_finance", [F], ["parceiro_b2b_tecnico"], ver=ver(U["tec"])), A)
    check("tec_para_fin", roles(U["tec"]) == F and link(U["tec"]) == f"{PA}:financeiro")
    psql(AT(U["tec"], "b2b", ["parceiro_b2b"], [F], ver=ver(U["tec"])), A)
    check("fin_para_gestor", roles(U["tec"]) == "parceiro_b2b" and link(U["tec"]) == f"{PA}:gestor")
    # Interno → Financeiro (novo vínculo exige parceiro do tenant)
    denied("interno_para_fin_sem_parceiro", AT(U["intA"], "b2b_finance", [F], ["financeiro"], ver=None), A, "partner_required")
    denied("interno_para_fin_parceiro_outro_tenant", AT(U["intA"], "b2b_finance", [F], ["financeiro"], partner=PB, ver=None), A, "partner_link_required")
    psql(AT(U["intA"], "b2b_finance", [F], ["financeiro"], partner=PA2, ver=None), A)
    check("interno_para_fin_cria_vinculo", roles(U["intA"]) == F and link(U["intA"]) == f"{PA2}:financeiro")
    # Financeiro → Interno (vínculo revogado, histórico preservado)
    psql(AT(U["intA"], "internal", ["administrativo"], [F], ver=ver(U["intA"])), A)
    check("fin_para_interno_revoga_vinculo", roles(U["intA"]) == "administrativo" and link(U["intA"]) == "" and q(f"SELECT count(*) FROM public.partner_users WHERE user_id='{U['intA']}'") == "1")
    # Produtor → Financeiro e volta
    psql(AT(U["prodA"], "b2b_finance", [F], ["cliente_produtor"], partner=PA, ver=None), A)
    check("produtor_para_fin_encerra_clientes", roles(U["prodA"]) == F and q(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U['prodA']}' AND is_active AND revoked_at IS NULL") == "0")
    psql(AT(U["prodA"], "producer", [], [F], ver=ver(U["prodA"]), cli=C1), A)
    check("fin_para_produtor", roles(U["prodA"]) == "cliente_produtor" and link(U["prodA"]) == "")
    def jwt(u, sql):
        c = json.dumps({"sub": u, "iat": int(time.time()) + 3600, "role": "authenticated"})
        return psql(f"SELECT set_config('request.jwt.claims','{c}',false); SET ROLE authenticated; " + sql, ok=False)
    r = jwt(A, f"SELECT public.tenant_admin_partner_link_v1('{U['outro']}')->'link'->>'version'")
    check("leitor_vinculo_admin_mesmo_tenant", r.returncode == 0 and r.stdout.strip().splitlines()[-1] == str(ver(U["outro"])), r.stdout + r.stderr[-200:])
    r = jwt(B, f"SELECT public.tenant_admin_partner_link_v1('{U['outro']}')"); check("leitor_vinculo_admin_outro_tenant_negado", r.returncode != 0 and "forbidden" in r.stderr, r.stderr[-200:])
    r = jwt(U["outro"], f"SELECT public.tenant_admin_partner_link_v1('{U['outro']}')"); check("leitor_vinculo_nao_admin_negado", r.returncode != 0 and "forbidden" in r.stderr, r.stderr[-200:])
    check("leitor_vinculo_anon_sem_execute", q("SELECT has_function_privilege('anon','public.tenant_admin_partner_link_v1(uuid)','EXECUTE')") == "f")
    # C9: derive_tenant HML não rejeita parceiro sem dono → vínculo nasce com tenant NULL; 02c deve negar.
    PN = str(uuid.uuid4()); UN = str(uuid.uuid4())
    psql(f"INSERT INTO public.partner_accounts VALUES ('{PN}',true,null,null)")
    denied("fin_parceiro_sem_dono_negado", AT(U["prodA"], "b2b_finance", [F], ["cliente_produtor"], partner=PN, ver=None), A, "partner_link_required")
    psql(f"INSERT INTO auth.users VALUES ('{UN}','un@ex.test'); INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{UN}','un','un@ex.test','{OA}'); "
         f"INSERT INTO public.user_roles(user_id,role) VALUES ('{UN}','parceiro_b2b'); INSERT INTO public.partner_users(partner_id,user_id,papel) VALUES ('{PN}','{UN}','gestor')")
    check("c9_vinculo_tenant_nulo_hml", q(f"SELECT tenant_id IS NULL FROM public.partner_users WHERE user_id='{UN}'") == "t")
    p = psql(AT(UN, "b2b_finance", [F], ["parceiro_b2b"], ver=ver(UN)), A, ok=False)  # scope_proof (anterior) ou partner_link_foreign
    check("fin_vinculo_tenant_nulo_negado", p.returncode != 0 and ("scope_unprovable" in p.stderr or "partner_link_foreign" in p.stderr), p.stderr[:300])
    check("fin_vinculo_tenant_nulo_sem_efeito", roles(UN) == "parceiro_b2b" and link(UN) == f"{PN}:gestor")
    # Negativos gerais
    denied("partner_id_fora_do_alvo_fin_negado", AT(U["outro"], "b2b", ["parceiro_b2b_tecnico"], partner=PA), A, "partner_not_allowed")
    denied("versao_fora_de_fin_negada", AT(U["outro"], "b2b", ["parceiro_b2b_tecnico"], ver=1), A, "link_version_not_allowed")
    denied("admin_para_fin_negado", AT(U["outro"], "b2b_finance", ["administrador"], ["parceiro_b2b"], ver=ver(U["outro"])), A, "b2b_finance_roles_required")
    denied("chamada_autenticada_direta_negada", "SET ROLE authenticated; SELECT public.tenant_admin_user_access_exec_v1(gen_random_uuid(),0,'change_access_type','{}'::jsonb)", None, "permission denied")
    # Regressão: gestor/técnico sem financeiro mantém contrato antigo
    psql(AT(U["outro"], "b2b", ["parceiro_b2b_tecnico"]), A)
    check("regressao_gestor_mais_tecnico", roles(U["outro"]) == "parceiro_b2b,parceiro_b2b_tecnico" and link(U["outro"]) == f"{PA}:gestor")
    # Reversão
    psql("SET app.expected_ref='vrlcdwmlytukrjezrrnf';\n" + (HM / "04c-rollback-access-transition-hml.sql.review").read_text())
    check("rollback_restaura_nucleo", q("SELECT md5(pg_get_functiondef('platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text)'::regprocedure))") == PINS["platform_private.user_admin_change_access_type_core"][1])
    check("rollback_restaura_exec", q("SELECT md5(pg_get_functiondef('public.tenant_admin_user_access_exec_v1(uuid,bigint,text,jsonb)'::regprocedure))") == PINS["tenant_admin_user_access_exec_v1"][1])
    check("rollback_remove_assinatura_nova", q("SELECT to_regprocedure('platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text,uuid,integer)') IS NULL") == "t")
    check("rollback_remove_leitor_vinculo", q("SELECT to_regprocedure('public.tenant_admin_partner_link_v1(uuid)') IS NULL") == "t")
    check("rollback_nucleo_sem_execute_publico", q("SELECT has_function_privilege('service_role','platform_private.user_admin_change_access_type_core(uuid,bigint,uuid,text,public.app_role[],public.app_role[],uuid,uuid,text)','EXECUTE')") == "f")
finally:
    subprocess.run(AS + ["pg_ctl", "-D", data, "stop", "-m", "fast"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
    (HM / "evidence-hml-access-transition.json").write_text(json.dumps({"total": len(results), "results": results, "note": "PostgreSQL descartável; auth sintética"}, indent=1, ensure_ascii=False))
fails = [r for r in results if r["status"] != "PASS"]
print(f"TOTAL {len(results)} {'PASS' if not fails else 'FAIL'}"); sys.exit(1 if fails else 0)
