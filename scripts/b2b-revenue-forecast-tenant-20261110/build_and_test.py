#!/usr/bin/env python3
"""Gera PRE/INSTALL/POST/ROLLBACK do leitor tenant e testa em PostgreSQL descartável (costuras sintéticas declaradas)."""
import hashlib, json, os, re, shutil, subprocess, sys, tempfile, time
HERE = os.path.dirname(os.path.abspath(__file__))
REF = 'swzpzcwiasxmjutrmvkm'
SIG = 'public.rpc_b2b_revenue_forecast_tenant_v1(uuid)'
LEGACY = 'public.rpc_b2b_revenue_forecast(uuid)'
SRC14 = os.path.join(HERE, '../b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge-current-20261109/forecast-pre-nf-20261109/14-install-projection-reader.sql.review')
ACL = ("(SELECT coalesce(string_agg(CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END||':'||x.privilege_type||':'||x.grantor::regrole::text||':'||CASE WHEN x.is_grantable THEN 'G' ELSE '-' END,',' ORDER BY 1),'') "
       "FROM (SELECT * FROM pg_proc pp, aclexplode(coalesce(pp.proacl,acldefault('f',pp.proowner))) WHERE pp.oid='{s}'::regprocedure) x)")
ACL = ACL.replace("ORDER BY 1", "ORDER BY CASE WHEN x.grantee=0 THEN 'PUBLIC' ELSE x.grantee::regrole::text END||':'||x.privilege_type")
def sha(b): return hashlib.sha256(b).hexdigest()

def pins():
    txt = open(SRC14).read(); out = {}
    for s in ['public._saas_user_has_feature(uuid,text)', 'public.h15_actor_organization()', 'public.is_financial_staff(uuid)']:
        m = re.search(re.escape(f"md5(pg_get_functiondef('{s}'::regprocedure))<>'") + r"([0-9a-f]{32})'.*?\)\)<>'([^']*)' THEN", txt)
        out[s] = {'md5': m.group(1), 'acl': m.group(2)}
    return out

def pre_sql(p):
    lines = [f"-- READONLY PRE. project_ref {REF}. Origem pins: captura LIVE já reproduzida em 13/14 (estágio projeção instalado). Falha fechado.", "BEGIN READ ONLY;", "DO $$ BEGIN"]
    for s, v in p.items():
        lines.append(f" IF to_regprocedure('{s}') IS NULL OR md5(pg_get_functiondef('{s}'::regprocedure))<>'{v['md5']}' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{s}'::regprocedure)<>'postgres' OR {ACL.format(s=s)}<>'{v['acl']}' THEN RAISE EXCEPTION 'REVENUE_TENANT_PRE_DEP_DRIFT: {s}'; END IF;")
    lines += [f" IF to_regprocedure('{SIG}') IS NOT NULL THEN RAISE EXCEPTION 'REVENUE_TENANT_PRE_TARGET_PREEXISTS'; END IF;",
              " IF to_regclass('platform_private.b2b_financial_forecasts') IS NULL THEN RAISE EXCEPTION 'REVENUE_TENANT_PRE_FORECAST_ABSENT'; END IF;",
              "END $$;", "ROLLBACK;"]
    return "\n".join(lines) + "\n"

def install_sql(body):
    return (f"-- REVIEW_ONLY_INACTIVE_NOT_APPROVED. project_ref {REF}. Ordem: 01-pre -> 02-install -> 03-post; rollback 04 (deny-only).\n"
            f"-- Não altera {LEGACY} (corpo/ACL legados intocados, sem regrant).\nBEGIN;\n"
            f"DO $$ BEGIN IF to_regprocedure('{SIG}') IS NOT NULL THEN RAISE EXCEPTION 'REVENUE_TENANT_TARGET_PREEXISTS'; END IF;\n"
            " IF to_regclass('platform_private.b2b_financial_forecasts') IS NULL THEN RAISE EXCEPTION 'REVENUE_TENANT_FORECAST_ABSENT'; END IF; END $$;\n"
            + body +
            f"\nREVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,service_role;\nGRANT EXECUTE ON FUNCTION {SIG} TO authenticated;\nCOMMIT;\n")

