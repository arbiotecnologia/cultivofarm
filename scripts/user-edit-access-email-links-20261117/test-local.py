#!/usr/bin/env python3
"""Teste em PostgreSQL descartável (initdb em /tmp). Costuras sintéticas declaradas; não é prova hosted."""
import subprocess, tempfile, os, json, sys, uuid, shutil, threading
if os.environ.get("PGBIN"): os.environ["PATH"] = os.environ["PGBIN"] + ":" + os.environ["PATH"]
HERE = os.path.dirname(os.path.abspath(__file__))
tmp = tempfile.mkdtemp(prefix="uea-pg-"); data = os.path.join(tmp, "d"); port = "55437"
run = lambda *a, **k: subprocess.run(a, check=True, capture_output=True, text=True, **k)
AS = ["runuser","-u","nobody","--"] if os.geteuid()==0 else []
if AS: os.chmod(tmp, 0o777)
run(*AS, "initdb", "-D", data, "-U", "postgres", "--auth=trust")
run(*AS, "pg_ctl", "-D", data, "-o", f"-p {port} -k {tmp} -c listen_addresses=''", "-l", os.path.join(tmp, "log"), "-w", "start")
def psql(sql, user=None, ok=True):
    pre = "SET ROLE authenticated; " if user else ""
    if user: pre = f"SELECT set_config('request.jwt.claim.sub','{user}',false); " + pre
    p = subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", pre + sql], capture_output=True, text=True)
    if ok and p.returncode: raise RuntimeError(p.stderr)
    return p
results = []
def check(name, cond, detail=""):
    results.append({"name": name, "pass": bool(cond), "detail": detail}); print(("PASS " if cond else "FAIL ") + name, detail if not cond else "")
def denied(name, sql, user, code):
    p = psql(sql, user, ok=False); check(name, p.returncode != 0 and code in p.stderr, p.stderr.strip()[-160:])
