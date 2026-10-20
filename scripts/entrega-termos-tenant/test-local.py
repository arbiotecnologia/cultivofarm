#!/usr/bin/env python3
"""PostgreSQL descartável local. Auth/papéis sintéticos via GUC de teste: NÃO é homologação JWT/RLS real.
Cada cenário roda em BEGIN ... ROLLBACK. Prova: (1) baseline reproduz a exposição, (2) candidata fecha,
(3) regras operacionais/idempotência preservadas, (4) rollback volta aos bytes/ACL baseline."""
import subprocess, tempfile, pathlib, os, sys, json, re
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import assemble as A
H = pathlib.Path(__file__).parent
d = tempfile.mkdtemp(prefix="etten-", dir="/tmp"); os.chmod(d, 0o777); data = f"{d}/data"
PRE = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
sh = lambda *a: subprocess.run(PRE + list(a), check=True, capture_output=True, text=True)
sh("initdb", "-D", data, "-U", "postgres", "--auth=trust")
sh("pg_ctl", "-D", data, "-l", f"{d}/log", "-o", f"-k {d} -h \"\" -p 55511", "-w", "start")
def psql(sql, ok=True):
    p = subprocess.run(["psql", "-h", d, "-p", "55511", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAtX"],
                       input=sql, capture_output=True, text=True)
    if ok and p.returncode: raise SystemExit("SQL FAIL:\n" + p.stderr[-3000:])
    return p
R = []
def check(name, cond):
    R.append((name, bool(cond))); print(("PASS " if cond else "FAIL ") + name)

U = lambda c: f"{c*8}-0000-4000-8000-000000000000"
OA, OB = U("a"), U("b")
UA, UB, UF, UC, UX, UADM = (f"{p}-0000-4000-8000-000000000000" for p in ["a1a1a1a1", "b1b1b1b1", "a2a2a2a2", "a3a3a3a3", "a4a4a4a4", "b5b5b5b5"])
UO = "a6a6a6a6-0000-4000-8000-000000000000"; TX = U("3")
CA, CB = U("c"), U("d")
EA, EB, EX, EA2 = U("e"), U("f"), U("9"), U("8")
TA, TB = U("1"), U("2")

def tx(uid, sql, role="authenticated"):
    setuid = f"DO $s$BEGIN PERFORM set_config('test.sub', '{uid}', true); END$s$;\n" if uid else ""
    return psql(f"BEGIN;\nSET LOCAL ROLE {role};\n{setuid}{sql}\nROLLBACK;\n", ok=False)
def val(p): return p.stdout.strip()
def err(p): return p.stderr

try:
    psql(f"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth; CREATE SCHEMA platform_private; CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto SCHEMA extensions;
GRANT USAGE ON SCHEMA auth, extensions TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA platform_private TO authenticated;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.sub', true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','administrativo','producao','operador_onfarm','aplicador','financeiro','cliente_produtor');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean, cliente_id uuid);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE TABLE public.user_clientes(user_id uuid, cliente_id uuid, is_active boolean, revoked_at timestamptz, valid_from timestamptz, valid_until timestamptz);
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.entregas(id uuid PRIMARY KEY, organization_id uuid, cliente_id uuid, status text DEFAULT 'separado', comprovante_id uuid);
CREATE TABLE public.financial_audit_log(entity_type text, entity_id uuid, action text, new_data jsonb, performed_by uuid);
CREATE TABLE public.entrega_termos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entrega_id uuid NOT NULL, comprovante_id uuid, versao integer NOT NULL,
 template_versao text NOT NULL, status text NOT NULL, snapshot jsonb NOT NULL, snapshot_hash text NOT NULL, cobertura text NOT NULL,
 recebedor_nome text, recebedor_documento text, recebedor_cargo text, recebedor_telefone text, assinatura_hash text, assinatura_tipo text,
 assinado_em timestamptz, assinado_por uuid, assinatura_origem text, idempotency_key text, request_fingerprint text, pdf_path text, pdf_hash text,
 pdf_gerado_em timestamptz, cancelado_em timestamptz, cancelado_por uuid, motivo_cancelamento text, substitui_termo_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_at timestamptz NOT NULL DEFAULT now());
