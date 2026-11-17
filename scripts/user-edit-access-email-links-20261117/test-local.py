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
import time
T0 = int(time.time()) - 5          # iat de um JWT "antigo" (emitido antes das mudanças)
FRESH = lambda: int(time.time()) + 3600   # iat de um JWT renovado (sintético)
def psql(sql, user=None, ok=True, iat=None):
    pre = ""
    if user and "{ACTOR}" in sql:   # caminho Edge: JWT do ator verificado -> service_role com ator/iat explícitos
        sql = sql.replace("{ACTOR}", user).replace("{IAT}", str(iat if iat is not None else FRESH()))
        pre = "SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false); SET ROLE service_role; "
    elif user:
        claims = json.dumps({"sub": user, "iat": iat if iat is not None else FRESH(), "role": "authenticated"})
        pre = f"SELECT set_config('request.jwt.claims','{claims}',false); SET ROLE authenticated; "
    p = subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtX", "-c", pre + sql], capture_output=True, text=True)
    if ok and p.returncode: raise RuntimeError(p.stderr)
    return p
last = lambda p: p.stdout.strip().splitlines()[-1]
# Transporte de e-mail FAKE/local + Auth sintético (GoTrue simulado): updateUser grava email_change e
# "envia" token para a caixa local; o titular confirma pelo token. Nenhum e-mail real, nenhum link admin.
OUTBOX = []
def auth_update_user(uid, email):
    psql(f"UPDATE auth.users SET email_change=lower('{email}') WHERE id='{uid}'")
    tok = str(uuid.uuid4()); OUTBOX.append({"to": email.lower(), "token": tok, "uid": uid}); return tok
def auth_confirm(tok):
    m = next(m for m in OUTBOX if m["token"] == tok)
    psql(f"UPDATE auth.users SET email=email_change, email_change=NULL WHERE id='{m['uid']}' AND email_change='{m['to']}'")
results = []; SNAPS = {}; FINDINGS = []
def check(name, cond, detail=""):
    results.append({"name": name, "pass": bool(cond), "detail": detail}); print(("PASS " if cond else "FAIL ") + name, detail if not cond else "")
def denied(name, sql, user, code):
    p = psql(sql, user, ok=False); check(name, p.returncode != 0 and code in p.stderr, p.stderr.strip()[-160:])
# rev.6 — topologias: prod (gatilhos de produção verbatim + candidato de produção);
# hml_legacy / hml_stmt (candidato HML gerado; gatilho de principal legado por linha ou statement de produção).
TOPO = os.environ.get("TOPOLOGY", "prod"); LEG = TOPO == "hml_legacy"; UNSUPPORTED = []; assert TOPO in ("prod", "hml_legacy", "hml_stmt")
HML_ORGS = ("c809e74f-486b-44b2-b2f4-4088f53421bb", "dcf50a75-579a-4828-a0fc-1d8eadcb4b8a")
# Costura declarada: no banco descartável is_platform_superadmin é sintético; seu pin (comprovado em HML pelo alinhamento 01) é pulado SÓ na cópia /tmp.
gen = subprocess.run(["python3", os.path.join(HERE, "hml", "build_hml.py")], capture_output=True, text=True,
                     env={**os.environ, "HML_HARNESS_SKIP_PINS": "public.is_platform_superadmin(uuid)"})
if gen.returncode: print(gen.stderr); sys.exit(2)
HML_SQL = "/tmp/candidate-hml.harness.sql"
def load(path):
    return subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-qX", "-f", path], capture_output=True, text=True)
