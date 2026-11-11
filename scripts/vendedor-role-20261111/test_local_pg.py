#!/usr/bin/env python3
"""Espelho PostgreSQL descartável do pacote vendedor. Auth sintética: não prova JWT/RLS/Storage real."""
import hashlib, json, os, shutil, subprocess, tempfile
from pathlib import Path
H = Path(__file__).resolve().parent
TMP = Path(tempfile.mkdtemp(prefix="vendedor-pg-", dir="/tmp")); TMP.chmod(0o777)
PRIV = ["setpriv","--reuid=1000","--regid=1000","--clear-groups"] if os.getuid()==0 else []
PORT = "55611"
PSQL = ["psql","-X","-h",str(TMP),"-p",PORT,"-U","postgres","-qAt","-v","ON_ERROR_STOP=1","-d","postgres"]
results = []
ORG_A="00000000-0000-0000-0000-0000000000a1"; ORG_B="00000000-0000-0000-0000-0000000000b1"
ADMIN="10000000-0000-0000-0000-000000000001"; V1="10000000-0000-0000-0000-000000000002"; V2="10000000-0000-0000-0000-000000000003"
GC="10000000-0000-0000-0000-000000000004"; ADMIN_B="10000000-0000-0000-0000-000000000005"; VB="10000000-0000-0000-0000-000000000006"
P1="20000000-0000-0000-0000-000000000001"; P2="20000000-0000-0000-0000-000000000002"; PB="20000000-0000-0000-0000-000000000003"

def run(sql, error=None):
    c = subprocess.run(PSQL, input=sql, text=True, capture_output=True)
    if error is not None:
        assert c.returncode!=0 and error in c.stderr, (error, c.stdout, c.stderr); return c.stderr
    if c.returncode: raise AssertionError(c.stderr)
    return c.stdout.strip()
def check(name, sql, expected=None, error=None):
    out = run(sql, error)
    if expected is not None: assert out==str(expected), (name, out, expected)
    results.append({"name":name,"status":"PASS"}); print("PASS", name)
def act(uid, sql): return f"SET request.jwt.claim.sub='{uid}';SET ROLE authenticated;\n{sql}"
def partners(uid): return act(uid,"SELECT coalesce(string_agg(p->>'partner_id',',' ORDER BY p->>'partner_id'),'') FROM jsonb_array_elements(public.seller_portfolio_capability_v1()->'partners') p;")