def post_sql(md5):
    return (f"-- READONLY POST. project_ref {REF}.\nBEGIN READ ONLY;\nDO $$ BEGIN\n"
            f" IF to_regprocedure('{SIG}') IS NULL OR md5(pg_get_functiondef('{SIG}'::regprocedure))<>'{md5}' OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid='{SIG}'::regprocedure)<>'postgres' OR {ACL.format(s=SIG)}<>'authenticated:EXECUTE:postgres:-,postgres:EXECUTE:postgres:-' THEN RAISE EXCEPTION 'REVENUE_TENANT_POST_DRIFT'; END IF;\n"
            f" IF (SELECT prosecdef FROM pg_proc WHERE oid='{SIG}'::regprocedure) IS NOT TRUE OR NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid='{SIG}'::regprocedure AND proconfig @> ARRAY['search_path=\"\"']) THEN RAISE EXCEPTION 'REVENUE_TENANT_POST_DEFINER'; END IF;\n"
            "END $$;\nROLLBACK;\n")

def rollback_sql(md5):
    return (f"-- REVIEW_ONLY deny-only rollback. project_ref {REF}. Mantém corpo; revoga apenas EXECUTE do cliente (UI volta a 'indisponível').\nBEGIN;\n"
            f"DO $$ BEGIN IF to_regprocedure('{SIG}') IS NULL OR md5(pg_get_functiondef('{SIG}'::regprocedure))<>'{md5}' THEN RAISE EXCEPTION 'REVENUE_TENANT_ROLLBACK_TARGET_DRIFT'; END IF; END $$;\n"
            f"REVOKE ALL ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n")

