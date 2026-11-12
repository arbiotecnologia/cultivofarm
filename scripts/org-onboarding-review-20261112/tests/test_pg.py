#!/usr/bin/env python3
"""PostgreSQL 17 descartável: corpos LIVE capturados + pacote. Auth por claims SQL sintéticas e
session_user=authenticator (aciona o guard real de organizations). Não prova JWT/PostgREST/Edge hospedados."""
import json, os, pathlib, shutil, subprocess, sys, tempfile, uuid
H = pathlib.Path(__file__).resolve().parent.parent
cap = json.load(open(H/'live-capture/capture.json'))
D = tempfile.mkdtemp(prefix='orgrev-'); PORT = '55491'
env = dict(os.environ, PGHOST=D, PGPORT=PORT, PGUSER='postgres', PGDATABASE='postgres')
subprocess.run(['initdb','-D',D+'/data','-U','postgres','-A','trust'],check=True,capture_output=True)
subprocess.run(['pg_ctl','-D',D+'/data','-o',f'-k {D} -p {PORT} -c listen_addresses=',"-w",'start','-l',D+'/log'],check=True,capture_output=True)
RES=[]
def psql(sql, ok=True):
    r = subprocess.run(['psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-c',sql] if '\n' not in sql and len(sql)<2000 else ['psql','-X','-q','-At','-v','ON_ERROR_STOP=1','-f','-'],
                       input=None if ('\n' not in sql and len(sql)<2000) else sql, env=env, capture_output=True, text=True)
    if ok and r.returncode: raise SystemExit(f'SETUP FAIL: {r.stderr[:2000]}')
    return r
def actor(uid, sql, role='authenticated'):
    claims = json.dumps({'sub': str(uid) if uid else '', 'role': role})
    pre = f"SET SESSION AUTHORIZATION authenticator; SET ROLE {role}; SELECT set_config('request.jwt.claims', '{claims}', false);"
    r = subprocess.run(['psql','-X','-q','-At','-f','-'], input=pre+'\n'+sql, env=env, capture_output=True, text=True)
    out = '\n'.join(l for l in r.stdout.splitlines() if l and not l.startswith('{"sub"'))
    return (r.returncode == 0 and 'ERROR' not in r.stderr), out.strip(), r.stderr.strip()
def check(name, cond, detail=''):
    RES.append({'check': name, 'pass': bool(cond), 'detail': detail[:300]}); print(('PASS ' if cond else 'FAIL ')+name, '' if cond else detail[:300])
def cnpj(base12):
    def dv(n):
        w = [5,4,3,2,9,8,7,6,5,4,3,2] if len(n)==12 else [6,5,4,3,2,9,8,7,6,5,4,3,2]
        s = sum(int(a)*b for a,b in zip(n,w)) % 11; return '0' if s<2 else str(11-s)
    n = base12; n += dv(n); n += dv(n); return n