data = TMP/"data"
try:
    subprocess.run(PRIV+["initdb","-D",str(data),"-U","postgres","-A","trust"],check=True,capture_output=True)
    subprocess.run(PRIV+["pg_ctl","-D",str(data),"-o",f"-k {TMP} -p {PORT} -c listen_addresses=''","-w","start"],check=True,capture_output=True)
    run((H/"fixture.sql").read_text())
    run("SET app.expected_ref='wrong';\n"+(H/"01-pre.sql.readonly").read_text(), error="VENDEDOR_PRE_REF_UNPROVEN"); results.append({"name":"pre_ref_divergente_falha","status":"PASS"})
    check("pre_pass", "SET app.expected_ref='swzpzcwiasxmjutrmvkm';\n"+(H/"01-pre.sql.readonly").read_text()+"", None)
    run((H/"02a-install-enum.sql.review").read_text()); run((H/"02b-install.sql.review").read_text())
    run(f"""INSERT INTO organizations VALUES('{ORG_A}'),('{ORG_B}');
INSERT INTO profiles VALUES('{ADMIN}','{ORG_A}',true),('{V1}','{ORG_A}',true),('{V2}','{ORG_A}',true),('{GC}','{ORG_A}',true),('{ADMIN_B}','{ORG_B}',true),('{VB}','{ORG_B}',true);
INSERT INTO user_roles VALUES('{ADMIN}','administrador'),('{V1}','vendedor'),('{V2}','vendedor'),('{GC}','gestor_comercial'),('{ADMIN_B}','administrador'),('{VB}','vendedor');
INSERT INTO partner_accounts VALUES('{P1}','P1 ARBio','{ORG_A}'),('{P2}','P2 ARBio','{ORG_A}'),('{PB}','PB outro','{ORG_B}');""")
    check("post_pass", (H/"03-post.sql.readonly").read_text(), "POST_PASS")
    check("sem_atribuicao_carteira_vazia", partners(V1), "")
    check("vendedor_nao_atribui", act(V1,f"SELECT public.admin_assign_seller_portfolio_v1('{V1}','{P1}','auto');"), error="SELLER_PORTFOLIO_FORBIDDEN")
    check("gestor_comercial_nao_atribui", act(GC,f"SELECT public.admin_assign_seller_portfolio_v1('{V1}','{P1}','x');"), error="SELLER_PORTFOLIO_FORBIDDEN")
    check("motivo_obrigatorio", act(ADMIN,f"SELECT public.admin_assign_seller_portfolio_v1('{V1}','{P1}',' ');"), error="SELLER_PORTFOLIO_REASON_REQUIRED")
    check("parceiro_outro_tenant_negado", act(ADMIN,f"SELECT public.admin_assign_seller_portfolio_v1('{V1}','{PB}','x');"), error="SELLER_PORTFOLIO_FORBIDDEN")
    check("vendedor_outro_tenant_negado", act(ADMIN,f"SELECT public.admin_assign_seller_portfolio_v1('{VB}','{P1}','x');"), error="SELLER_PORTFOLIO_SELLER_INVALID")
    check("nao_vendedor_negado", act(ADMIN,f"SELECT public.admin_assign_seller_portfolio_v1('{GC}','{P1}','x');"), error="SELLER_PORTFOLIO_SELLER_INVALID")
    run(act(ADMIN,f"SELECT public.admin_assign_seller_portfolio_v1('{V1}','{P1}','carteira inicial');"))
    check("carteira_propria_visivel", partners(V1), P1)
    check("outro_vendedor_nao_ve", partners(V2), "")
    check("vendedor_outro_tenant_nao_ve", partners(VB), "")
    check("dupla_atribuicao_conflito", act(ADMIN,f"SELECT public.admin_assign_seller_portfolio_v1('{V2}','{P1}','x');"), error="SELLER_PORTFOLIO_ALREADY_ASSIGNED")
    check("admin_outro_tenant_nao_revoga", act(ADMIN_B,f"SELECT public.admin_revoke_seller_portfolio_v1((SELECT id FROM platform_private.seller_portfolio_assignments LIMIT 1),'x');"), error="permission denied")
    aid = run(f"SELECT id FROM platform_private.seller_portfolio_assignments WHERE partner_id='{P1}'")
    check("admin_outro_tenant_revoga_id_negado", act(ADMIN_B,f"SELECT public.admin_revoke_seller_portfolio_v1('{aid}','x');"), error="SELLER_PORTFOLIO_FORBIDDEN")
    check("tabela_inacessivel_cliente", act(V1,"SELECT count(*) FROM platform_private.seller_portfolio_assignments;"), error="permission denied")
    check("predicado_privado_sem_execute", act(V1,f"SELECT platform_private.seller_partner_in_portfolio('{P1}');"), error="permission denied")
    check("escritores_fechados", act(V1,"SELECT (public.seller_portfolio_capability_v1()->>'order_create')||(public.seller_portfolio_capability_v1()->>'quote_respond');"), "falsefalse")
    check("vendedor_sem_aprovacao_comercial", act(V1,"SELECT platform_private.b2b_internal_commercial_actor();"), "f")
    check("gestor_comercial_preservado", act(GC,"SELECT platform_private.b2b_internal_commercial_actor();"), "t")
    check("gestor_comercial_sem_carteira_vendedor", act(GC,"SELECT public.seller_portfolio_capability_v1()->>'reason';"), "not_seller")
    run(f"UPDATE profiles SET ativo=false WHERE user_id='{V1}'")
    check("perfil_inativo_revoga_acesso", partners(V1), "")
    run(f"UPDATE profiles SET ativo=true WHERE user_id='{V1}'; DELETE FROM user_roles WHERE user_id='{V1}' AND role='vendedor';")
    check("papel_removido_revoga_acesso", partners(V1), "")
    run(f"INSERT INTO user_roles VALUES('{V1}','vendedor')")
    check("historico_imutavel", f"UPDATE platform_private.seller_portfolio_assignments SET seller_user_id='{V2}';", error="SELLER_PORTFOLIO_IMMUTABLE")
    check("sem_delete", "DELETE FROM platform_private.seller_portfolio_assignments;", error="SELLER_PORTFOLIO_IMMUTABLE")
    run(act(ADMIN,f"SELECT public.admin_revoke_seller_portfolio_v1('{aid}','troca de carteira');"))
    check("revogacao_oculta_carteira", partners(V1), "")
    check("revogacao_repetida_negada", act(ADMIN,f"SELECT public.admin_revoke_seller_portfolio_v1('{aid}','x');"), error="SELLER_PORTFOLIO_FORBIDDEN")
    run(act(ADMIN,f"SELECT public.admin_assign_seller_portfolio_v1('{V2}','{P1}','reatribuição');"))
    check("reatribuicao_outro_vendedor", partners(V2), P1)
    check("auditoria_completa", "SELECT string_agg(action,',' ORDER BY id) FROM platform_private.seller_portfolio_audit;", "assign,revoke,assign")
    check("rollback_recusa_ativos", (H/"04-rollback.sql.review").read_text(), error="VENDEDOR_ROLLBACK_ACTIVE_ASSIGNMENTS")
    run(act(ADMIN,f"SELECT public.admin_revoke_seller_portfolio_v1((SELECT id FROM public.admin_list_seller_portfolio_v1() WHERE revoked_at IS NULL),'fim');"))
    run((H/"04-rollback.sql.review").read_text())
    check("rollback_preserva_historico", "SELECT count(*) FROM platform_private.seller_portfolio_assignments;", "2")
    check("rollback_remove_rpcs", "SELECT to_regprocedure('public.seller_portfolio_capability_v1()') IS NULL;", "t")
finally:
    subprocess.run(PRIV+["pg_ctl","-D",str(data),"-m","immediate","stop"],capture_output=True)
    hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(H.glob("0*.sql.*"))+[H/"fixture.sql"]}
    ev = H/"evidence"; ev.mkdir(exist_ok=True)
    (ev/"attempt-001.json").write_text(json.dumps({"results":results,"sha256":hashes},indent=1,ensure_ascii=False))
    shutil.rmtree(TMP, ignore_errors=True)
print(f"TOTAL {len(results)} PASS")