STUBS = r"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
-- COSTURA SINTÉTICA: auth.uid via GUC local; não prova JWT hospedado.
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
CREATE TABLE public.t_actor(uid uuid PRIMARY KEY, org uuid, fin boolean, feats text[]);
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT org FROM public.t_actor WHERE uid=auth.uid() $$;
CREATE FUNCTION public.is_financial_staff(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT coalesce((SELECT fin FROM public.t_actor WHERE uid=u),false) $$;
CREATE FUNCTION public._saas_user_has_feature(u uuid, f text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT coalesce((SELECT f = ANY(feats) FROM public.t_actor WHERE uid=u),false) $$;
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY, partner_id uuid, status text);
CREATE TABLE public.accounts_receivable(id uuid PRIMARY KEY, partner_id uuid, origin_type text, origin_id uuid, status text);
CREATE TABLE public.accounts_receivable_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receivable_id uuid, due_date date, net_amount numeric, received_amount numeric, status text);
CREATE TABLE platform_private.b2b_financial_forecasts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid UNIQUE, organization_id uuid, partner_id uuid, total_amount numeric, residual_amount numeric, state text);
REVOKE ALL ON SCHEMA platform_private FROM PUBLIC;
GRANT USAGE ON SCHEMA public, auth TO authenticated;
-- Legado (stub) para provar que não é tocado.
CREATE FUNCTION public.rpc_b2b_revenue_forecast(p_partner_id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT '{}'::jsonb $$;
REVOKE ALL ON FUNCTION public.rpc_b2b_revenue_forecast(uuid) FROM PUBLIC;
"""
A,F = '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000f1'
U = {k:f'00000000-0000-0000-0000-00000000{n:04d}' for k,n in [('arbio_fin',1),('arbio_gestor',2),('arbio_sem_papel',3),('arbio_sem_feature',4),('fsf_fin',5)]}
PA,PF = '00000000-0000-0000-0000-0000000000aa','00000000-0000-0000-0000-0000000000ff'
O = {k:f'00000000-0000-0000-0000-0000000001{n:02d}' for k,n in [('partial',1),('full_open',2),('cancel',3),('legacy',4),('fsf',5),('paid',6)]}
SEED = f"""
INSERT INTO public.t_actor VALUES ('{U['arbio_fin']}','{A}',true,ARRAY['contas_receber','pedidos_b2b']),('{U['arbio_gestor']}','{A}',true,ARRAY['contas_receber','pedidos_b2b']),
 ('{U['arbio_sem_papel']}','{A}',false,ARRAY['contas_receber','pedidos_b2b']),('{U['arbio_sem_feature']}','{A}',true,ARRAY['pedidos_b2b']),('{U['fsf_fin']}','{F}',true,ARRAY['contas_receber','pedidos_b2b']);
INSERT INTO public.partner_accounts VALUES ('{PA}','{A}'),('{PF}','{F}');
INSERT INTO public.partner_orders VALUES ('{O['partial']}','{PA}','entregue'),('{O['full_open']}','{PA}','aprovado'),('{O['cancel']}','{PA}','aprovado'),('{O['legacy']}','{PA}','aprovado'),('{O['fsf']}','{PF}','aprovado'),('{O['paid']}','{PA}','entregue');
-- parcial: total 18, NF parcial 9 -> residual 9 + título 9 (sem dupla contagem)
INSERT INTO platform_private.b2b_financial_forecasts(order_id,organization_id,partner_id,total_amount,residual_amount,state) VALUES
 ('{O['partial']}','{A}','{PA}',18,9,'faturado_parcial'),('{O['full_open']}','{A}','{PA}',18,18,'aguardando_fiscal'),
 ('{O['cancel']}','{A}','{PA}',18,0,'cancelado_residual'),('{O['fsf']}','{F}','{PF}',500,500,'aguardando_fiscal'),('{O['paid']}','{A}','{PA}',9,0,'faturado_total');
INSERT INTO public.accounts_receivable VALUES ('00000000-0000-0000-0000-000000000201','{PA}','B2B_ORDER','{O['partial']}','OPEN'),
 ('00000000-0000-0000-0000-000000000202','{PA}','B2B_ORDER','{O['cancel']}','CANCELED'),('00000000-0000-0000-0000-000000000203','{PF}','B2B_ORDER','{O['fsf']}','OPEN'),
 ('00000000-0000-0000-0000-000000000204','{PA}','B2B_ORDER','{O['paid']}','PAID');
INSERT INTO public.accounts_receivable_installments(receivable_id,due_date,net_amount,received_amount,status) VALUES
 ('00000000-0000-0000-0000-000000000201',current_date+10,4.5,0,'OPEN'),('00000000-0000-0000-0000-000000000201',current_date+40,4.5,0,'OPEN'),
 ('00000000-0000-0000-0000-000000000202',current_date+10,9,0,'CANCELED'),('00000000-0000-0000-0000-000000000203',current_date+10,700,0,'OPEN'),
 ('00000000-0000-0000-0000-000000000204',current_date+10,9,9,'PAID');
"""

def main():
    body = open(os.path.join(HERE,'reader.sql')).read()
    p = pins()
    files = {'01-pre.sql.readonly': pre_sql(p), '02-install.sql.review': install_sql(body)}
    tmp = tempfile.mkdtemp(prefix='rf-tenant-'); data = os.path.join(tmp,'d'); port = '55493'
    run = lambda *a, **k: subprocess.run(list(a), capture_output=True, text=True, **k)
    if os.geteuid()==0:
        shutil.chown(tmp,'postgres') if run('id','postgres').returncode==0 else None
    pre = ['su','postgres','-c'] if os.geteuid()==0 and run('id','postgres').returncode==0 else None
    def sh(cmd): return run(*(pre+[cmd])) if pre else run('bash','-c',cmd)
    r = sh(f"initdb -D {data} -U postgres -A trust >/dev/null && pg_ctl -D {data} -o '-p {port} -k {tmp}' -l {tmp}/log start -w >/dev/null"); assert r.returncode==0, r.stderr
    ev = {'checks': [], 'limits': 'PostgreSQL descartável; auth.uid/h15/is_financial_staff/_saas_user_has_feature e tabelas são STUBS sintéticos. Não prova JWT/RLS/Storage hospedado nem os corpos LIVE.'}
    def psql(sql, uid=None, role=None, on_error_stop=True):
        pfx = (f"SET test.uid='{uid}';" if uid else '') + (f"SET ROLE {role};" if role else '')
        return run('psql','-h',tmp,'-p',port,'-U','postgres','-d','postgres','-X','-q','-t','-A','-v',f'ON_ERROR_STOP={1 if on_error_stop else 0}','-c',pfx+sql)
    def fpsql(path): return run('psql','-h',tmp,'-p',port,'-U','postgres','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1','-f',path)
    def check(name, ok, detail=''):
        ev['checks'].append({'name':name,'pass':bool(ok),'detail':detail}); print(('PASS ' if ok else 'FAIL ')+name, detail)
    try:
        r = psql(STUBS+SEED); assert r.returncode==0, r.stderr
        legacy_before = psql(f"SELECT md5(pg_get_functiondef('{LEGACY}'::regprocedure))||'|'||coalesce(proacl::text,'') FROM pg_proc WHERE oid='{LEGACY}'::regprocedure").stdout.strip()
        tdir = os.path.join(tmp,'f'); os.makedirs(tdir); 
        for k,v in files.items(): open(os.path.join(tdir,k),'w').write(v)
        r = fpsql(os.path.join(tdir,'01-pre.sql.readonly')); check('PRE falha fechado contra stubs (deps divergentes)', r.returncode!=0 and 'REVENUE_TENANT_PRE_DEP_DRIFT' in r.stderr, r.stderr.strip().splitlines()[-1] if r.stderr else '')
        r = fpsql(os.path.join(tdir,'02-install.sql.review')); check('INSTALL aplica arquivo exato', r.returncode==0, r.stderr.strip())
        md5 = psql(f"SELECT md5(pg_get_functiondef('{SIG}'::regprocedure))").stdout.strip()
        files['03-post.sql.readonly'] = post_sql(md5); files['04-rollback-deny.sql.review'] = rollback_sql(md5)
        for k in ('03-post.sql.readonly','04-rollback-deny.sql.review'): open(os.path.join(tdir,k),'w').write(files[k])
        r = fpsql(os.path.join(tdir,'03-post.sql.readonly')); check('POST corpo/owner/ACL/definer', r.returncode==0, r.stderr.strip())
        r = fpsql(os.path.join(tdir,'02-install.sql.review')); check('INSTALL rerun aborta', r.returncode!=0 and 'PREEXISTS' in r.stderr)
        def call(uid, arg='NULL'):
            r = psql(f"SELECT public.rpc_b2b_revenue_forecast_tenant_v1({arg})", uid=uid, role='authenticated', on_error_stop=False)
            return (json.loads(r.stdout.strip()) if r.stdout.strip() else None), r.stderr.strip()
        d,e = call(U['arbio_fin'])
        check('ARBio financeiro: residual 27 (parcial 9 + aberto 18), cancelado/total fora', d and float(d['forecast_residual']['amount'])==27 and d['forecast_residual']['orders']==2 and d['forecast_residual']['enforceable'] is False, json.dumps(d))
        check('ARBio títulos: 9 aberto (4,5 até30 + 4,5 até60), cancelado e pago excluídos, FSF 700 fora', d and float(d['confirmed_titles']['total_aberto'])==9 and float(d['confirmed_titles']['ate_30'])==4.5 and float(d['confirmed_titles']['ate_60'])==4.5)
        check('Parcial sem dupla contagem: residual 9 + título 9 = 18 do pedido', d and float(d['forecast_residual']['amount'])-18+float(d['confirmed_titles']['total_aberto'])==18)
        check('Legado sem previsão/título só contagem (1), sem valor', d and d['legacy_unproven_orders']==1)
        d2,_ = call(U['arbio_gestor']); check('Gestor ARBio (is_financial_staff canônico) positivo igual', d2 == d)
        d,e = call(U['fsf_fin']); check('FSF isolada: residual 500, título 700, sem ARBio', d and float(d['forecast_residual']['amount'])==500 and float(d['confirmed_titles']['total_aberto'])==700 and d['legacy_unproven_orders']==0)
        for k in ('arbio_sem_papel','arbio_sem_feature'):
            d,e = call(U[k]); check(f'{k} negado 42501', d is None and 'B2B_REVENUE_FORECAST_DENIED' in e)
        d,e = call(None); check('sem auth.uid negado', d is None and 'DENIED' in e)
        d,e = call(U['arbio_fin'], f"'{PF}'"); check('ARBio filtrando parceiro FSF negado sem vazar', d is None and 'DENIED' in e)
        d,e = call(U['arbio_fin'], f"'{PA}'"); check('Filtro parceiro próprio positivo', d and float(d['forecast_residual']['amount'])==27)
        psql(f"UPDATE public.t_actor SET feats=ARRAY['pedidos_b2b'] WHERE uid='{U['arbio_fin']}'")
        d,e = call(U['arbio_fin']); check('Revogação de feature contas_receber negada na chamada seguinte', d is None and 'DENIED' in e)
        psql(f"UPDATE public.t_actor SET feats=ARRAY['contas_receber','pedidos_b2b'] WHERE uid='{U['arbio_fin']}'")
        psql("UPDATE public.accounts_receivable_installments SET received_amount=net_amount,status='PAID' WHERE receivable_id='00000000-0000-0000-0000-000000000201'")
        d,e = call(U['arbio_fin']); check('Pagamento 9 zera título aberto sem alterar residual', d and float(d['confirmed_titles']['total_aberto'])==0 and float(d['forecast_residual']['amount'])==27)
        psql(f"UPDATE platform_private.b2b_financial_forecasts SET residual_amount=0,state='cancelado_residual' WHERE order_id='{O['partial']}'")
        d,e = call(U['arbio_fin']); check('Cancelamento do residual remove 9 da previsão', d and float(d['forecast_residual']['amount'])==18)
        r = psql("SELECT count(*) FROM platform_private.b2b_financial_forecasts", role='authenticated', on_error_stop=False); check('authenticated sem acesso direto à tabela privada', r.returncode!=0 and 'permission denied' in r.stderr)
        r = psql(f"SELECT public.rpc_b2b_revenue_forecast_tenant_v1(NULL)", uid=U['arbio_fin'], role='anon', on_error_stop=False); check('anon sem EXECUTE', 'permission denied' in r.stderr)
        r = fpsql(os.path.join(tdir,'04-rollback-deny.sql.review')); check('ROLLBACK deny-only aplica', r.returncode==0, r.stderr.strip())
        d,e = call(U['arbio_fin']); check('Após rollback authenticated negado (permission denied)', d is None and 'permission denied' in e)
        check('Corpo mantido após rollback', psql(f"SELECT md5(pg_get_functiondef('{SIG}'::regprocedure))").stdout.strip()==md5)
        legacy_after = psql(f"SELECT md5(pg_get_functiondef('{LEGACY}'::regprocedure))||'|'||coalesce(proacl::text,'') FROM pg_proc WHERE oid='{LEGACY}'::regprocedure").stdout.strip()
        check('Legado rpc_b2b_revenue_forecast corpo/ACL intocados', legacy_before==legacy_after, legacy_after)
        ev['reader_md5']=md5; ev['pg_version']=psql('SHOW server_version').stdout.strip()
    finally:
        sh(f"pg_ctl -D {data} stop -m fast >/dev/null")
    for k,v in files.items(): open(os.path.join(HERE,k),'w').write(v)
    ev['file_sha256'] = {k: sha(open(os.path.join(HERE,k),'rb').read()) for k in sorted(files)+['reader.sql']}
    ev['passed']=sum(c['pass'] for c in ev['checks']); ev['total']=len(ev['checks'])
    os.makedirs(os.path.join(HERE,'evidence'),exist_ok=True)
    json.dump(ev, open(os.path.join(HERE,'evidence','disposable-pg-run.json'),'w'), indent=1, ensure_ascii=False)
    print(f"{ev['passed']}/{ev['total']}"); sys.exit(0 if ev['passed']==ev['total'] else 1)
main()