try:
    for f in ("harness-stubs.sql", "candidate.sql.review"):
        p = subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qX", "-f", os.path.join(HERE, f)], capture_output=True, text=True)
        if p.returncode: print(p.stderr); sys.exit(2)
    U = {k: str(uuid.uuid4()) for k in ["adminA","adminB","consA","prodA","b2bA","intA","superX"]}
    OA, OB = str(uuid.uuid4()), str(uuid.uuid4()); C1, C2, C3, CB = (str(uuid.uuid4()) for _ in range(4)); PA, PB = str(uuid.uuid4()), str(uuid.uuid4())
    org = {"adminA":OA,"consA":OA,"prodA":OA,"b2bA":OA,"intA":OA,"adminB":OB,"superX":OA}
    seed = [f"INSERT INTO auth.users VALUES ('{u}','{k}@ex.test')" for k,u in U.items()]
    seed += [f"INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{u}','{k}','{k}@ex.test','{org[k]}')" for k,u in U.items()]
    seed += [f"INSERT INTO public.clientes VALUES ('{C1}','Fazenda Um',null,'{OA}'),('{C2}','Fazenda Dois',null,'{OA}'),('{C3}','Sítio 100%_x',null,'{OA}'),('{CB}','Fazenda B',null,'{OB}')",
             f"INSERT INTO public.partner_accounts VALUES ('{PA}',true,null,'{OA}'),('{PB}',true,null,'{OB}')",
             f"INSERT INTO public.user_roles(user_id,role) VALUES ('{U['adminA']}','administrador'),('{U['adminB']}','administrador'),('{U['consA']}','consultor_tecnico'),('{U['intA']}','financeiro'),('{U['superX']}','superadmin'),('{U['b2bA']}','parceiro_b2b')",
             f"INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES ('{U['prodA']}','{C1}',true)",
             f"INSERT INTO public.user_roles(user_id,role) VALUES ('{U['prodA']}','cliente_produtor')",
             f"INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES ('{PA}','{U['b2bA']}','gestor','{OA}')"]
    psql("; ".join(seed))
    k = lambda: str(uuid.uuid4())
    A, B = U["adminA"], U["adminB"]
    # Fase 2 — tipo de acesso
    denied("self escalation negado", f"SELECT public.tenant_admin_change_access_type_v1('{A}','internal',ARRAY['gestor']::app_role[],null,'{k()}','autoalteração')", A, "self_change_denied")
    denied("admin outro tenant negado", f"SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','internal',ARRAY['gestor']::app_role[],null,'{k()}','cross tenant')", B, "forbidden")
    denied("não admin negado", f"SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','internal',ARRAY['administrador']::app_role[],null,'{k()}','escalada')", U["consA"], "forbidden")
    denied("alvo superadmin negado", f"SELECT public.tenant_admin_change_access_type_v1('{U['superX']}','internal',ARRAY['gestor']::app_role[],null,'{k()}','superadmin')", A, "forbidden")
    denied("anon sem EXECUTE", f"SET ROLE anon; SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','internal',ARRAY['gestor']::app_role[],null,'{k()}','anon')", None, "permission denied")
    denied("motivo obrigatório", f"SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','internal',ARRAY['gestor']::app_role[],null,'{k()}','')", A, "reason_required")
    denied("superadmin não atribuível", f"SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','internal',ARRAY['superadmin']::app_role[],null,'{k()}','tentativa')", A, "internal_roles_required")
    denied("B2B sem vínculo de parceiro", f"SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','b2b',null,null,'{k()}','sem parceiro')", A, "partner_link_required")
    denied("produtor com cliente de outro tenant", f"SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','producer',null,'{CB}','{k()}','cliente B')", A, "cliente_required")
    key = k(); sql = f"SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','producer',null,'{C2}','{key}','vira produtor')"
    r1 = json.loads(psql(sql, A).stdout.strip().splitlines()[-1]); r2 = json.loads(psql(sql, A).stdout.strip().splitlines()[-1])
    check("interno→produtor", r1["roles"] == ["cliente_produtor"]); check("replay idempotente", r2.get("replayed") is True)
    denied("mesma chave, payload diferente", f"SELECT public.tenant_admin_change_access_type_v1('{U['intA']}','producer',null,'{C1}','{key}','vira produtor')", A, "idempotency_conflict")
    uid = psql(f"SELECT user_id FROM public.profiles WHERE user_id='{U['intA']}'").stdout.strip(); check("user_id preservado", uid == U["intA"])
    check("papel financeiro residual removido (sessão existente perde acesso)", psql(f"SELECT public.has_role('{U['intA']}','financeiro')").stdout.strip() == "f")
    r = json.loads(psql(f"SELECT public.tenant_admin_change_access_type_v1('{U['prodA']}','internal',ARRAY['consultor_tecnico']::app_role[],null,'{k()}','vira consultor')", A).stdout.strip().splitlines()[-1])
    check("produtor→interno consultor", r["roles"] == ["consultor_tecnico"])
    check("vínculo preservado sem principal", psql(f"SELECT count(*)||':'||bool_or(principal) FROM public.user_clientes WHERE user_id='{U['prodA']}' AND revoked_at IS NULL").stdout.strip() == "1:false")
    r = json.loads(psql(f"SELECT public.tenant_admin_change_access_type_v1('{U['b2bA']}','internal',ARRAY['gestor']::app_role[],null,'{k()}','sai do B2B')", A).stdout.strip().splitlines()[-1])
    check("B2B→interno revoga partner_users", psql(f"SELECT count(*) FROM public.partner_users WHERE user_id='{U['b2bA']}' AND revoked_at IS NULL").stdout.strip() == "0" and r["roles"] == ["gestor"])
    check("partner_users preservado (histórico)", psql(f"SELECT count(*) FROM public.partner_users WHERE user_id='{U['b2bA']}'").stdout.strip() == "1")
    psql(f"INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES ('{PA}','{U['b2bA']}','gestor','{OA}')")
    r = json.loads(psql(f"SELECT public.tenant_admin_change_access_type_v1('{U['b2bA']}','b2b',null,null,'{k()}','volta B2B')", A).stdout.strip().splitlines()[-1])
    check("interno→B2B com vínculo ativo", r["roles"] == ["parceiro_b2b"])
    check("auditoria append-only", psql(f"UPDATE platform_private.user_admin_change_audit SET reason='x'", ok=False).returncode != 0)
    check("auditoria não legível por authenticated", psql("SELECT count(*) FROM platform_private.user_admin_change_audit", A, ok=False).returncode != 0)
    # Fase 3 — e-mail
    T = U["consA"]
    denied("e-mail duplicado", f"SELECT public.tenant_admin_email_change_request_v1('{T}','INTA@ex.test','{k()}')", A, "email_unavailable")
    denied("e-mail inválido", f"SELECT public.tenant_admin_email_change_request_v1('{T}','x@','{k()}')", A, "invalid_email")
    denied("e-mail outro tenant", f"SELECT public.tenant_admin_email_change_request_v1('{T}','novo@ex.test','{k()}')", B, "forbidden")
    r = json.loads(psql(f"SELECT public.tenant_admin_email_change_request_v1('{T}','Novo@Ex.test','{k()}')", A).stdout.strip().splitlines()[-1])
    check("solicitação pendente", r["status"] == "pending"); op = r["op_id"]
    denied("segunda pendência bloqueada", f"SELECT public.tenant_admin_email_change_request_v1('{T}','outro@ex.test','{k()}')", A, "email_change_pending")
    check("e-mail atual preservado antes da confirmação", psql(f"SELECT email FROM public.profiles WHERE user_id='{T}'").stdout.strip() == "consA@ex.test")
    denied("sync negado a authenticated", f"SELECT platform_private.user_email_change_sync_v1('{op}')", A, "permission denied")
    r = json.loads(psql(f"SET ROLE service_role; SELECT platform_private.user_email_change_sync_v1('{op}')").stdout.strip().splitlines()[-1])
    check("sync aguarda titular", r["status"] == "awaiting_holder")
    psql(f"UPDATE auth.users SET email='novo@ex.test' WHERE id='{T}'")  # simula confirmação pelo titular no Auth
    r = json.loads(psql(f"SET ROLE service_role; SELECT platform_private.user_email_change_sync_v1('{op}')").stdout.strip().splitlines()[-1])
    check("sync após confirmação", r["status"] == "confirmed" and psql(f"SELECT email FROM public.profiles WHERE user_id='{T}'").stdout.strip() == "novo@ex.test")
    r = json.loads(psql(f"SELECT public.tenant_admin_email_change_request_v1('{T}','terceiro@ex.test','{k()}')", A).stdout.strip().splitlines()[-1])
    r = json.loads(psql(f"SELECT public.tenant_admin_email_change_cancel_v1('{T}','{k()}')", A).stdout.strip().splitlines()[-1])
    check("cancelamento", r["status"] == "cancelled")
    # Fase 4 — vínculos do consultor
    s = json.loads(psql("SELECT public.tenant_admin_search_clientes_v1('fazenda',0,1)", A).stdout.strip().splitlines()[-1])
    check("busca paginada só do tenant", s["total"] == 2 and len(s["items"]) == 1)
    s = json.loads(psql("SELECT public.tenant_admin_search_clientes_v1('100%',0,10)", A).stdout.strip().splitlines()[-1])
    check("busca escapa curingas", s["total"] == 1)
    denied("busca por não admin", "SELECT public.tenant_admin_search_clientes_v1('',0,10)", T, "forbidden")
    L = lambda a, c, rep="null", lvl="null", vf="null", vu="null": f"SELECT public.tenant_admin_consultor_link_v1('{T}','{a}','{c}',{rep},{lvl},{vf},{vu},'{k()}','teste')"
    psql(L("add", C1), A); psql(L("add", C2), A)
    check("múltiplos vínculos ativos", psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{T}' AND revoked_at IS NULL").stdout.strip() == "2")
    denied("vínculo duplicado", L("add", C1), A, "link_already_active")
    denied("cliente de outro tenant", L("add", CB), A, "forbidden")
    denied("período inválido", L("add", C3, vf="now()", vu="now()-interval '1 day'"), A, "invalid_period")
    denied("vínculo para produtor (não consultor)", f"SELECT public.tenant_admin_consultor_link_v1('{U['intA']}','add','{C3}',null,null,null,null,'{k()}',null)", A, "not_internal_consultant")
    psql(L("replace", C3, rep=f"'{C2}'"), A)
    check("substituição encerra antigo", psql(f"SELECT string_agg(cliente_id::text||':'||(revoked_at IS NULL), ',' ORDER BY cliente_id) FROM public.user_clientes WHERE user_id='{T}' AND cliente_id IN ('{C2}','{C3}')").stdout.strip().count("true") == 1)
    check("consultor acessa vinculado", psql(f"SELECT public.has_active_user_cliente_access('{T}','{C3}')", T).stdout.strip().splitlines()[-1] == "t")
    psql(L("end", C3), A)
    check("revogação corta acesso técnico", psql(f"SELECT public.has_active_user_cliente_access('{T}','{C3}')", T).stdout.strip().splitlines()[-1] == "f")
    check("consultor sem acesso a não vinculado", psql(f"SELECT public.has_active_user_cliente_access('{T}','{C2}')", T).stdout.strip().splitlines()[-1] == "f")
    psql(L("add", C2), A)
    h = json.loads(psql(f"SELECT public.tenant_admin_consultor_links_v1('{T}')", A).stdout.strip().splitlines()[-1])
    check("histórico preservado após reativação", len(h["history"]) >= 5 and len(h["items"]) == 3)
    denied("listagem cross-tenant", f"SELECT public.tenant_admin_consultor_links_v1('{T}')", B, "forbidden")
    psql(L("add", C3, vf="now()+interval '1 day'"), A)
    check("vínculo futuro não concede acesso", psql(f"SELECT public.has_active_user_cliente_access('{T}','{C3}')", T).stdout.strip().splitlines()[-1] == "f")
    # Concorrência: duas transações com chaves diferentes no mesmo alvo → uma vence, outra conflito.
    outs = []
    def worker(): outs.append(psql(L("end", C1), A, ok=False))
    ts = [threading.Thread(target=worker) for _ in range(2)]; [t.start() for t in ts]; [t.join() for t in ts]
    check("concorrência: exatamente um encerramento", sorted(o.returncode for o in outs) == [0, 1] and "link_not_active" in "".join(o.stderr for o in outs))
finally:
    subprocess.run(AS+["pg_ctl", "-D", data, "-m", "fast", "stop"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
ok = all(r["pass"] for r in results)
json.dump({"passed": sum(r["pass"] for r in results), "total": len(results), "results": results}, open(os.path.join(HERE, "evidence-local.json"), "w"), indent=1, ensure_ascii=False)
print(f"{sum(r['pass'] for r in results)}/{len(results)}"); sys.exit(0 if ok else 1)