LEGACY_SQL = open(os.path.join(HERE, "..", "..", "supabase", "migrations", "20260519155317_951d81f0-fda4-4bf3-ae39-c96edda8df7f.sql")).read()
LEGACY_FN = LEGACY_SQL[LEGACY_SQL.index("CREATE OR REPLACE FUNCTION public.sync_user_cliente_principal()"):]
LEGACY_FN = LEGACY_FN[:LEGACY_FN.index("$$;") + 3]
try:
    for f in ("harness-stubs.sql", "captured-prod-user-triggers-20261117.sql", "captured-prod-consumers-20261117.sql"):
        p = load(os.path.join(HERE, f))
        if p.returncode: print(p.stderr); sys.exit(2)
    PROD_ORGS = ("8eae2bc1-ad00-4402-9f57-564258e493ca","442444d9-263f-45d9-a991-a679498d06c3","4e537fd6-4632-4c70-a782-386dba3e8f9f","8f57c7dd-0557-4041-b401-7a00f7244626","007bb519-cba0-4704-be2c-cb93ad010048")
    psql("INSERT INTO public.organizations(id) VALUES " + ",".join(f"('{o}')" for o in (HML_ORGS if TOPO != "prod" else PROD_ORGS)))
    if TOPO == "hml_legacy":   # variante legada documentada (md5 50392a57…), carregada do arquivo de migração do repositório
        psql("DROP TRIGGER trg_user_clientes_sync_ins ON public.user_clientes; DROP TRIGGER trg_user_clientes_sync_upd ON public.user_clientes; DROP TRIGGER trg_user_clientes_sync_del ON public.user_clientes; DROP FUNCTION public.sync_user_cliente_principal();")
        psql(LEGACY_FN + "\nCREATE TRIGGER trg_user_clientes_sync AFTER INSERT OR UPDATE OR DELETE ON public.user_clientes FOR EACH ROW EXECUTE FUNCTION public.sync_user_cliente_principal();")
        check("HML legado: md5 do gatilho = variante documentada", psql("SELECT md5(pg_get_functiondef('public.sync_user_cliente_principal()'::regprocedure))").stdout.strip() == "50392a57c5908c67c709c4e84f0e932e")
    other = HML_SQL if TOPO == "prod" else os.path.join(HERE, "candidate.sql.review")
    p = load(other)
    check("PRE recusa o pacote da outra topologia (sem mutação)", p.returncode != 0 and ("not_homolog" in p.stderr or "PRE drift" in p.stderr or "impressão digital" in p.stderr)
          and psql("SELECT to_regprocedure('public.tenant_admin_user_access_exec_v1(uuid,bigint,text,jsonb)') IS NULL").stdout.strip() == "t", p.stderr[-200:])
    pr = subprocess.run(["psql", "-h", tmp, "-p", port, "-U", "postgres", "-qAtX", "-f", os.path.join(HERE, "hml", "00-hml-user-topology-probe.sql")], capture_output=True, text=True)
    items = [x.split("PROBE ", 1)[1] for x in pr.stderr.split("\n") if "NOTICE:  PROBE " in x]
    if TOPO == "prod":
        check("sonda HML em produção aponta 'não é homologação'", any(x.startswith("not_homolog") for x in items), str(items))
    else:   # única pendência = costura sintética declarada (is_platform_superadmin)
        check("sonda HML: só a costura sintética declarada diverge", [x for x in items if not x.startswith("sync_md5=")] == [x for x in items if x.startswith("function_drift:public.is_platform_superadmin")]
              and len([x for x in items if x.startswith("function_drift")]) == 1, str(items))
    p = load(os.path.join(HERE, "candidate.sql.review") if TOPO == "prod" else HML_SQL)
    if p.returncode: print(p.stderr); sys.exit(2)
    U = {k: str(uuid.uuid4()) for k in ["adminA","adminB","consA","prodA","b2bA","intA","superX"]}
    OA, OB = str(uuid.uuid4()), str(uuid.uuid4()); C1, C2, C3, CB = (str(uuid.uuid4()) for _ in range(4)); PA, PB = str(uuid.uuid4()), str(uuid.uuid4())
    org = {"adminA":OA,"consA":OA,"prodA":OA,"b2bA":OA,"intA":OA,"adminB":OB,"superX":OA}
    psql(f"INSERT INTO public.organizations(id) VALUES ('{OA}'),('{OB}')")
    seed = [f"INSERT INTO auth.users VALUES ('{u}','{k}@ex.test')" for k,u in U.items()]
    seed += [f"INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{u}','{k}','{k}@ex.test','{org[k]}')" for k,u in U.items()]
    seed += [f"INSERT INTO public.clientes VALUES ('{C1}','Fazenda Um',null,'{OA}'),('{C2}','Fazenda Dois',null,'{OA}'),('{C3}','Sítio 100%_x',null,'{OA}'),('{CB}','Fazenda B',null,'{OB}')",
             f"INSERT INTO public.partner_accounts VALUES ('{PA}',true,null,'{OA}'),('{PB}',true,null,'{OB}')",
             f"INSERT INTO public.user_roles(user_id,role) VALUES ('{U['adminA']}','administrador'),('{U['adminB']}','administrador'),('{U['consA']}','consultor_tecnico'),('{U['intA']}','financeiro'),('{U['superX']}','superadmin'),('{U['b2bA']}','parceiro_b2b')",
             f"INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES ('{U['prodA']}','{C1}',true)",
             f"INSERT INTO public.user_roles(user_id,role) VALUES ('{U['prodA']}','cliente_produtor')",
             f"INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES ('{PA}','{U['b2bA']}','gestor','{OA}')"]
    # Bootstrap declarado: o PRIMEIRO administrador (adminA/adminB) é semeado com session_replication_role=replica,
    # pois z99_cf_require_admin (real) exige um admin ativo já existente. Todo o resto roda com os 28 gatilhos ativos.
    boot = [x for x in seed if ("profiles" in x and ("'adminA'" in x or "'adminB'" in x))]
    psql("SET session_replication_role = replica; " + "; ".join([f"INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{U[n]}','{n}','{n}@ex.test','{org[n]}')" for n in ("adminA","adminB")]) +
         f"; INSERT INTO public.user_roles(user_id,role) VALUES ('{U['adminA']}','administrador'),('{U['adminB']}','administrador'); SET session_replication_role = origin")
    seed = [x.replace(f"('{U['adminA']}','administrador'),('{U['adminB']}','administrador'),", "") for x in seed]
    seed = [x if not x.startswith("INSERT INTO public.profiles") else x for x in seed]
    seed = [x for x in seed if not (x.startswith("INSERT INTO public.profiles") and (f"'{U['adminA']}'" in x or f"'{U['adminB']}'" in x))]
    psql("; ".join(seed))
    NTRG = "26" if TOPO == "hml_legacy" else "28"
    check(f"gatilhos carregados e habilitados ({NTRG})", psql("SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgenabled='O' AND tgrelid IN ('public.profiles'::regclass,'public.user_roles'::regclass,'public.user_clientes'::regclass,'public.partner_users'::regclass)").stdout.strip() == NTRG)
    k = lambda: str(uuid.uuid4())
    A, B = U["adminA"], U["adminB"]
    def AT(u, t, add=None, rm=None, cli=None, key=None, reason="motivo válido"):
        a = {"user_id": u, "target": t, "roles": add or [], "remove_roles": rm or [], "idempotency_key": key or k(), "reason": reason}
        if cli: a["cliente_id"] = cli.strip("'")
        return "SELECT public.tenant_admin_user_access_exec_v1('{ACTOR}'::uuid,{IAT},'change_access_type','" + json.dumps(a).replace("'", "''") + "'::jsonb)"
    def LX(u, a, c, rep=None, lvl=None, vf=None, vu=None, reason="teste"):
        d = {"user_id": u, "action": a, "cliente_id": c, "idempotency_key": k(), "reason": reason}
        if rep: d["replace_cliente_id"] = rep.strip("'")
        if lvl: d["access_level"] = lvl
        if vf: d["valid_from"] = vf
        if vu: d["valid_until"] = vu
        return "SELECT public.tenant_admin_user_access_exec_v1('{ACTOR}'::uuid,{IAT},'consultor_link','" + json.dumps(d) + "'::jsonb)"
    arr = lambda *r: list(r)
    import datetime as _dt
    iso = lambda days=0: (_dt.datetime.now(_dt.timezone.utc) + _dt.timedelta(days=days)).isoformat()
    SYNC = lambda u: json.loads(last(psql(f"SET ROLE service_role; SELECT public.user_email_change_sync_service_v1('{u}')")))
    roles = lambda u: psql(f"SELECT string_agg(role::text, ',' ORDER BY role) FROM public.user_roles WHERE user_id='{u}'").stdout.strip()
    # Fase 2 — negações
    denied("self escalation negado", AT(A, "internal", arr("gestor")), A, "self_change_denied")
    denied("admin outro tenant negado", AT(U["intA"], "internal", arr("gestor")), B, "forbidden")
    denied("não admin negado", AT(U["intA"], "internal", arr("administrador")), U["consA"], "forbidden")
    denied("alvo superadmin negado", AT(U["superX"], "internal", arr("gestor")), A, "forbidden")
    denied("authenticated sem EXECUTE no núcleo de serviço", AT(U["intA"], "internal", arr("gestor")).replace("{ACTOR}", A).replace("{IAT}", str(FRESH())), A, "permission denied")
    denied("anon sem EXECUTE no núcleo de serviço", "SET ROLE anon; " + AT(U["intA"], "internal", arr("gestor")).replace("{ACTOR}", A).replace("{IAT}", "1"), None, "permission denied")
    denied("serviço sem iat do ator negado", AT(U["intA"], "internal", arr("gestor")).replace("{IAT}", "null"), A, "not_authenticated")
    denied("motivo obrigatório", AT(U["intA"], "internal", arr("gestor"), reason=""), A, "reason_required")
    denied("superadmin não atribuível", AT(U["intA"], "internal", arr("superadmin")), A, "internal_roles_required")
    denied("B2B sem papel explícito", AT(U["intA"], "b2b", rm=arr("financeiro")), A, "b2b_roles_required")
    denied("B2B sem vínculo de parceiro", AT(U["intA"], "b2b", add=arr("parceiro_b2b_tecnico"), rm=arr("financeiro")), A, "partner_link_required")
    denied("produtor com cliente de outro tenant", AT(U["intA"], "producer", rm=arr("financeiro"), cli=f"'{CB}'"), A, "cliente_required")
    before = roles(U["intA"])
    denied("papel incompatível sem confirmação é rejeitado", AT(U["intA"], "producer", cli=f"'{C2}'"), A, "incompatible_roles")
    check("rejeição sem mutação", roles(U["intA"]) == before and psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U['intA']}'").stdout.strip() == "0")
    denied("remover papel compatível é rejeitado", AT(U["consA"], "internal", arr("gestor"), rm=arr("consultor_tecnico")), A, "invalid_remove_roles")
    # Papéis combinados preservados
    psql(AT(U["consA"], "internal", arr("gestor")), A)
    check("interno: papéis existentes preservados + novo", roles(U["consA"]) == "gestor,consultor_tecnico")
    psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{U['b2bA']}','parceiro_b2b_tecnico')")
    p = psql(AT(U["b2bA"], "b2b"), A, ok=False)
    check("B2B gestor+técnico preservado (sem mudança = no_change)", p.returncode != 0 and "no_change" in p.stderr and roles(U["b2bA"]) == "parceiro_b2b,parceiro_b2b_tecnico")
    # Transições explícitas
    key = k(); sql = AT(U["intA"], "producer", rm=arr("financeiro"), cli=f"'{C2}'", key=key, reason="vira produtor")
    r1 = json.loads(last(psql(sql, A))); r2 = json.loads(last(psql(sql, A)))
    check("interno→produtor com remoção confirmada", r1["roles"] == ["cliente_produtor"] and r1["removed_roles"] == ["financeiro"])
    check("replay idempotente", r2.get("replayed") is True)
    denied("mesma chave, payload diferente", AT(U["intA"], "producer", rm=arr("financeiro"), cli=f"'{C1}'", key=key, reason="vira produtor"), A, "idempotency_conflict")
    check("user_id preservado", psql(f"SELECT user_id FROM public.profiles WHERE user_id='{U['intA']}'").stdout.strip() == U["intA"])
    # Sessão antiga (JWT emitido antes da mudança) perde TODA autoridade baseada em papel
    check("JWT antigo: has_role novo papel negado", last(psql(f"SELECT public.has_role('{U['intA']}','cliente_produtor')", U["intA"], iat=T0)) == "f")
    check("JWT antigo: papel removido negado", last(psql(f"SELECT public.has_role('{U['intA']}','financeiro')", U["intA"], iat=T0)) == "f")
    check("JWT antigo: diagnóstico stale=true", json.loads(last(psql("SELECT public.my_session_authz_state_v1()", U["intA"], iat=T0)))["stale"] is True)
    check("JWT renovado: novo papel vale", last(psql(f"SELECT public.has_role('{U['intA']}','cliente_produtor')", U["intA"])) == "t")
    check("JWT renovado: papel removido continua negado", last(psql(f"SELECT public.has_role('{U['intA']}','financeiro')", U["intA"])) == "f")
    check("outros usuários não são afetados pela época do alvo", last(psql(f"SELECT public.has_role('{B}','administrador')", B, iat=T0)) == "t")
    # Admin rebaixado: JWT antigo não mantém autoridade administrativa
    A2 = str(uuid.uuid4()); psql(f"INSERT INTO auth.users VALUES ('{A2}','a2@ex.test'); INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{A2}','a2','a2@ex.test','{OA}'); INSERT INTO public.user_roles(user_id,role) VALUES ('{A2}','administrador')")
    psql(AT(A2, "producer", rm=arr("administrador"), cli=f"'{C3}'", reason="rebaixado"), A)
    denied("admin rebaixado com JWT antigo não executa RPC admin", AT(U["consA"], "internal", arr("aplicador")), A2, "forbidden")
    p = psql(AT(U["consA"], "internal", arr("aplicador")), A2, ok=False, iat=T0)
    check("admin rebaixado com JWT antigo (iat antigo) negado", p.returncode != 0 and "forbidden" in p.stderr)
    check("admin rebaixado: busca de clientes negada", psql("SELECT public.tenant_admin_search_clientes_v1('',0,5)", A2, ok=False, iat=T0).returncode != 0)
    r = json.loads(last(psql(AT(U["prodA"], "internal", arr("consultor_tecnico"), rm=arr("cliente_produtor"), reason="vira consultor"), A)))
    check("produtor→consultor: vínculo de produtor encerrado", r["roles"] == ["consultor_tecnico"] and psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U['prodA']}' AND revoked_at IS NULL").stdout.strip() == "0")
    check("JWT antigo do ex-produtor: acesso ao cliente revogado negado", last(psql(f"SELECT public.has_active_user_cliente_access('{U['prodA']}','{C1}')", U["prodA"], iat=T0)) == "f")
    check("JWT antigo do ex-produtor: has_role produtor negado", last(psql(f"SELECT public.has_role('{U['prodA']}','cliente_produtor')", U["prodA"], iat=T0)) == "f")
    check("produtor→consultor: vínculo preservado como histórico", psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{U['prodA']}'").stdout.strip() == "1")
    denied("B2B→interno sem confirmar remoção", AT(U["b2bA"], "internal", arr("gestor")), A, "incompatible_roles")
    r = json.loads(last(psql(AT(U["b2bA"], "internal", arr("gestor"), rm=arr("parceiro_b2b", "parceiro_b2b_tecnico"), reason="sai do B2B"), A)))
    check("B2B→interno revoga partner_users", psql(f"SELECT count(*) FROM public.partner_users WHERE user_id='{U['b2bA']}' AND revoked_at IS NULL").stdout.strip() == "0" and r["roles"] == ["gestor"])
    check("partner_users preservado (histórico)", psql(f"SELECT count(*) FROM public.partner_users WHERE user_id='{U['b2bA']}'").stdout.strip() == "1")
    psql(f"INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES ('{PA}','{U['b2bA']}','gestor','{OA}')")
    r = json.loads(last(psql(AT(U["b2bA"], "b2b", add=arr("parceiro_b2b"), rm=arr("gestor"), reason="volta B2B"), A)))
    check("interno→B2B com vínculo ativo", r["roles"] == ["parceiro_b2b"])
    check("auditoria append-only", psql("UPDATE platform_private.user_admin_change_audit SET reason='x'", ok=False).returncode != 0)
    check("auditoria não legível por authenticated", psql("SELECT count(*) FROM platform_private.user_admin_change_audit", A, ok=False).returncode != 0)
    # Fase 3 — e-mail
    T = U["consA"]
    denied("e-mail duplicado", f"SELECT public.tenant_admin_email_change_request_v1('{T}','INTA@ex.test','{k()}')", A, "email_unavailable")
    denied("e-mail inválido", f"SELECT public.tenant_admin_email_change_request_v1('{T}','x@','{k()}')", A, "invalid_email")
    denied("e-mail outro tenant", f"SELECT public.tenant_admin_email_change_request_v1('{T}','novo@ex.test','{k()}')", B, "forbidden")
    r = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{T}','Novo@Ex.test','{k()}')", A)))
    check("solicitação pendente", r["status"] == "pending"); op = r["op_id"]
    check("admin não gerou link nem e-mail", OUTBOX == [])
    denied("segunda pendência bloqueada", f"SELECT public.tenant_admin_email_change_request_v1('{T}','outro@ex.test','{k()}')", A, "email_change_pending")
    check("e-mail atual preservado antes da confirmação", psql(f"SELECT email FROM public.profiles WHERE user_id='{T}'").stdout.strip() == "consA@ex.test")
    denied("sync worker negado a authenticated", f"SELECT platform_private.user_email_change_sync_v1('{op}')", A, "permission denied")
    mp = json.loads(last(psql("SELECT public.user_email_change_my_pending_v1()", T)))
    check("titular vê o pedido ligado a auth.uid", mp["status"] == "pending" and mp["new_email"] == "novo@ex.test")
    check("outro usuário não vê o pedido", json.loads(last(psql("SELECT public.user_email_change_my_pending_v1()", U["intA"])))["status"] == "none")
    denied("admin não aceita pelo titular", f"SELECT public.user_email_change_accept_v1('{op}')", A, "forbidden")
    acc = json.loads(last(psql(f"SELECT public.user_email_change_accept_v1('{op}')", T)))
    check("aceite devolve endereço canônico", acc["new_email"] == "novo@ex.test")
    check("antes do updateUser: aguardando titular", json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", T)))["status"] == "awaiting_holder")
    tok = auth_update_user(T, acc["new_email"])   # supabase.auth.updateUser({email}) com a sessão do titular (Auth sintético)
    check("Auth (fake) enviou confirmação ao novo endereço local", len(OUTBOX) == 1 and OUTBOX[0]["to"] == "novo@ex.test")
    check("sem confirmação: perfil não muda", json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", T)))["status"] == "awaiting_auth_confirmation"
          and psql(f"SELECT email FROM public.profiles WHERE user_id='{T}'").stdout.strip() == "consA@ex.test")
    auth_confirm(tok)                              # titular abre o link oficial do Auth
    s1 = json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", T)))
    check("sob JWT do titular só observa (guard global de profiles)", s1["status"] == "auth_confirmed_sync_pending" and psql(f"SELECT email FROM public.profiles WHERE user_id='{T}'").stdout.strip() == "consA@ex.test")
    sv = SYNC(T)
    s2 = json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", T)))
    check("sync de serviço do titular após confirmação do Auth", sv["status"] == "confirmed" and psql(f"SELECT email FROM public.profiles WHERE user_id='{T}'").stdout.strip() == "novo@ex.test")
    check("sync idempotente", s2.get("replayed") is True and psql(f"SELECT count(*) FROM platform_private.user_admin_change_audit WHERE kind='email_confirmed' AND target_id='{T}'").stdout.strip() == "1")
    r = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{T}','terceiro@ex.test','{k()}')", A)))
    tok2 = auth_update_user(T, "diferente@ex.test"); auth_confirm(tok2)
    check("endereço diferente do canônico nunca sincroniza", json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", T)))["status"] in ("awaiting_holder",)
          and psql(f"SELECT email FROM public.profiles WHERE user_id='{T}'").stdout.strip() == "novo@ex.test")
    r = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_cancel_v1('{T}','{k()}')", A)))
    check("cancelamento pelo admin", r["status"] == "cancelled")
    r = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{T}','quarto@ex.test','{k()}')", A)))
    check("recusa pelo titular", json.loads(last(psql(f"SELECT public.user_email_change_decline_v1('{r['op_id']}')", T)))["status"] == "cancelled")
    # Serialização pós-aceite: link oficial emitido não é "cancelado" localmente.
    def mkuser(nm, o):
        u = str(uuid.uuid4()); psql(f"INSERT INTO auth.users VALUES ('{u}','{nm}@ex.test'); INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{u}','{nm}','{nm}@ex.test','{o}')"); return u
    pe = lambda u: psql(f"SELECT email FROM public.profiles WHERE user_id='{u}'").stdout.strip()
    rs = lambda op: psql(f"SELECT status||':'||(holder_accepted_at IS NOT NULL) FROM platform_private.user_email_change_requests WHERE id='{op}'").stdout.strip()
    H1 = mkuser("h1", OA)
    op1 = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{H1}','h1novo@ex.test','{k()}')", A)))["op_id"]
    psql(f"SELECT public.user_email_change_accept_v1('{op1}')", H1)
    tk = auth_update_user(H1, "h1novo@ex.test")
    check("status admin após aceite: aguardando Auth, não cancelável", (lambda j: j["status"] == "accepted_awaiting_auth" and j["cancellable"] is False)(json.loads(last(psql(f"SELECT public.tenant_admin_email_change_status_v1('{H1}')", A)))))
    denied("admin não cancela após aceite", f"SELECT public.tenant_admin_email_change_cancel_v1('{H1}','{k()}')", A, "email_change_accepted_locked")
    denied("titular não recusa após aceite", f"SELECT public.user_email_change_decline_v1('{op1}')", H1, "email_change_accepted_locked")
    denied("liberação negada com troca pendente no Auth (envio ambíguo)", f"SELECT public.user_email_change_release_v1('{op1}')", H1, "email_change_accepted_locked")
    psql(f"UPDATE platform_private.user_email_change_requests SET expires_at = now() - interval '1 hour' WHERE id='{op1}'")
    denied("novo pedido bloqueado enquanto travado", f"SELECT public.tenant_admin_email_change_request_v1('{H1}','h1outro@ex.test','{k()}')", A, "email_change_pending")
    sx = json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", H1)))
    check("prazo vencido não expira pedido travado", sx["status"] == "awaiting_auth_confirmation" and sx["locked"] is True and rs(op1) == "pending:true" and pe(H1) == "h1@ex.test")
    check("titular ainda vê pedido travado após prazo", json.loads(last(psql("SELECT public.user_email_change_my_pending_v1()", H1))).get("accepted") is True)
    auth_confirm(tk)   # clique tardio no link da caixa falsa
    check("confirmação tardia: titular observa", json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", H1)))["status"] == "auth_confirmed_sync_pending" and pe(H1) == "h1@ex.test")
    check("confirmação tardia sincroniza profiles (serviço)", SYNC(H1)["status"] == "confirmed" and pe(H1) == "h1novo@ex.test" and rs(op1) == "confirmed:true")
    # Erro de envio: aceite sem troca pendente no Auth → saída segura, depois cancelável.
    H2 = mkuser("h2", OA)
    op2 = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{H2}','h2novo@ex.test','{k()}')", A)))["op_id"]
    psql(f"SELECT public.user_email_change_accept_v1('{op2}')", H2)
    denied("cancelamento negado entre aceite e envio", f"SELECT public.tenant_admin_email_change_cancel_v1('{H2}','{k()}')", A, "email_change_accepted_locked")
    denied("liberação imediata negada (Auth pode registrar o envio depois)", f"SELECT public.user_email_change_release_v1('{op2}')", H2, "email_change_release_too_early")
    psql(f"UPDATE platform_private.user_email_change_requests SET holder_accepted_at = holder_accepted_at - interval '11 minutes' WHERE id='{op2}'")
    rl = json.loads(last(psql(f"SELECT public.user_email_change_release_v1('{op2}')", H2)))
    check("liberação após falha de envio comprovada", rl.get("released") is True and rs(op2) == "pending:false")
    check("cancelamento permitido após liberação", json.loads(last(psql(f"SELECT public.tenant_admin_email_change_cancel_v1('{H2}','{k()}')", A)))["status"] == "cancelled" and pe(H2) == "h2@ex.test")
    check("nenhum link emitido para pedido liberado", not any(m["uid"] == H2 for m in OUTBOX))
    # Entre empresas: aceito em A, titular movido para B, confirmação tardia.
    H3 = mkuser("h3", OA); NB = mkuser("nb", OB)
    op3 = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{H3}','h3novo@ex.test','{k()}')", A)))["op_id"]
    psql(f"SELECT public.user_email_change_accept_v1('{op3}')", H3); tk3 = auth_update_user(H3, "h3novo@ex.test")
    psql(f"UPDATE public.profiles SET organization_id='{OB}' WHERE user_id='{H3}'")
    stb = last(psql(f"SELECT public.tenant_admin_email_change_status_v1('{H3}')", B))
    check("admin da nova empresa não vê pedido travado anterior", json.loads(stb)["status"] == "none" and "h3novo" not in stb)
    denied("admin da nova empresa não sobrescreve pedido travado", f"SELECT public.tenant_admin_email_change_request_v1('{H3}','h3b@ex.test','{k()}')", B, "email_change_pending")
    denied("admin anterior não cancela após troca de empresa", f"SELECT public.tenant_admin_email_change_cancel_v1('{H3}','{k()}')", A, "forbidden")
    check("pedido travado não expirado na troca de empresa", rs(op3) == "pending:true")
    auth_confirm(tk3)
    ws3 = json.loads(last(psql(f"SET ROLE service_role; SELECT platform_private.user_email_change_sync_v1('{op3}')")))
    check("confirmação tardia após troca: só o titular é sincronizado", ws3["status"] == "confirmed" and pe(H3) == "h3novo@ex.test" and pe(NB) == "nb@ex.test"
          and psql(f"SELECT organization_id FROM platform_private.user_admin_change_audit WHERE kind='email_confirmed' AND target_id='{H3}'").stdout.strip() == OA)
    denied("liberação negada a outro usuário", f"SELECT public.user_email_change_release_v1('{op3}')", NB, "forbidden")
    # Fase 4 — vínculos do consultor
    s = json.loads(psql("SELECT public.tenant_admin_search_clientes_v1('fazenda',0,1)", A).stdout.strip().splitlines()[-1])
    check("busca paginada só do tenant", s["total"] == 2 and len(s["items"]) == 1)
    s = json.loads(psql("SELECT public.tenant_admin_search_clientes_v1('100%',0,10)", A).stdout.strip().splitlines()[-1])
    check("busca escapa curingas", s["total"] == 1)
    denied("busca por não admin", "SELECT public.tenant_admin_search_clientes_v1('',0,10)", T, "forbidden")
    L = lambda a, c, rep=None, lvl=None, vf=None, vu=None: LX(T, a, c, rep, lvl, vf, vu)
    psql(L("add", C1), A); psql(L("add", C2), A)
    check("múltiplos vínculos ativos", psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{T}' AND revoked_at IS NULL").stdout.strip() == "2")
    denied("vínculo duplicado", L("add", C1), A, "link_already_active")
    denied("cliente de outro tenant", L("add", CB), A, "forbidden")
    denied("período inválido", L("add", C3, vf=iso(), vu=iso(-1)), A, "invalid_period")
    denied("vínculo para produtor (não consultor)", LX(U['intA'], 'add', C3), A, "not_internal_consultant")
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
    psql(L("add", C3, vf=iso(1)), A)
    check("vínculo futuro não concede acesso", psql(f"SELECT public.has_active_user_cliente_access('{T}','{C3}')", T).stdout.strip().splitlines()[-1] == "f")
    # Isolamento entre empresas — fixtures legadas cruzadas (inseridas como postgres, sintéticas)
    X, Y, Z = (str(uuid.uuid4()) for _ in range(3))
    for u, nm, o in ((X, "legx", OA), (Y, "legy", OA), (Z, "movz", OA)):
        psql(f"INSERT INTO auth.users VALUES ('{u}','{nm}@ex.test'); INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{u}','{nm}','{nm}@ex.test','{o}')")
    psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{X}','consultor_tecnico'),('{Y}','parceiro_b2b'),('{Z}','consultor_tecnico')")
    psql(f"INSERT INTO public.user_clientes(user_id,cliente_id,access_level) VALUES ('{X}','{C1}','read'),('{X}','{CB}','read')")
    psql(f"INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES ('{PA}','{Y}','gestor','{OA}'),('{PB}','{Y}','gestor','{OB}')")
    OLDOP = str(uuid.uuid4())
    psql(f"INSERT INTO platform_private.user_admin_change_audit(idempotency_key,actor_id,organization_id,target_id,kind,request_hash,after_state,reason) VALUES ('{k()}','{B}','{OB}','{Z}','consultor_link','h',jsonb_build_object('action','add','cliente_id','{CB}'),'segredo B')")
    psql(f"INSERT INTO platform_private.user_email_change_requests(id,organization_id,target_id,old_email,new_email,requested_by) VALUES ('{OLDOP}','{OB}','{Z}','movz@ex.test','zb@ex.test','{B}')")
    lx = last(psql(f"SELECT public.tenant_admin_consultor_links_v1('{X}')", A))
    check("listagem não revela ID/nome de cliente de outra empresa", CB not in lx and "Fazenda B" not in lx and C1 in lx)
    lz = last(psql(f"SELECT public.tenant_admin_consultor_links_v1('{Z}')", A))
    check("histórico de organização anterior não aparece", "segredo B" not in lz and CB not in lz and json.loads(lz)["history"] == [])
    snap = roles(X); nlinks = psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{X}' AND revoked_at IS NULL").stdout.strip()
    denied("transição com vínculo cruzado rejeitada", AT(X, "internal", arr("gestor")), A, "scope_unprovable")
    denied("transição com vínculo cruzado (remoção) rejeitada", AT(X, "producer", rm=arr("consultor_tecnico"), cli=f"'{C2}'"), A, "scope_unprovable")
    check("rejeição atômica: papéis e vínculos intactos", roles(X) == snap and psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{X}' AND revoked_at IS NULL").stdout.strip() == nlinks)
    denied("vínculo novo com legado cruzado rejeitado", LX(X, 'add', C2), A, "scope_unprovable")
    denied("replace valida o cliente substituído (outro tenant)", LX(X, 'replace', C2, rep=CB), A, "forbidden")
    check("replace cruzado não encerrou o vínculo B", psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{X}' AND cliente_id='{CB}' AND revoked_at IS NULL").stdout.strip() == "1")
    denied("admin B não lista usuário de A", f"SELECT public.tenant_admin_consultor_links_v1('{X}')", B, "forbidden")
    pu_before = psql(f"SELECT count(*) FROM public.partner_users WHERE user_id='{Y}' AND revoked_at IS NULL").stdout.strip()
    denied("partner_users de outro tenant bloqueia transição", AT(Y, "internal", arr("gestor"), rm=arr("parceiro_b2b")), A, "scope_unprovable")
    check("partner_users de B intactos", psql(f"SELECT count(*) FROM public.partner_users WHERE user_id='{Y}' AND revoked_at IS NULL").stdout.strip() == pu_before == "2" and roles(Y) == "parceiro_b2b")
    st = last(psql(f"SELECT public.tenant_admin_email_change_status_v1('{Z}')", A))
    check("status não mostra pedido da organização anterior", json.loads(st)["status"] == "none" and "zb@ex.test" not in st)
    check("titular não vê pedido da organização anterior", json.loads(last(psql("SELECT public.user_email_change_my_pending_v1()", Z)))["status"] == "none")
    denied("titular não aceita pedido da organização anterior", f"SELECT public.user_email_change_accept_v1('{OLDOP}')", Z, "forbidden")
    check("sync do titular ignora pedido anterior", json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", Z)))["status"] == "none")
    r = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{Z}','za@ex.test','{k()}')", A)))
    check("novo pedido expira o da organização anterior", r["status"] == "pending" and psql(f"SELECT status FROM platform_private.user_email_change_requests WHERE id='{OLDOP}'").stdout.strip() == "expired")
    ws = json.loads(last(psql(f"SET ROLE service_role; SELECT platform_private.user_email_change_sync_v1('{OLDOP}')")))
    check("worker não sincroniza pedido de organização anterior", ws["ok"] is False and psql(f"SELECT email FROM public.profiles WHERE user_id='{Z}'").stdout.strip() == "movz@ex.test")
    Q = str(uuid.uuid4()); psql(f"INSERT INTO auth.users VALUES ('{Q}','q@ex.test'); INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{Q}','q','q@ex.test','{OB}')")
    denied("pedido duplicado em outra empresa é neutro", f"SELECT public.tenant_admin_email_change_request_v1('{Q}','za@ex.test','{k()}')", B, "email_unavailable")
    # Ator que mudou de empresa: a chave antiga não devolve o resultado da empresa anterior.
    A3 = str(uuid.uuid4()); W = str(uuid.uuid4()); K3 = k()
    psql(f"INSERT INTO auth.users VALUES ('{A3}','a3@ex.test'),('{W}','w@ex.test'); INSERT INTO public.profiles(user_id,nome,email,organization_id) VALUES ('{A3}','a3','a3@ex.test','{OA}'),('{W}','w','w@ex.test','{OB}'); INSERT INTO public.user_roles(user_id,role) VALUES ('{A3}','administrador'),('{W}','financeiro')")
    psql(f"SELECT public.tenant_admin_email_change_request_v1('{U['intA']}','k3@ex.test','{K3}')", A3)
    psql(f"UPDATE public.profiles SET organization_id='{OB}' WHERE user_id='{A3}'")
    p = psql(f"SELECT public.tenant_admin_email_change_request_v1('{W}','k3@ex.test','{K3}')", A3, ok=False)
    check("replay não atravessa troca de empresa do ator", "replayed" not in p.stdout and (p.returncode != 0 or '"op_id"' in p.stdout))
    # Concorrência: duas transações com chaves diferentes no mesmo alvo → uma vence, outra conflito.
    outs = []
    def worker(): outs.append(psql(L("end", C1), A, ok=False))
    ts = [threading.Thread(target=worker) for _ in range(2)]; [t.start() for t in ts]; [t.join() for t in ts]
    if LEG:
        check("HML legado: encerrar o vínculo mais antigo (reeleito encerrado) aborta nas duas", all(o.returncode != 0 for o in outs) and "scope_postcondition_failed" in "".join(o.stderr for o in outs))
        UNSUPPORTED.append("encerrar/substituir o vínculo mais antigo de consultor com outros vigentes (gatilho legado reelege vínculo encerrado)")
    else:
        check("concorrência: exatamente um encerramento", sorted(o.returncode for o in outs) == [0, 1] and "link_not_active" in "".join(o.stderr for o in outs))
    # ===================== rev.5 — gatilhos REAIS de produção, fotos antes/depois =====================
    snap = lambda u: json.loads(last(psql(f"SELECT platform_private.user_admin_scope_snapshot('{u}','{OA}')")))
    fin = lambda u, c, iat=None: last(psql(f"SELECT count(*) FROM public.accounts_receivable WHERE customer_id='{c}'", u, iat=iat))
    com = lambda u: last(psql("SELECT count(*) FROM public.commercial_campaigns", u))
    ids = lambda u: last(psql(f"SELECT 'ids:'||array_to_string(ARRAY(SELECT unnest(public.get_cliente_ids_for_user('{u}')) ORDER BY 1),',')", u))
    psql(f"INSERT INTO public.accounts_receivable(customer_id) VALUES ('{C1}'),('{C2}'),('{C3}'); INSERT INTO public.commercial_campaigns(id,ativa,tipo_publico) VALUES ('{OLDOP}',true,'comercial'); INSERT INTO public.commercial_campaign_clientes VALUES ('{OLDOP}','{C1}')")
    # 0) Motivo do caminho de serviço: sob JWT, o gatilho real de principal grava profiles.cliente_id e o guard real nega.
    M0 = mkuser("m0", OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{M0}','consultor_tecnico')")
    p = psql(f"SELECT set_config('request.jwt.claims','{{\"sub\":\"{A}\",\"role\":\"authenticated\"}}',false); INSERT INTO public.user_clientes(user_id,cliente_id) VALUES ('{M0}','{C1}')", ok=False)
    check("sob JWT o par real sync_principal+guard nega escrita (prova do caminho de serviço)", p.returncode != 0 and "profile_protected_fields" in p.stderr, p.stderr[-160:])
    # 1) Consultor multi-produtor -> produtor com principal diferente
    K = mkuser("kmulti", OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{K}','consultor_tecnico')")
    for c in (C1, C2, C3): psql(LX(K, "add", c), A)
    SNAPS["consultor_multi_antes"] = b = snap(K)
    check("gatilho real promoveu principal do CONSULTOR e gravou profiles.cliente_id", b["profile_cliente_id"] == C1 and sum(l["principal"] for l in b["active_links"]) == 1 and len(b["active_links"]) == 3)
    check("consultor com principal: financeiro negado (sem papel produtor)", all(fin(K, c) == "0" for c in (C1, C2, C3)))
    check("rev.6: consultor com vínculo vigente NÃO vê campanha comercial", com(K) == "0")
    if LEG:
        denied("HML legado: consultor multi -> produtor (principal diferente) aborta limpo", AT(K, "producer", rm=arr("consultor_tecnico"), cli=f"'{C2}'", reason="consultor vira produtor"), A, "principal_sync_incompatible")
        check("HML legado: aborto sem mutação (fotos iguais)", snap(K) == b and roles(K) == "consultor_tecnico")
        UNSUPPORTED.append("consultor multi -> produtor com principal diferente (exige gatilho statement com filtro de vigência)")
    else:
        r = json.loads(last(psql(AT(K, "producer", rm=arr("consultor_tecnico"), cli=f"'{C2}'", reason="consultor vira produtor"), A)))
        SNAPS["consultor_multi_depois_produtor"] = a = snap(K)
        check("consultor multi -> produtor (principal diferente) sem unique violation", r["ok"] is True and a["roles"] == ["cliente_produtor"])
        check("só o cliente escolhido fica vigente/principal; demais encerrados", [l["cliente_id"] for l in a["active_links"]] == [C2] and a["active_links"][0]["principal"] and a["open_links"] == 1 and a["profile_cliente_id"] == C2)
        check("financeiro do novo produtor: só o próprio cliente", fin(K, C2) == "1" and fin(K, C1) == "0" and fin(K, C3) == "0" and ids(K) == "ids:" + C2)
        check("JWT antigo do novo produtor: financeiro negado", fin(K, C2, iat=T0) == "0")
        check("ex-vínculos técnicos preservados como histórico", psql(f"SELECT count(*) FROM public.user_clientes WHERE user_id='{K}'").stdout.strip() == "3")
    # 2) Produtor com secundário -> interno (e -> interno consultor): nenhum vínculo residual
    def mkprod(nm, cs):
        u = mkuser(nm, OA)
        psql(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES " + ",".join(f"('{u}','{c}',{str(i==0).lower()})" for i, c in enumerate(cs)) + f"; INSERT INTO public.user_roles(user_id,role) VALUES ('{u}','cliente_produtor')")
        return u
    P2 = mkprod("p2", (C1, C2)); SNAPS["produtor_secundario_antes"] = snap(P2)
    psql(AT(P2, "internal", add=arr("gestor"), rm=arr("cliente_produtor"), reason="produtor vira interno"), A)
    SNAPS["produtor_secundario_depois_interno"] = a = snap(P2)
    check("produtor -> interno: principal E secundário encerrados, cliente_id nulo", a["active_links"] == [] and a["open_links"] == 0 and a["profile_cliente_id"] is None and a["roles"] == ["gestor"])
    _d = (fin(P2, C1), fin(P2, C2), ids(P2)); check("ex-produtor interno: financeiro negado", _d == ("0", "0", "ids:"), str(_d))
    P2b = mkprod("p2b", (C1, C3))
    psql(AT(P2b, "internal", add=arr("consultor_tecnico"), rm=arr("cliente_produtor"), reason="produtor vira consultor"), A)
    a = snap(P2b); SNAPS["produtor_secundario_depois_consultor"] = a
    check("produtor -> consultor: vínculos de produtor não viram técnicos", a["active_links"] == [] and a["open_links"] == 0 and a["profile_cliente_id"] is None)
    # 3) Produtor com secundário -> B2B técnico; técnico B2B não vira gestor
    P3 = mkprod("p3", (C2, C3)); psql(f"INSERT INTO public.partner_users(partner_id,user_id,papel) VALUES ('{PA}','{P3}','gestor')")
    SNAPS["produtor_b2b_antes"] = snap(P3)
    psql(AT(P3, "b2b", add=arr("parceiro_b2b_tecnico"), rm=arr("cliente_produtor"), reason="produtor vira B2B técnico"), A)
    SNAPS["produtor_b2b_depois"] = a = snap(P3)
    check("produtor -> B2B: sem vínculos residuais, cliente_id nulo", a["active_links"] == [] and a["open_links"] == 0 and a["profile_cliente_id"] is None)
    check("técnico B2B não recebeu gestor implicitamente", a["roles"] == ["parceiro_b2b_tecnico"])
    denied("B2B técnico sem papel explícito = sem mudança", AT(P3, "b2b"), A, "no_change")
    check("ex-produtor B2B: financeiro negado", fin(P3, C2) == "0" and fin(P3, C3) == "0")
    if not LEG: denied("produtor já produtor: secundários só pelo caminho canônico", AT(K, "producer", cli=f"'{C1}'"), A, "no_change")
    # 4) Administrador: paridade com admin_edit_user_profile_v1 e sem atalho por transição externa
    W2 = mkuser("w2", OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{W2}','financeiro')")
    r = json.loads(last(psql(AT(W2, "internal", add=arr("administrador"), reason="promoção a admin"), A)))
    check("interno -> +administrador (mesma política do caminho canônico)", "administrador" in r["roles"] and "financeiro" in r["roles"])
    check("novo admin: JWT antigo sem autoridade de admin", last(psql(f"SELECT public.has_role('{W2}','administrador')", W2, iat=T0)) == "f")
    s0 = snap(P3)
    denied("externo -> interno+administrador na mesma operação negado", AT(P3, "internal", add=arr("administrador"), rm=arr("parceiro_b2b_tecnico")), A, "admin_grant_requires_internal_user")
    check("negação de admin sem mutação", snap(P3) == s0)
    denied("B2B não aceita administrador", AT(P3, "b2b", add=arr("administrador")), A, "b2b_roles_required")
    denied("admin não promove a si mesmo", AT(A, "internal", add=arr("gestor")), A, "self_change_denied")
    # 5) Substituição do vínculo principal de consultor sem violação de unicidade
    K2 = mkuser("k2", OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{K2}','consultor_tecnico')")
    psql(LX(K2, "add", C1), A); psql(LX(K2, "add", C2), A)
    if LEG:
        b2 = snap(K2)
        denied("HML legado: replace do principal mais antigo aborta limpo", LX(K2, "replace", C3, rep=C1), A, "scope_postcondition_failed")
        check("HML legado: aborto do replace sem mutação", snap(K2) == b2)
    else:
        psql(LX(K2, "replace", C3, rep=C1), A); a = snap(K2); SNAPS["consultor_replace_principal"] = a
        check("replace do principal: um único principal vigente, cliente_id coerente", sorted(l["cliente_id"] for l in a["active_links"]) == sorted([C2, C3])
              and sum(l["principal"] for l in a["active_links"]) == 1 and a["profile_cliente_id"] in (C2, C3))
    # 6) E-mail: liberação antes de o Auth registrar o envio + link tardio após cancelamento
    H4 = mkuser("h4", OA)
    op4 = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{H4}','h4novo@ex.test','{k()}')", A)))["op_id"]
    psql(f"SELECT public.user_email_change_accept_v1('{op4}')", H4)
    denied("corrida: liberação antes de o Auth registrar o envio negada", f"SELECT public.user_email_change_release_v1('{op4}')", H4, "email_change_release_too_early")
    psql(f"UPDATE platform_private.user_email_change_requests SET holder_accepted_at = holder_accepted_at - interval '11 minutes' WHERE id='{op4}'")
    psql(f"SELECT public.user_email_change_release_v1('{op4}')", H4)
    check("cancelado após liberação", json.loads(last(psql(f"SELECT public.tenant_admin_email_change_cancel_v1('{H4}','{k()}')", A)))["status"] == "cancelled")
    tk4 = auth_update_user(H4, "h4novo@ex.test"); auth_confirm(tk4)   # Auth registra/entrega DEPOIS (caixa falsa)
    check("link tardio após cancelamento: titular observa divergência", json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", H4)))["status"] == "auth_confirmed_sync_pending")
    check("link tardio após cancelamento: serviço reconcilia só o titular", SYNC(H4)["status"] == "confirmed" and pe(H4) == "h4novo@ex.test" and pe(NB) == "nb@ex.test")
    check("auditoria marca confirmação tardia", psql(f"SELECT after_state->>'late' FROM platform_private.user_admin_change_audit WHERE kind='email_confirmed' AND target_id='{H4}'").stdout.strip() == "true")
    check("serviço de sync negado sob JWT", psql(f"SELECT public.user_email_change_sync_service_v1('{H4}')", H4, ok=False).returncode != 0)
    check("serviço de sync sem pedido não altera perfil", SYNC(NB)["status"] == "none" and pe(NB) == "nb@ex.test")
    # ===================== rev.6 — campanhas: vínculo de consultor não concede acesso comercial =====================
    CAMP = OLDOP; CAMPB = str(uuid.uuid4())
    psql(f"INSERT INTO public.commercial_campaigns(id,ativa,tipo_publico) VALUES ('{CAMPB}',true,'b2b'); INSERT INTO public.commercial_campaign_partners VALUES ('{CAMPB}','{PA}')")
    seen = lambda u, iat=None: last(psql("SELECT coalesce(string_agg(id::text, ',' ORDER BY id), '-') FROM public.commercial_campaigns", u, iat=iat))
    CP = mkuser("cpuro", OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{CP}','consultor_tecnico')"); psql(LX(CP, "add", C1), A)
    check("campanha: consultor puro com vínculo vigente não vê", seen(CP) == "-")
    TA = mkuser("tagro", OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{TA}','tecnico_agronomo')"); psql(LX(TA, "add", C1), A)
    check("campanha: técnico agrônomo com vínculo vigente não vê", seen(TA) == "-")
    PX = mkprod("pcamp", (C1,))
    check("campanha (só rev.6, defeito HML): produtor com vínculo vigente vê zero", seen(PX) == "-")
    GC = mkuser("gcom", OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{GC}','gestor_comercial')")
    check("campanha: gestor comercial (autorização explícita) preservado", CAMP in seen(GC) and CAMPB in seen(GC))
    check("campanha: administrador preservado", CAMP in seen(A))
    BP = mkuser("bpart", OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{BP}','parceiro_b2b'); INSERT INTO public.partner_users(partner_id,user_id,papel,tenant_id) VALUES ('{PA}','{BP}','gestor','{OA}')")
    check("campanha: parceiro B2B vê só a campanha B2B do seu parceiro", seen(BP) == CAMPB)
    MIX = mkprod("pmix", (C1,)); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{MIX}','consultor_tecnico')")
    check("campanha: produtor+consultor (vínculo ambíguo) negado", seen(MIX) == "-")
    PBX = mkuser("pbx", OB); psql(f"INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES ('{PBX}','{C1}',true); INSERT INTO public.user_roles(user_id,role) VALUES ('{PBX}','cliente_produtor')")
    check("campanha: produtor de outra empresa com vínculo legado cruzado não vê", seen(PBX) == "-")
    psql(AT(PX, "internal", add=arr("consultor_tecnico"), rm=arr("cliente_produtor"), reason="produtor vira consultor"), A)
    check("campanha: mudança produtor→consultor (JWT renovado) perde acesso", seen(PX) == "-")
    psql(LX(PX, "add", C1), A)
    check("campanha: ex-produtor agora consultor vinculado ao mesmo cliente não vê", seen(PX) == "-")
    psql(AT(CP, "producer", rm=arr("consultor_tecnico"), cli=f"'{C1}'", reason="consultor vira produtor"), A)
    check("campanha (só rev.6): consultor→produtor ainda zero sem aditivo", seen(CP) == "-")
    check("campanha: JWT antigo após a mudança não vê", seen(CP, iat=T0) == "-")
    PE = mkprod("pend", (C1,)); psql(f"UPDATE public.user_clientes SET revoked_at = now(), is_active = false WHERE user_id = '{PE}'")
    check("campanha: produtor com vínculo encerrado não vê", seen(PE) == "-")
    # ===================== campanhas vigentes do próprio produtor (aditivo pós-rev.6) =====================
    CSQL = os.path.join(HERE, "campanhas-produtor-vigentes.sql"); CRB = os.path.join(HERE, "campanhas-produtor-vigentes.rollback.sql")
    SP = "SET search_path = \"$user\", public; "
    MD5 = "SELECT md5(pg_get_expr(polqual, polrelid)) FROM pg_policy WHERE polrelid='public.commercial_campaigns'::regclass AND polname='campanhas_cliente_select'"
    rev6 = last(psql(SP + MD5)); body = open(CSQL).read()
    alter = body[body.index("CREATE OR REPLACE FUNCTION platform_private.campaign_visible"):body.index(");", body.index("ALTER POLICY campanhas_cliente_select")) + 2]
    new_md5 = last(psql("BEGIN; " + alter + " " + SP + MD5 + "; ROLLBACK;"))
    check("aditivo: pins de PRE/POST/rollback coincidem com rev.6 e versão nova", f"'{rev6}'" in body and f"'{new_md5}'" in body and f"'{rev6}'" in open(CRB).read(), f"rev6={rev6} new={new_md5}")
    check("HML reproduzido: produtor com vínculo vigente vê zero antes do aditivo", seen(CP) == "-")
    p = load(CSQL); check("aditivo executa após candidate", p.returncode == 0, p.stderr[-300:])
    p = load(CSQL); check("aditivo idempotente (reexecução)", p.returncode == 0, p.stderr[-300:])
    check("aditivo: produtor (consultor→produtor) vê campanha vigente do seu cliente", seen(CP) == CAMP)
    check("aditivo: JWT antigo continua sem ver", seen(CP, iat=T0) == "-")
    for u, nm in ((TA, "técnico agrônomo"), (MIX, "produtor+consultor"), (PBX, "produtor de outra empresa (vínculo cruzado)"), (PX, "ex-produtor consultor"), (PE, "vínculo encerrado")):
        check(f"aditivo: {nm} continua sem ver", seen(u) == "-")
    check("aditivo: admin/gestor comercial/parceiro preservados", CAMP in seen(A) and CAMP in seen(GC) and CAMPB in seen(GC) and seen(BP) == CAMPB)
    check("aditivo: destinatários continuam ilegíveis ao produtor", last(psql("SELECT count(*) FROM public.commercial_campaign_clientes", CP)) == "0")
    check("aditivo: helper sem EXECUTE para anon", last(psql("SELECT has_function_privilege('anon','platform_private.campaign_visible_to_own_producer_v1(uuid)','EXECUTE')")) == "f")
    check("aditivo: helper não revela campanha alheia (false)", last(psql(f"SELECT platform_private.campaign_visible_to_own_producer_v1('{CAMPB}')", CP)) == "f")
    TODAY = "(now() AT TIME ZONE 'America/Sao_Paulo')::date"
    win = {}
    for nm, ini, fim, extra in (("limite inclusivo (hoje..hoje)", TODAY, TODAY, ""), ("passada", f"{TODAY}-10", f"{TODAY}-1", ""),
                                ("futura", f"{TODAY}+1", f"{TODAY}+10", ""), ("inativa", TODAY, f"{TODAY}+5", "inativa"),
                                ("tipo b2b", TODAY, f"{TODAY}+5", "b2b"), ("tipo ambos", f"{TODAY}-3", TODAY, "ambos")):
        i = str(uuid.uuid4()); win[nm] = i
        psql(f"INSERT INTO public.commercial_campaigns(id,ativa,tipo_publico,data_inicio,data_fim) VALUES ('{i}',{'false' if extra=='inativa' else 'true'},'{extra if extra in ('b2b','ambos') else 'comercial'}',{ini},{fim}); INSERT INTO public.commercial_campaign_clientes(campaign_id,cliente_id) VALUES ('{i}','{C1}')")
    v = seen(CP).split(",")
    for nm, exp in (("limite inclusivo (hoje..hoje)", True), ("passada", False), ("futura", False), ("inativa", False), ("tipo b2b", False), ("tipo ambos", True)):
        check(f"vigência: {nm} {'visível' if exp else 'oculta'}", (win[nm] in v) == exp)
    OTHER = str(uuid.uuid4()); psql(f"INSERT INTO public.commercial_campaigns(id,ativa,tipo_publico) VALUES ('{OTHER}',true,'comercial'); INSERT INTO public.commercial_campaign_clientes(campaign_id,cliente_id) VALUES ('{OTHER}','{C2}')")
    check("cliente diverso no mesmo tenant: campanha oculta", OTHER not in seen(CP).split(","))
    psql(f"UPDATE public.clientes SET status_cliente='inativo' WHERE id='{C1}'"); check("cliente inativo: nenhuma campanha", seen(CP) == "-")
    psql(f"UPDATE public.clientes SET status_cliente='ativo' WHERE id='{C1}'")
    psql(f"UPDATE public.user_clientes SET valid_until = now() - interval '1 minute' WHERE user_id='{CP}' AND cliente_id='{C1}'"); check("vínculo expirado: nenhuma campanha", seen(CP) == "-")
    psql(f"UPDATE public.user_clientes SET valid_until = NULL, valid_from = now() + interval '1 day' WHERE user_id='{CP}' AND cliente_id='{C1}'"); check("vínculo futuro: nenhuma campanha", seen(CP) == "-")
    psql(f"UPDATE public.user_clientes SET valid_from = now() - interval '1 day' WHERE user_id='{CP}' AND cliente_id='{C1}'"); check("vínculo restaurado volta a ver", CAMP in seen(CP))
    psql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{CP}'"); check("perfil inativo: nenhuma campanha", seen(CP) == "-")
    psql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{CP}'")
    # ---- projeção "Minhas campanhas" (somente leitura, exclusiva do titular) ----
    RSQL = os.path.join(HERE, "campanhas-produtor-minhas-rpc.sql"); RRB = os.path.join(HERE, "campanhas-produtor-minhas-rpc.rollback.sql")
    p = load(RSQL); check("RPC minhas campanhas instala", p.returncode == 0, p.stderr[-300:])
    p = load(RSQL); check("RPC minhas campanhas idempotente", p.returncode == 0, p.stderr[-300:])
    MY = lambda u, o=0, l=20: json.loads(last(psql(f"SELECT public.producer_my_campaigns_v1({o},{l})", u)))
    r = MY(CP); mine = {i["id"] for i in r["items"]}
    check("RPC: produtor recebe só campanhas vigentes do seu cliente", mine == {CAMP, win["limite inclusivo (hoje..hoje)"], win["tipo ambos"]} and r["total"] == 3, str(r))
    check("RPC: só campos de leitura (sem destinatários/autoria)", all(set(i) == {"id","nome","descricao","data_inicio","data_fim"} for i in r["items"]))
    pg = MY(CP, 0, 2); pg2 = MY(CP, 2, 2)
    check("RPC: paginação estável sem repetição", pg["total"] == 3 and len(pg["items"]) == 2 and len(pg2["items"]) == 1 and not ({i["id"] for i in pg["items"]} & {i["id"] for i in pg2["items"]}))
    denied("RPC: limite > 20 rejeitado", "SELECT public.producer_my_campaigns_v1(0,21)", CP, "invalid_page")
    denied("RPC: offset negativo rejeitado", "SELECT public.producer_my_campaigns_v1(-1,5)", CP, "invalid_page")
    AP = mkprod("adminprod", (C1,)); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{AP}','administrador')")
    check("RPC: perfil cumulativo admin+produtor vê pelo SELECT todas, mas a RPC só as suas", OTHER in seen(AP).split(",") and OTHER not in {i["id"] for i in MY(AP)["items"]} and CAMPB not in {i["id"] for i in MY(AP)["items"]})
    check("RPC: administrador/gestor comercial puros recebem zero", MY(A)["total"] == 0 and MY(GC)["total"] == 0)
    check("RPC: consultor, técnico, parceiro e outra empresa recebem zero", all(MY(u)["total"] == 0 for u in (TA, MIX, PBX, BP)))
    check("RPC: JWT antigo recebe zero", json.loads(last(psql("SELECT public.producer_my_campaigns_v1(0,20)", CP, iat=T0)))["total"] == 0)
    check("RPC: anon sem EXECUTE", last(psql("SELECT has_function_privilege('anon','public.producer_my_campaigns_v1(integer,integer)','EXECUTE')")) == "f")
    p = load(RRB); check("rollback da RPC executa", p.returncode == 0 and last(psql("SELECT to_regprocedure('public.producer_my_campaigns_v1(integer,integer)') IS NULL")) == "t", p.stderr[-200:])
    rbc = load(CRB); check("rollback do aditivo executa e restaura rev.6", rbc.returncode == 0 and last(psql(SP + MD5)) == rev6, rbc.stderr[-200:])
    check("após rollback do aditivo: helper removido e consultor sem campanha", last(psql("SELECT to_regprocedure('platform_private.campaign_visible_to_own_producer_v1(uuid)') IS NULL")) == "t" and seen(TA) == "-")
    p = load(CSQL); check("aditivo reaplicável após rollback", p.returncode == 0, p.stderr[-300:])
    load(CRB)
    # ===================== rev.6 — ator inativo / empresa inativa / senha provisória =====================
    for nm, fix in (("perfil inativo", "UPDATE public.profiles SET ativo = false WHERE user_id = '{u}'"),
                    ("senha provisória", "UPDATE public.profiles SET senha_provisoria = true WHERE user_id = '{u}'")):
        AX = mkuser("ax" + nm[:3], OA); psql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{AX}','administrador')"); psql(fix.format(u=AX))
        denied(f"ator admin com {nm} negado", AT(U["intA"], "internal", arr("aplicador")), AX, "forbidden")
    OC = str(uuid.uuid4()); psql(f"INSERT INTO public.organizations(id, ativo) VALUES ('{OC}', false)")
    AC = mkuser("acinat", OC); TC = mkuser("tcinat", OC)
    psql(f"SET session_replication_role = replica; INSERT INTO public.user_roles(user_id,role) VALUES ('{AC}','administrador'),('{TC}','financeiro'); SET session_replication_role = origin")
    denied("ator admin de empresa inativa negado", AT(TC, "internal", arr("aplicador")), AC, "forbidden")
    check("rev.6: sync de e-mail negado a titular inativo", (lambda u: (psql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{u}'"), psql(f"SET ROLE service_role; SELECT public.user_email_change_sync_service_v1('{u}')", ok=False).returncode != 0)[1])(mkuser("hinat", OA)))
    # ===================== rev.6 — rollback não reabre o vazamento =====================
    rb = load(os.path.join(HERE, "rollback.sql.review"))
    check("rollback executa", rb.returncode == 0, rb.stderr[-200:])
    check("após rollback: consultor continua sem campanha (produtor sem aditivo: negação segura)", seen(TA) == "-" and seen(CP) == "-")
    check("após rollback: núcleo de escrita inalcançável", psql("SELECT to_regprocedure('public.tenant_admin_user_access_exec_v1(uuid,bigint,text,jsonb)') IS NULL").stdout.strip() == "t")
finally:
    subprocess.run(AS+["pg_ctl", "-D", data, "-m", "fast", "stop"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
ok = all(r["pass"] for r in results)
json.dump({"topology": TOPO, "unsupported_in_topology": UNSUPPORTED, "passed": sum(r["pass"] for r in results), "total": len(results), "results": results, "snapshots": SNAPS, "findings": FINDINGS}, open(os.path.join(HERE, "evidence-local.json" if TOPO == "prod" else f"evidence-local-{TOPO}.json"), "w"), indent=1, ensure_ascii=False)
print(f"{sum(r['pass'] for r in results)}/{len(results)}"); sys.exit(0 if ok else 1)
