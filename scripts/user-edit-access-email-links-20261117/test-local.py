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
    if user:
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
    AT = lambda u, t, add="null", rm="null", cli="null", key=None, reason="motivo válido": f"SELECT public.tenant_admin_change_access_type_v1('{u}','{t}',{add},{rm},{cli},'{key or k()}','{reason}')"
    arr = lambda *r: "ARRAY[" + ",".join(f"'{x}'" for x in r) + "]::app_role[]"
    roles = lambda u: psql(f"SELECT string_agg(role::text, ',' ORDER BY role) FROM public.user_roles WHERE user_id='{u}'").stdout.strip()
    # Fase 2 — negações
    denied("self escalation negado", AT(A, "internal", arr("gestor")), A, "self_change_denied")
    denied("admin outro tenant negado", AT(U["intA"], "internal", arr("gestor")), B, "forbidden")
    denied("não admin negado", AT(U["intA"], "internal", arr("administrador")), U["consA"], "forbidden")
    denied("alvo superadmin negado", AT(U["superX"], "internal", arr("gestor")), A, "forbidden")
    denied("anon sem EXECUTE", "SET ROLE anon; " + AT(U["intA"], "internal", arr("gestor")), None, "permission denied")
    denied("motivo obrigatório", AT(U["intA"], "internal", arr("gestor"), reason=""), A, "reason_required")
    denied("superadmin não atribuível", AT(U["intA"], "internal", arr("superadmin")), A, "internal_roles_required")
    denied("B2B sem vínculo de parceiro", AT(U["intA"], "b2b", rm=arr("financeiro")), A, "partner_link_required")
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
    psql(f"SELECT public.tenant_admin_change_access_type_v1('{A2}','producer',null,{arr('administrador')},'{C3}','{k()}','rebaixado')", A)
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
    r = json.loads(last(psql(AT(U["b2bA"], "b2b", rm=arr("gestor"), reason="volta B2B"), A)))
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
    s2 = json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", T)))
    check("sync no retorno após confirmação do Auth", s1["status"] == "confirmed" and psql(f"SELECT email FROM public.profiles WHERE user_id='{T}'").stdout.strip() == "novo@ex.test")
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
    check("confirmação tardia sincroniza profiles", json.loads(last(psql("SELECT public.user_email_change_sync_self_v1()", H1)))["status"] == "confirmed" and pe(H1) == "h1novo@ex.test" and rs(op1) == "confirmed:true")
    # Erro de envio: aceite sem troca pendente no Auth → saída segura, depois cancelável.
    H2 = mkuser("h2", OA)
    op2 = json.loads(last(psql(f"SELECT public.tenant_admin_email_change_request_v1('{H2}','h2novo@ex.test','{k()}')", A)))["op_id"]
    psql(f"SELECT public.user_email_change_accept_v1('{op2}')", H2)
    denied("cancelamento negado entre aceite e envio", f"SELECT public.tenant_admin_email_change_cancel_v1('{H2}','{k()}')", A, "email_change_accepted_locked")
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
    denied("vínculo novo com legado cruzado rejeitado", f"SELECT public.tenant_admin_consultor_link_v1('{X}','add','{C2}',null,null,null,null,'{k()}',null)", A, "scope_unprovable")
    denied("replace valida o cliente substituído (outro tenant)", f"SELECT public.tenant_admin_consultor_link_v1('{X}','replace','{C2}','{CB}',null,null,null,'{k()}',null)", A, "forbidden")
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
    check("concorrência: exatamente um encerramento", sorted(o.returncode for o in outs) == [0, 1] and "link_not_active" in "".join(o.stderr for o in outs))
finally:
    subprocess.run(AS+["pg_ctl", "-D", data, "-m", "fast", "stop"], capture_output=True); shutil.rmtree(tmp, ignore_errors=True)
ok = all(r["pass"] for r in results)
json.dump({"passed": sum(r["pass"] for r in results), "total": len(results), "results": results}, open(os.path.join(HERE, "evidence-local.json"), "w"), indent=1, ensure_ascii=False)
print(f"{sum(r['pass'] for r in results)}/{len(results)}"); sys.exit(0 if ok else 1)