CREATE FUNCTION platform_private.platform_actor_access_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE OR REPLACE FUNCTION platform_private.h15_actor_organization()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id);
$function$;
CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_roles x WHERE x.user_id=u AND x.role=r) $$;
CREATE FUNCTION public.fn_authz_uid_scope_ok(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT auth.uid() IS NULL OR (_uid IS NOT NULL AND _uid = auth.uid()) OR public.has_role(auth.uid(), 'administrador'::app_role); $$;
CREATE OR REPLACE FUNCTION public.is_delivery_staff(_uid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.fn_authz_uid_scope_ok(_uid)
     AND (public.has_role(_uid,'administrador'::app_role)
      OR public.has_role(_uid,'gestor'::app_role)
      OR public.has_role(_uid,'administrativo'::app_role)
      OR public.has_role(_uid,'producao'::app_role)
      OR public.has_role(_uid,'operador_onfarm'::app_role)
      OR public.has_role(_uid,'aplicador'::app_role));
$function$;
CREATE FUNCTION public.is_financial_staff(_uid uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN IF NOT public.fn_authz_uid_scope_ok(_uid) THEN RETURN false; END IF;
 RETURN has_role(_uid,'administrador') OR has_role(_uid,'gestor') OR has_role(_uid,'financeiro'); END; $$;
CREATE FUNCTION public.get_cliente_ids_for_user(_user_id uuid) RETURNS uuid[] LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN public.fn_authz_uid_scope_ok(_user_id) THEN ARRAY(SELECT uc.cliente_id FROM public.user_clientes uc
    WHERE uc.user_id=_user_id AND uc.is_active AND uc.revoked_at IS NULL) ELSE ARRAY[]::uuid[] END $$;
-- stubs (md5 local substituído no preflight): exigem sessão+staff como os reais, sem tenant (como LIVE).
CREATE FUNCTION public.fn_entrega_build_snapshot_v1(p_entrega_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','extensions' AS $$
BEGIN IF auth.uid() IS NULL THEN RAISE EXCEPTION 'sessao_invalida' USING ERRCODE='42501'; END IF;
 IF NOT coalesce(public.is_delivery_staff(auth.uid()), false) THEN RAISE EXCEPTION 'sem_permissao' USING ERRCODE='42501'; END IF;
 RETURN (SELECT jsonb_build_object('entrega', to_jsonb(e), 'gerado_em', now()) FROM public.entregas e WHERE e.id=p_entrega_id); END $$;
CREATE FUNCTION public.fn_entrega_cobertura_v1(p_entrega_id uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$ SELECT 'total'::text $$;
""")
    for n in ["rpc_entrega_gerar_termo_v1", "rpc_entrega_assinar_termo_v1", "rpc_entrega_cancelar_termo_v1", "rpc_entrega_registrar_pdf_termo_v1"]:
        psql(A.B[n] + ";\n")
    # ACL baseline exatas (mesma ordem LIVE).
    acl = ""
    for s in A.SIGS3 + A.REOPENABLE:
        acl += f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC; GRANT EXECUTE ON FUNCTION {s} TO service_role; GRANT EXECUTE ON FUNCTION {s} TO authenticated;\n"
    # Contenção já aplicada em produção (termo_pdf_registration_acl_containment).
    acl += f"REVOKE ALL ON FUNCTION {A.REGISTRAR} FROM PUBLIC; GRANT EXECUTE ON FUNCTION {A.REGISTRAR} TO service_role;\n"
    for s in ["platform_private.h15_actor_organization()", "public.is_delivery_staff(uuid)", "public.is_financial_staff(uuid)",
              "public.get_cliente_ids_for_user(uuid)", "public.has_role(uuid,public.app_role)", "public.fn_authz_uid_scope_ok(uuid)",
              "platform_private.platform_actor_access_ready(uuid)"]:
        acl += f"REVOKE ALL ON FUNCTION {s} FROM PUBLIC; GRANT EXECUTE ON FUNCTION {s} TO authenticated, service_role;\n"
    psql(acl + f"""
GRANT ALL ON public.entrega_termos TO authenticated; REVOKE TRUNCATE ON public.entrega_termos FROM authenticated; GRANT ALL ON public.entrega_termos TO service_role;
GRANT SELECT ON public.entregas, public.clientes TO authenticated; GRANT ALL ON public.entregas, public.clientes, public.financial_audit_log TO service_role;
ALTER TABLE public.entrega_termos ENABLE ROW LEVEL SECURITY;
CREATE POLICY entrega_termos_select ON public.entrega_termos FOR SELECT TO authenticated USING (
 is_delivery_staff((SELECT auth.uid())) OR is_financial_staff((SELECT auth.uid())) OR EXISTS (SELECT 1 FROM entregas e
 WHERE e.id = entrega_termos.entrega_id AND e.cliente_id = ANY (get_cliente_ids_for_user((SELECT auth.uid())))));
ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;
-- Policies de entregas iguais às LIVE (operador_onfarm NÃO lê entregas diretamente).
CREATE FUNCTION platform_private.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$
 SELECT public.has_role(u, r) $$;
GRANT EXECUTE ON FUNCTION platform_private.has_role(uuid, public.app_role) TO authenticated;
CREATE POLICY "Admin/Gestor/Adm total access on entregas" ON public.entregas FOR ALL USING (platform_private.has_role((SELECT auth.uid()),'administrador')
 OR platform_private.has_role((SELECT auth.uid()),'gestor') OR platform_private.has_role((SELECT auth.uid()),'administrativo'));
CREATE POLICY "Cliente read own entregas" ON public.entregas FOR SELECT USING (cliente_id = ANY (get_cliente_ids_for_user((SELECT auth.uid()))));
CREATE POLICY "Financeiro read entregas" ON public.entregas FOR SELECT USING (platform_private.has_role((SELECT auth.uid()),'financeiro'));
CREATE POLICY "Producao/Aplicador read entregas" ON public.entregas FOR SELECT USING (platform_private.has_role((SELECT auth.uid()),'producao')
 OR platform_private.has_role((SELECT auth.uid()),'aplicador'));
CREATE POLICY tenant_isolation_d51_5 ON public.entregas AS RESTRICTIVE FOR ALL TO authenticated
 USING (organization_id IS NOT NULL AND organization_id = platform_private.h15_actor_organization())
 WITH CHECK (organization_id IS NOT NULL AND organization_id = platform_private.h15_actor_organization());
INSERT INTO public.organizations VALUES ('{OA}',true),('{OB}',true);
INSERT INTO public.profiles VALUES ('{UA}','{OA}',true,null),('{UB}','{OB}',true,null),('{UF}','{OA}',true,null),
 ('{UC}','{OA}',true,'{CA}'),('{UX}','{OA}',false,null),('{UADM}','{OB}',true,null),('{UO}','{OA}',true,null);
INSERT INTO public.user_roles VALUES ('{UA}','producao'),('{UB}','gestor'),('{UF}','financeiro'),('{UC}','cliente_produtor'),('{UX}','producao'),('{UADM}','administrador'),('{UO}','operador_onfarm');
INSERT INTO public.user_clientes VALUES ('{UC}','{CA}',true,null,null,null);
INSERT INTO public.clientes VALUES ('{CA}','{OA}'),('{CB}','{OB}');
INSERT INTO public.entregas(id,organization_id,cliente_id) VALUES ('{EA}','{OA}','{CA}'),('{EB}','{OB}','{CB}'),('{EX}','{OA}','{CB}'),('{EA2}','{OA}','{CA}');
""")
    # Termos rascunho sintéticos coerentes com o snapshot stub (gerados como o próprio staff de cada tenant, baseline).
    for uid, e, t in [(UA, EA, TA), (UB, EB, TB)]:
        p = psql(f"BEGIN; SET LOCAL ROLE authenticated; DO $s$BEGIN PERFORM set_config('test.sub','{uid}',true); END$s$;\n"
                 f"SELECT public.rpc_entrega_gerar_termo_v1('{e}')->>'termo_id'; COMMIT;")
        psql(f"UPDATE public.entrega_termos SET id='{t}' WHERE id='{p.stdout.strip()}';")

    # Termo sintético em entrega A com cliente de B (incoerência), inserido como dono.
    psql(f"INSERT INTO public.entrega_termos(id,entrega_id,versao,template_versao,status,snapshot,snapshot_hash,cobertura) VALUES ('{TX}','{EX}',1,'x','rascunho','{{}}','h','total');")
    # Fingerprints locais dos stubs (snapshot/cobertura); demais devem bater com LIVE byte a byte.
    def md5(sig): return val(psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))"))
    exact = [s for s in A.LIVE if s not in ("public.fn_entrega_build_snapshot_v1(uuid)", "public.fn_entrega_cobertura_v1(uuid)")]
    for s in exact: check(f"baseline local == LIVE md5 {s}", md5(s) == A.LIVE[s])
    local_live = {**A.LIVE, **{s: md5(s) for s in ("public.fn_entrega_build_snapshot_v1(uuid)", "public.fn_entrega_cobertura_v1(uuid)")}}
    local_qual = val(psql("SELECT qual FROM pg_policies WHERE policyname='entrega_termos_select'"))
    check("deparse local da policy == LIVE", local_qual == A.BASE_POLICY_QUAL)
    def localize(sql):
        if local_qual != A.BASE_POLICY_QUAL: sql = sql.replace(A.BASE_POLICY_QUAL, local_qual)
        for s in ("public.fn_entrega_build_snapshot_v1(uuid)", "public.fn_entrega_cobertura_v1(uuid)"):
            sql = sql.replace(A.LIVE[s], local_live[s])
        return sql
    pre, _, _, _ = A.build()
    check("preflight PASS na baseline", psql(localize(pre), ok=False).returncode == 0)

    # ---------- Baseline: reproduz a exposição (estes testes PODEM falhar) ----------
    check("BASE: staff A lê termo de B via REST", val(tx(UA, f"SELECT count(*) FROM public.entrega_termos WHERE id='{TB}';")) == "1")
    check("BASE: staff A gera termo da entrega B", tx(UA, f"SELECT public.rpc_entrega_gerar_termo_v1('{EB}');").returncode == 0)
    check("BASE: gestor B cancela termo de A", tx(UB, f"SELECT public.rpc_entrega_cancelar_termo_v1('{TA}','motivo teste');").returncode == 0)
    check("BASE contida: authenticated NÃO registra PDF", "permission denied" in err(tx(UA, f"SELECT public.rpc_entrega_registrar_pdf_termo_v1('{TB}','x','y');")))
    check("BASE contida: authenticated NÃO faz TRUNCATE", "permission denied" in err(tx(UA, "TRUNCATE public.entrega_termos;")))
    check("BASE: operador_onfarm lê termo de B", val(tx(UO, f"SELECT count(*) FROM public.entrega_termos WHERE id='{TB}';")) == "1")
    check("BASE: snapshot direto cross-tenant", tx(UA, f"SELECT public.fn_entrega_build_snapshot_v1('{EB}');").returncode == 0)

    # ---------- Aplica candidata (pré + corpo; postflight calculado) ----------
    _, cand, _, _ = A.build()
    psql(localize(cand))
    post = {"platform_private.entrega_termo_tenant_ok(uuid)": md5("platform_private.entrega_termo_tenant_ok(uuid)"),
            **{s: md5(s) for s in A.SIGS3}}
    (H / "post-hashes.json").write_text(json.dumps(post, indent=2) + "\n")
    _, cand2, postsql, rb = A.build(post_md5=post)
    pf = psql(localize(postsql), ok=False); print(pf.stderr[-400:]) if pf.returncode else None
    check("postflight PASS após candidata", pf.returncode == 0)
    check("preflight agora FALHA (não reaplicável)", psql(localize(pre), ok=False).returncode != 0)
    check("candidata reaplicada FALHA fechado no preflight", psql(localize(cand2), ok=False).returncode != 0)

    # ---------- Candidata: isolamento ----------
    check("REST: staff A NÃO lê termo de B", val(tx(UA, f"SELECT count(*) FROM public.entrega_termos WHERE id='{TB}';")) == "0")
    check("REST: staff A lê termo de A", val(tx(UA, f"SELECT count(*) FROM public.entrega_termos WHERE id='{TA}';")) == "1")
    check("REST: financeiro A lê A e não B", val(tx(UF, "SELECT string_agg(id::text, ',') FROM public.entrega_termos;")) == TA)
    check("REST: cliente/produtor A vinculado lê termo do seu cliente", val(tx(UC, "SELECT string_agg(id::text, ',') FROM public.entrega_termos;")) == TA)
    check("REST: admin B (escopo admin) não lê termo de A", val(tx(UADM, f"SELECT count(*) FROM public.entrega_termos WHERE id='{TA}';")) == "0")
    check("REST: operador_onfarm A lê termo de A (sem SELECT em entregas)", val(tx(UO, "SELECT string_agg(id::text, ',') FROM public.entrega_termos;")) == TA)
    check("REST: operador_onfarm A não lê entregas diretamente (RLS LIVE)", val(tx(UO, "SELECT count(*) FROM public.entregas;")) == "0")
    check("REST: staff A não lê termo de entrega A/cliente B", val(tx(UA, f"SELECT count(*) FROM public.entrega_termos WHERE id='{TX}';")) == "0")
    check("REST: admin A não lê termo de entrega A/cliente B", val(psql(f"BEGIN; UPDATE public.profiles SET organization_id='{OA}' WHERE user_id='{UADM}'; SET LOCAL ROLE authenticated;"
          f" DO $s$BEGIN PERFORM set_config('test.sub','{UADM}',true); END$s$; SELECT count(*) FROM public.entrega_termos WHERE id IN ('{TX}','{TA}'); ROLLBACK;", ok=False)) == "1")
    check("REST: perfil inativo não lê nada", val(tx(UX, "SELECT count(*) FROM public.entrega_termos;")) == "0")
    check("REST: anon sem acesso", tx(None, "SELECT count(*) FROM public.entrega_termos;", role="anon").returncode != 0)
    p = tx(UA, "TRUNCATE public.entrega_termos;"); check("TRUNCATE authenticated negado", p.returncode != 0 and "permission denied" in err(p))
    p = tx(UA, f"INSERT INTO public.entrega_termos(entrega_id,versao,template_versao,status,snapshot,snapshot_hash,cobertura) VALUES ('{EA}',9,'x','rascunho','{{}}','h','total');")
    check("INSERT direto authenticated negado por RLS", p.returncode != 0)
    p = tx(UA, f"UPDATE public.entrega_termos SET status='assinado' WHERE id='{TA}' RETURNING id;")
    check("UPDATE direto authenticated não altera linhas", p.returncode == 0 and val(p) == "")

    p = tx(UA, f"SELECT public.rpc_entrega_gerar_termo_v1('{EB}');"); check("gerar: A em entrega B → sem_permissao", "sem_permissao" in err(p))
    p = tx(UA, f"SELECT public.rpc_entrega_gerar_termo_v1('{EX}');"); check("gerar: entrega A com cliente de B → sem_permissao", "sem_permissao" in err(p))
    p = tx(UA, f"SELECT public.rpc_entrega_gerar_termo_v1('{U('7')}');"); check("gerar: entrega inexistente → sem_permissao (sem oráculo)", "sem_permissao" in err(p))
    p = tx(UX, f"SELECT public.rpc_entrega_gerar_termo_v1('{EA}');"); check("gerar: perfil inativo → sem_permissao", "sem_permissao" in err(p))
    p = tx(UA, f"UPDATE public.organizations SET ativo=false WHERE id='{OA}';", role="postgres")
    p = psql(f"BEGIN; UPDATE public.organizations SET ativo=false WHERE id='{OA}'; SET LOCAL ROLE authenticated;"
             f" DO $s$BEGIN PERFORM set_config('test.sub','{UA}',true); END$s$; SELECT public.rpc_entrega_gerar_termo_v1('{EA}'); ROLLBACK;", ok=False)
    check("gerar: empresa inativa → sem_permissao", "sem_permissao" in err(p))
    p = tx(UA, f"SELECT (public.rpc_entrega_gerar_termo_v1('{EA}')->>'termo_id') = '{TA}', (public.rpc_entrega_gerar_termo_v1('{EA}')->>'termo_id') = '{TA}';")
    check("gerar: A em entrega A atualiza o MESMO rascunho (idempotente)", val(p) == "t|t")
    p = tx(UA, f"SELECT (public.rpc_entrega_gerar_termo_v1('{EA2}')->>'versao');"); check("gerar: nova entrega A cria v1", val(p) == "1")
    p = tx(UF, f"SELECT public.rpc_entrega_gerar_termo_v1('{EA}');"); check("gerar: financeiro (não staff entrega) → sem_permissao", "sem_permissao" in err(p))

    sig = """'{"recebedor_nome":"R","assinatura_hash":"h1"}'::jsonb"""
    p = tx(UA, f"SELECT public.rpc_entrega_assinar_termo_v1('{TB}', {sig}, 'k1');")
    check("assinar: A em termo B → termo_nao_encontrado", "termo_nao_encontrado" in err(p))
    p = tx(UA, f"SELECT public.rpc_entrega_assinar_termo_v1('{TA}', {sig}, 'k1')->>'replay', public.rpc_entrega_assinar_termo_v1('{TA}', {sig}, 'k1')->>'replay';")
    check("assinar: A em termo A assina e replay idêntico", val(p) == "false|true")
    p = tx(UA, f"SELECT public.rpc_entrega_assinar_termo_v1('{TA}', {sig}, 'k1'); SELECT public.rpc_entrega_assinar_termo_v1('{TA}', '{{\"recebedor_nome\":\"Outro\",\"assinatura_hash\":\"h1\"}}'::jsonb, 'k1');")
    check("assinar: replay divergente → idempotency_payload_mismatch", "idempotency_payload_mismatch" in err(p))
    p = tx(UA, f"SELECT public.rpc_entrega_assinar_termo_v1('{TA}', {sig}, 'k1'); SELECT public.rpc_entrega_assinar_termo_v1('{TA}', {sig}, 'k2');")
    check("assinar: segunda chave → termo_ja_assinado", "termo_ja_assinado" in err(p))
    p = tx(UA, f"SELECT public.rpc_entrega_assinar_termo_v1('{TA}', {sig}, 'k1'); RESET ROLE; SELECT count(*) FROM public.financial_audit_log WHERE action='DELIVERY_TERM_SIGNED';")
    check("assinar: auditoria registrada uma vez", val(p).splitlines()[-1] == "1")
    p = tx(UX, f"SELECT public.rpc_entrega_assinar_termo_v1('{TA}', {sig}, 'k1');"); check("assinar: perfil inativo → termo_nao_encontrado", "termo_nao_encontrado" in err(p))

    p = tx(UB, f"SELECT public.rpc_entrega_cancelar_termo_v1('{TA}','motivo teste');"); check("cancelar: gestor B em termo A → termo_nao_encontrado", "termo_nao_encontrado" in err(p))
    p = tx(UADM, f"SELECT public.rpc_entrega_cancelar_termo_v1('{TA}','motivo teste');"); check("cancelar: administrador B em termo A → negado", "termo_nao_encontrado" in err(p))
    p = tx(UADM, f"SELECT public.rpc_entrega_cancelar_termo_v1('{TB}','motivo teste')->>'status';"); check("cancelar: administrador B em termo B → cancelado", val(p) == "cancelado")
    p = tx(UA, f"SELECT public.rpc_entrega_cancelar_termo_v1('{TA}','motivo teste');"); check("cancelar: produção sem papel → sem_permissao (regra preservada)", "sem_permissao" in err(p))

    p = tx(UA, f"SELECT public.rpc_entrega_registrar_pdf_termo_v1('{TA}','x','y');"); check("registrar PDF: authenticated → permission denied", "permission denied" in err(p))
    p = tx(UA, f"SELECT public.fn_entrega_build_snapshot_v1('{EB}');"); check("snapshot direto: authenticated → permission denied", "permission denied" in err(p))
    p = tx(UA, f"SELECT public.fn_entrega_cobertura_v1('{EB}');"); check("cobertura direta: authenticated → permission denied", "permission denied" in err(p))
    p = tx(UA, f"SELECT platform_private.entrega_termo_tenant_ok('{EA}'), platform_private.entrega_termo_tenant_ok('{EB}'),"
              f" platform_private.entrega_termo_tenant_ok('{EX}'), platform_private.entrega_termo_tenant_ok('{U('7')}');")
    check("helper: só boolean do próprio escopo (A=t, B/incoerente/inexistente=f, sem oráculo)", val(p) == "t|f|f|f")
    check("helper: anon sem EXECUTE", "permission denied" in err(tx(None, f"SELECT platform_private.entrega_termo_tenant_ok('{EA}');", role="anon")))
    p = tx(UO, f"SELECT public.rpc_entrega_gerar_termo_v1('{EX}');"); check("gerar: operador A em entrega A/cliente B → sem_permissao", "sem_permissao" in err(p))
    p = psql(f"BEGIN; UPDATE public.entrega_termos SET status='assinado' WHERE id='{TA}'; SET LOCAL ROLE service_role;"
             f" SELECT public.rpc_entrega_registrar_pdf_termo_v1('{TA}','p','h')->>'replay'; ROLLBACK;", ok=False)
    check("registrar PDF: service_role continua funcionando", val(p) == "false")

    # ---------- Rollback ----------
    rbp = psql(localize(rb), ok=False); print(rbp.stderr[-400:]) if rbp.returncode else None
    check("rollback PASS (pré/pós internos)", rbp.returncode == 0)
    for s in exact: check(f"rollback restaura md5 LIVE {s}", md5(s) == A.LIVE[s])
    check("após rollback, preflight volta a PASS", psql(localize(pre), ok=False).returncode == 0)
    check("após rollback, exposição baseline volta (reversível)", val(tx(UA, f"SELECT count(*) FROM public.entrega_termos WHERE id='{TB}';")) == "1")
    p = tx(UA, f"SELECT public.rpc_entrega_registrar_pdf_termo_v1('{TA}','x','y');"); check("após rollback, registrar continua negado a authenticated", "permission denied" in err(p))
    p = tx(UA, "TRUNCATE public.entrega_termos;"); check("após rollback, TRUNCATE continua negado a authenticated", "permission denied" in err(p))
    check("após rollback, service_role mantém EXECUTE do registrar", val(psql(f"SELECT has_function_privilege('service_role','{A.REGISTRAR}','EXECUTE')")) == "t")
    check("rollback repetido FALHA fechado", psql(localize(rb), ok=False).returncode != 0)
    # reaplica para provar ciclo apply→rollback→apply
    check("reaplicação após rollback PASS", psql(localize(cand2), ok=False).returncode == 0)
finally:
    subprocess.run(PRE + ["pg_ctl", "-D", data, "-m", "immediate", "stop"], capture_output=True)
ok = sum(c for _, c in R); print(f"{ok}/{len(R)}")
(H / "real-test-results.json").write_text(json.dumps({"kind": "local-synthetic-postgres17", "not": "JWT/RLS hosted homologation",
                                                       "results": [{"name": n, "pass": c} for n, c in R]}, indent=1, ensure_ascii=False) + "\n")
sys.exit(0 if ok == len(R) else 1)