try:
    psql((H/'tests/fixture_schema.sql').read_text())
    for f in cap['priv']:
        if 'h15_actor' in f['sig'] or 'has_role' in f['sig'] or 'cnpj_' in f['sig'] or 'onboarding_validar' in f['sig'] or 'issue_ticket' in f['sig']:
            psql(f['def'])
    psql("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform_private TO authenticated;")
    for t in cap['org_triggers']:
        if 'organizations_guard_status' in t['d']: psql(t['fdef']); psql(t['d'])
    for f in cap['funcs']: psql(f['def'])
    for f in cap['funcs']:
        psql(f"REVOKE ALL ON FUNCTION public.{f['sig']} FROM PUBLIC;")
        if 'authenticated=X' in (f['acl'] or ''): psql(f"GRANT EXECUTE ON FUNCTION public.{f['sig']} TO authenticated;")
        if 'service_role=X' in (f['acl'] or ''): psql(f"GRANT EXECUTE ON FUNCTION public.{f['sig']} TO service_role;")
    md5_ok = all(psql(f"SELECT md5(pg_get_functiondef('public.{f['sig']}'::regprocedure))").stdout.strip()==f['md5'] for f in cap['funcs'])
    check('captured bodies reproduce LIVE md5 locally', md5_ok)
    U = {k: uuid.uuid4() for k in ['superA','superB','adminHom','gestorHom','adminM','gestorM','adminV','adminD','adminS','adminAtiva','adminPre','consultorM']}
    O = {'hom':'442444d9-263f-45d9-a991-a679498d06c3', 'M':str(uuid.uuid4()),'V':str(uuid.uuid4()),'D':str(uuid.uuid4()),'S':str(uuid.uuid4()),'ativa':str(uuid.uuid4()),'pre':str(uuid.uuid4()),'plat':str(uuid.uuid4())}
    C = {'M':cnpj('112223330001'),'V':cnpj('445556660001'),'D':cnpj('778889990001'),'S':cnpj('123123120001'),'pre':cnpj('321321320001'),'ativa':cnpj('987987980001')}
    rows = [f"('{O['hom']}','Homologação CultivoFarm 20261001','ativa','98761243000147','98761243000147')",
            f"('{O['ativa']}','Empresa Ativa Fictícia','ativa','{C['ativa']}','{C['ativa']}')",
            f"('{O['plat']}','Plataforma','ativa',null,null)"]
    for k in ['M','V','D','S','pre']: rows.append(f"('{O[k]}','Emitente Fictício {k}','onboarding','{C[k]}',null)")
    psql("INSERT INTO public.organizations(id,nome,status,cnpj,cnpj_normalizado) VALUES " + ','.join(rows))
    prof = [('superA','plat'),('superB','plat'),('adminHom','hom'),('gestorHom','hom'),('adminM','M'),('gestorM','M'),('consultorM','M'),('adminV','V'),('adminD','D'),('adminS','S'),('adminAtiva','ativa'),('adminPre','pre')]
    psql("INSERT INTO public.profiles VALUES " + ','.join(f"('{U[u]}','{O[o]}',true)" for u,o in prof))
    roles = [('superA','superadmin'),('superB','superadmin'),('gestorHom','gestor'),('gestorM','gestor'),('consultorM','consultor')] + [(u,'administrador') for u in ['adminHom','adminM','adminV','adminD','adminS','adminAtiva','adminPre']]
    psql("INSERT INTO public.user_roles VALUES " + ','.join(f"('{U[u]}','{r}')" for u,r in roles))
    psql(f"INSERT INTO public.company_fiscal_settings(organization_id,is_active,razao_social,rtc_configuration) VALUES ('{O['hom']}',true,'Homologação CultivoFarm 20261001','{{\"x\":1}}'),('{O['ativa']}',true,'Ativa','{{}}')")
    def dados(k, razao): return json.dumps({'razao_social':razao,'cnpj':C[k],'cep':'38600-000','logradouro':'Rua Fictícia','cidade':'Paracatu','uf':'MG','telefone':'38999990000','responsavel_nome':'Resp Fictício','fuso_horario':'America/Sao_Paulo','confirmado':True}, ensure_ascii=False)

    # ---- ANTES: reproduz o defeito confirmado ----
    ok,out,err = actor(U['adminPre'], f"SELECT public.org_onboarding_save('{dados('pre','Emitente Pré')}'::jsonb); SELECT public.org_onboarding_complete()->>'status';")
    check('BEFORE: manual onboarding activates without review (bug reproduced)', ok and out.endswith('ativa'), err or out)

    # ---- instala pacote exato ----
    r = psql((H/'install.sql.review').read_text(), ok=False)
    check('install.sql.review (preflight+core+fiscal+postflight) commits', r.returncode==0, r.stderr)
    r = psql((H/'install.sql.review').read_text(), ok=False)
    check('rerun blocked by preflight', r.returncode!=0 and 'já instalado' in r.stderr, r.stderr)
    check('existing active orgs untouched (no backfill)', psql("SELECT string_agg(status,',' ORDER BY nome) FROM public.organizations WHERE id IN ('%s','%s','%s')"%(O['hom'],O['ativa'],O['pre'])).stdout.strip()=='ativa,ativa,ativa')

    # ---- manual (sem evidência) -> revisão ----
    ok,out,err = actor(U['adminM'], f"SELECT public.org_onboarding_save('{dados('M','Emitente Manual Ltda')}'::jsonb); SELECT public.org_onboarding_complete()::text;")
    check('manual completion -> aguardando_revisao (sem_evidencia_servidor)', ok and '"aguardando_revisao"' in out and 'sem_evidencia_servidor' in out, err or out)
    ok,out,err = actor(U['adminM'], "SELECT public.org_onboarding_state()::text;")
    st = json.loads(out.splitlines()[-1]) if ok else {}
    check('reload state: required+review_pending, motivo exposto ao admin', st.get('required') and st.get('review_pending') and st.get('review',{}).get('motivo_codigo')=='sem_evidencia_servidor', err or out)
    ok,out,err = actor(U['gestorM'], "SELECT public.org_onboarding_state()::text;")
    st = json.loads(out.splitlines()[-1]) if ok else {}
    check('non-admin tenant user: required+review_pending, sem dados', st.get('required') and st.get('review_pending') and 'dados' not in st, err or out)
    ok,out,err = actor(U['adminM'], f"SELECT public.org_onboarding_save('{dados('M','Outra Razão')}'::jsonb);")
    check('no re-edit while in review', not ok and 'não está em onboarding' in err, err)
    ok,out,err = actor(U['adminM'], "SELECT public.org_onboarding_complete()::text;")
    n = psql(f"SELECT count(*) FROM platform_private.organization_onboarding_reviews WHERE organization_id='{O['M']}'").stdout.strip()
    check('re-submit idempotent, no duplicate review', ok and '"idempotent": true' in out and n=='1', err or out+n)
    ok,out,err = actor(U['adminM'], "SELECT (public.rpc_fiscal_company_settings_init()).id;")
    check('fiscal init RPC denied while in review', not ok and 'ORG_REVIEW_PENDING' in err, err)
    ok,out,err = actor(U['gestorM'], "SELECT public.rpc_fiscal_company_rtc_get();")
    check('fiscal read RPC denied while in review (gestor)', not ok and 'ORG_REVIEW_PENDING' in err, err)
    psql(f"INSERT INTO public.company_fiscal_settings(organization_id,is_active,razao_social) SELECT '{O['M']}',true,'pré-existente' WHERE false")  # trigger bloquearia; nenhum dado criado
    ok,out,err = actor(U['adminM'], f"INSERT INTO public.company_fiscal_settings(organization_id,is_active) VALUES ('{O['M']}',true);")
    check('direct table INSERT denied while in review', not ok, err)
    ok,out,err = actor(U['adminM'], "SELECT count(*) FROM public.company_fiscal_settings;")
    check('direct SELECT returns nothing while in review', ok and out.endswith('0'), err or out)
    ok,out,err = actor(U['adminM'], f"SELECT public.platform_approve_onboarding_review('{O['M']}','auto aprovação');")
    check('tenant admin cannot approve own review', not ok and 'platform_forbidden' in err, err)
    ok,out,err = actor(U['adminM'], "SELECT public.platform_list_onboarding_reviews();")
    check('tenant admin cannot read review queue', not ok and 'platform_forbidden' in err, err)
    ok,out,err = actor(U['adminM'], "SELECT count(*) FROM platform_private.organization_onboarding_reviews;")
    check('review table not readable by clients', not ok and 'permission denied' in err, err)
    ok,out,err = actor(U['adminM'], "UPDATE public.organizations SET status='ativa';")
    check('direct status write blocked by existing guard', not ok and 'org_forbidden' in err, err)

    # ---- evidência servidor ----
    ok,out,err = actor(U['adminV'], f"SELECT public.svc_onboarding_record_cnpj_evidence('{O['V']}','{U['adminV']}','{{\"cnpj\":\"{C['V']}\",\"razao_social\":\"X\",\"situacao_cadastral\":\"ATIVA\"}}','f','{'a'*64}');")
    check('client cannot write evidence (no EXECUTE)', not ok and 'permission denied' in err, err)
    ok,out,err = actor(None, f"SELECT public.svc_onboarding_record_cnpj_evidence('{O['V']}','{U['adminM']}','{{\"cnpj\":\"{C['V']}\"}}','f','{'a'*64}');", role='service_role')
    check('service evidence rejects actor from another org', not ok and 'org_forbidden' in err, err)
    for k, razao, sit in [('V','Emitente Verificado S.A.','ATIVA'),('D','Razão Oficial Diferente Ltda','ATIVA'),('S','Emitente Baixado Ltda','BAIXADA')]:
        ok,out,err = actor(None, f"SELECT public.svc_onboarding_record_cnpj_evidence('{O[k]}','{U['admin'+k]}','{json.dumps({'cnpj':C[k],'razao_social':razao,'situacao_cadastral':sit},ensure_ascii=False)}','Receita Federal via BrasilAPI','{'b'*64}');", role='service_role')
        check(f'service records evidence {k}', ok, err)
    ok,out,err = actor(U['adminV'], f"SELECT public.org_onboarding_save('{dados('V','EMITENTE VERIFICADO SA')}'::jsonb); SELECT public.org_onboarding_complete()->>'status';")
    check('verified evidence (ATIVA + razão coerente) -> ativa', ok and out.endswith('ativa'), err or out)
    ok,out,err = actor(U['adminV'], "SELECT (public.rpc_fiscal_company_settings_init()).organization_id;")
    check('verified org opens Central Fiscal (init)', ok and O['V'] in out, err or out)
    ok,out,err = actor(U['adminD'], f"SELECT public.org_onboarding_save('{dados('D','Emitente Digitado Ltda')}'::jsonb); SELECT public.org_onboarding_complete()::text;")
    check('discrepant razão -> revisão razao_social_divergente', ok and 'razao_social_divergente' in out, err or out)
    ok,out,err = actor(U['adminS'], f"SELECT public.org_onboarding_save('{dados('S','Emitente Baixado Ltda')}'::jsonb); SELECT public.org_onboarding_complete()::text;")
    check('situação não ATIVA -> revisão', ok and 'situacao_cadastral_nao_ativa' in out, err or out)

    # ---- plataforma ----
    ok,out,err = actor(U['superA'], "SELECT jsonb_array_length(public.platform_list_onboarding_reviews());")
    check('superadmin queue lists 3 pending (M,D,S)', ok and out.endswith('3'), err or out)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_set_organization_status('{O['M']}','ativa','tentativa genérica');")
    check('generic status cannot activate org in review', not ok and 'aprovação da revisão' in err, err)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_approve_onboarding_review('{O['M']}','abc');")
    check('approval requires motivo', not ok and 'motivo' in err, err)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_approve_onboarding_review('{O['M']}','Documentos conferidos')::text;")
    check('superadmin approval -> ativa', ok and '"ativa"' in out and '"idempotent": false' in out, err or out)
    ok,out,err = actor(U['superB'], f"SELECT public.platform_approve_onboarding_review('{O['M']}','Segunda aprovação')::text;")
    check('approval idempotent (second superadmin)', ok and '"idempotent": true' in out, err or out)
    a = psql(f"SELECT count(*) FILTER (WHERE status_novo='ativa'), count(*) FILTER (WHERE status_novo='aguardando_revisao') FROM public.organization_status_audit WHERE organization_id='{O['M']}'").stdout.strip()
    r2 = psql(f"SELECT decisao||'|'||(decidido_por='{U['superA']}')::text FROM platform_private.organization_onboarding_reviews WHERE organization_id='{O['M']}'").stdout.strip()
    check('audit: one review entry, one activation, decision by approver', a=='1|1' and r2=='aprovada|true', a+' '+r2)
    ok,out,err = actor(U['adminM'], "SELECT (public.org_onboarding_state()->>'required');")
    check('after approval reload: not required', ok and out.endswith('false'), err or out)
    ok,out,err = actor(U['adminM'], "SELECT (public.rpc_fiscal_company_settings_init()).organization_id;")
    check('after approval: Central Fiscal init allowed', ok and O['M'] in out, err or out)
    ok,out,err = actor(U['gestorM'], "SELECT public.rpc_fiscal_company_rtc_get()->>'exists';")
    check('after approval: gestor reads RTC', ok and out.endswith('true'), err or out)
    ok,out,err = actor(U['consultorM'], "SELECT public.rpc_fiscal_company_rtc_get();")
    check('after approval: consultor still denied by existing role rule', not ok and 'FISCAL_FORBIDDEN' in err, err)
    ok,out,err = actor(U['adminM'], f"SELECT count(*) FROM public.company_fiscal_settings WHERE organization_id='{O['ativa']}';")
    check('no cross-tenant fiscal read', ok and out.endswith('0'), err or out)

    # ---- remessa da Homologação CultivoFarm 20261001 ----
    ok,out,err = actor(U['adminHom'], "SELECT public.rpc_fiscal_company_rtc_get()->>'exists';")
    check('homolog active before remessa: fiscal readable', ok and out.endswith('true'), err or out)
    ok,out,err = actor(U['adminHom'], f"SELECT public.platform_return_organization_to_review('{O['hom']}','Caso confirmado de ativação sem revisão');")
    check('tenant admin cannot return own org to review', not ok and 'platform_forbidden' in err, err)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_return_organization_to_review('{O['hom']}','Caso confirmado de ativação sem revisão')::text;")
    check('superadmin returns homolog org to review', ok and '"aguardando_revisao"' in out and '"idempotent": false' in out, err or out)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_return_organization_to_review('{O['hom']}','Repetição')::text;")
    check('remessa idempotent', ok and '"idempotent": true' in out, err or out)
    ok,out,err = actor(U['adminHom'], "SELECT public.rpc_fiscal_company_rtc_get();")
    check('homolog in review: fiscal RPC denied', not ok and 'ORG_REVIEW_PENDING' in err, err)
    ok,out,err = actor(U['gestorHom'], "SELECT count(*) FROM public.company_fiscal_settings;")
    check('homolog in review: direct select hidden (data preserved)', ok and out.endswith('0') and psql(f"SELECT count(*) FROM public.company_fiscal_settings WHERE organization_id='{O['hom']}'").stdout.strip()=='1', err or out)
    ok,out,err = actor(U['adminHom'], "UPDATE public.company_fiscal_settings SET razao_social='x';")
    check('homolog in review: direct update affects 0 rows', ok and psql(f"SELECT razao_social FROM public.company_fiscal_settings WHERE organization_id='{O['hom']}'").stdout.strip()=='Homologação CultivoFarm 20261001', err)
    ok,out,err = actor(U['adminAtiva'], "SELECT (public.rpc_fiscal_company_settings_init()).organization_id;")
    check('other active org unaffected during homolog review', ok and O['ativa'] in out, err or out)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_approve_onboarding_review('{O['hom']}','Revisão concluída')->>'status';")
    check('homolog approved -> ativa', ok and out.endswith('ativa'), err or out)
    ok,out,err = actor(U['adminHom'], "SELECT public.rpc_fiscal_company_rtc_get()->>'exists';")
    check('homolog after approval: fiscal readable again', ok and out.endswith('true'), err or out)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_set_organization_status('{O['D']}','cancelada','Cadastro recusado')")
    rej = psql(f"SELECT decisao FROM platform_private.organization_onboarding_reviews WHERE organization_id='{O['D']}'").stdout.strip()
    check('cancel from review closes review as rejeitada', ok and rej=='rejeitada', err+rej)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_set_organization_status('{O['ativa']}','aguardando_revisao','genérico')")
    check('generic status cannot send to review', not ok and 'Remeter' in err, err)
    r = psql((H/'04-rollback.sql.review').read_text(), ok=False)
    ok,out,err = actor(U['superA'], f"SELECT public.platform_approve_onboarding_review('{O['S']}','Após rollback')")
    st = psql(f"SELECT status FROM public.organizations WHERE id='{O['S']}'").stdout.strip()
    check('rollback deny-only: approvals closed, org stays in review', r.returncode==0 and not ok and st=='aguardando_revisao', r.stderr+err)
finally:
    subprocess.run(['pg_ctl','-D',D+'/data','-m','immediate','stop'],capture_output=True); shutil.rmtree(D, ignore_errors=True)
ev = H/'evidence'; ev.mkdir(exist_ok=True)
json.dump({'postgres': subprocess.run(['postgres','--version'],capture_output=True,text=True).stdout.strip(),
           'level': 'PostgreSQL descartável; corpos LIVE capturados; claims SQL sintéticas; não é prova JWT/PostgREST/Edge hospedados',
           'results': RES, 'passed': sum(r['pass'] for r in RES), 'total': len(RES)}, open(ev/'pg-run.json','w'), ensure_ascii=False, indent=1)
print(f"{sum(r['pass'] for r in RES)}/{len(RES)}"); sys.exit(0 if all(r['pass'] for r in RES) else 1)
