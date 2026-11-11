#!/usr/bin/env python3
"""Bateria do gate administrativo da carteira no espelho composto (02a+02b+catálogo 6b56cfb1+02c), executando os bytes
finais 01d/02d/03d/04d com SHA conferido. Auth sintética por claims SQL: não prova JWT/RLS/Storage hospedados."""
import hashlib,json,sys,threading,time
from pathlib import Path
H=Path(__file__).resolve().parent;sys.path.insert(0,str(H.parent));sys.path.insert(0,str(H))
import generate as G
u=lambda n:f"00000000-0000-0000-0000-{n:012d}"
A='007bb519-cba0-4704-be2c-cb93ad010048';F=u(2)
P,P2,PF=u(11),u(85),u(13)
ADM,ADMS,ADMI,ADMP,ADMF,GC=u(950),u(951),u(952),u(953),u(954),u(955)
V1,V2,VX,VI,VE,VR=u(960),u(961),u(962),u(963),u(964),u(965)
checks=[];executed={}
def ok(n,c,det=None):
    checks.append(dict(test=n,status='PASS' if c else 'FAIL',detail=None if c else str(det)[:900]));print(('PASS ' if c else 'FAIL ')+n,'' if c else str(det)[:400],flush=True)
d=G.setup(55811)
MAN=json.loads((H/'manifest.json').read_text())
def run_file(n,pre="SET app.expected_ref='swzpzcwiasxmjutrmvkm';"):
    b=(H/n).read_bytes();s=hashlib.sha256(b).hexdigest();assert s==MAN['files'][n],('SHA',n);executed.setdefault(n,[]).append(s);return d.raw(pre+b.decode())
def sess(uid,body): return "\\set VERBOSITY verbose\nSET ROLE authenticated; SET request.jwt.claim.sub='%s'; SET request.jwt.claims='%s';"%(uid,json.dumps({'sub':uid,'role':'authenticated','iat':1}))+body
def call(uid,expr):
    r=d.raw(sess(uid,f"SELECT ({expr})::text;"))
    if r.returncode: return None,next((l for l in r.stderr.splitlines() if l.startswith('ERROR:')),r.stderr[-200:])
    return (r.stdout.strip().splitlines() or [''])[-1],None
FP="select md5(concat_ws('|',(select count(*)||':'||count(revoked_at) from platform_private.seller_portfolio_assignments),(select count(*) from platform_private.seller_portfolio_audit)))"
def deny(n,expr,uid,state,tok):
    b=d.last(FP);r=call(uid,expr);a=d.last(FP);e=r[1] or ''
    ok(f'{n} [{state} {tok}]',r[0] is None and f'ERROR:  {state}:' in e and tok in e and a==b,dict(r=r,changed=a!=b))
assign=lambda s,p,why='motivo': f"public.admin_assign_seller_portfolio_v1('{s}','{p}','{why}')"
revoke=lambda i: f"public.admin_revoke_seller_portfolio_v1('{i}','revogar')"
def active(p): return d.last(f"select id from platform_private.seller_portfolio_assignments where partner_id='{p}' and revoked_at is null")
def reset(p):
    d.sql(f"update platform_private.seller_portfolio_assignments set revoked_at=now(),revoked_by='{ADM}',revoke_reason='reset' where partner_id='{p}' and revoked_at is null")
def mk(uid,org,roles,ativo=True,prov=False):
    d.sql(f"INSERT INTO public.profiles(id,user_id,nome,ativo,organization_id,senha_provisoria) VALUES(gen_random_uuid(),'{uid}','SINT {uid[-3:]}',{str(ativo).lower()},'{org}',{str(prov).lower()});"
          +"".join(f"INSERT INTO public.user_roles(user_id,role) VALUES('{uid}','{r}');" for r in roles))
try:
    for p,o in [(P,A),(P2,A),(PF,F)]:
        ok(f'fixture parceiro {p[-3:]} da empresa esperada e ativo',d.last(f"select commercial_owner_organization_id='{o}' and ativo and deleted_at is null from public.partner_accounts where id='{p}'")=='t')
    mk(ADM,A,['administrador']);mk(ADMS,A,['administrador']);mk(ADMI,A,['administrador'],ativo=False);mk(ADMP,A,['administrador'],prov=True)
    mk(ADMF,F,['administrador']);mk(GC,A,['gestor_comercial'])
    mk(V1,A,['vendedor']);mk(V2,A,['vendedor']);mk(VX,A,['vendedor','gestor_comercial']);mk(VI,A,['vendedor'],ativo=False);mk(VE,F,['vendedor']);mk(VR,A,['tecnico_agronomo'])
    # Admin suspenso: rotação de acesso posterior ao iat da sessão (controle vigente platform_actor_access_ready).
    inv_cols=d.last("select string_agg(column_name||':'||is_nullable||':'||coalesce(column_default,''),' ; ') from information_schema.columns where table_schema='public' and table_name='platform_org_admin_invites' and is_nullable='NO' and column_default is null")
    r=d.raw(f"INSERT INTO public.platform_org_admin_invites(id,user_id,organization_id,access_valid_after) SELECT gen_random_uuid(),'{ADMS}','{A}',now()")
    if r.returncode: r=d.raw(f"ALTER TABLE public.platform_org_admin_invites DISABLE TRIGGER USER; INSERT INTO public.platform_org_admin_invites SELECT (jsonb_populate_record(null::public.platform_org_admin_invites, (select to_jsonb(i) from public.platform_org_admin_invites i limit 1) || jsonb_build_object('id',gen_random_uuid(),'user_id','{ADMS}','organization_id','{A}','access_valid_after',now(),'access_operation_status',null))).*; ALTER TABLE public.platform_org_admin_invites ENABLE TRIGGER USER;")
    ok('fixture: admin suspenso por rotação de acesso (access_ready=false)',r.returncode==0 and d.last(f"select platform_private.platform_actor_access_ready('{ADMS}')")=='f',(inv_cols,r.stderr[-400:]))
    # --- Estado LIVE (02b): reproduz o defeito ---
    ok('LIVE 02b: admin suspenso ATRIBUI (defeito reproduzido)',call(ADMS,assign(V1,P))[0] is not None);reset(P)
    ok('LIVE 02b: vendedor com papéis combinados é aceito (defeito)',call(ADM,assign(VX,P))[0] is not None);reset(P)
    d.sql(f"update public.partner_accounts set ativo=false where id='{P2}'")
    ok('LIVE 02b: parceiro inativo é aceito (defeito)',call(ADM,assign(V1,P2))[0] is not None);reset(P2)
    d.sql(f"update public.partner_accounts set ativo=true where id='{P2}'")
    # Atribuição antiga que ficará com alvo desativado (para provar revogação preservada)
    old=call(ADM,assign(V2,P2))[0];ok('LIVE: atribuição antiga V2→P2 criada',old is not None)
    # --- PRE/INSTALL ---
    r=run_file('01d-pre-admin-gate.sql.readonly',"SET app.expected_ref='wrong';");ok('PRE ref divergente falha fechada',r.returncode and 'VENDA_PRE_REF_UNPROVEN' in r.stderr)
    r=run_file('01d-pre-admin-gate.sql.readonly');ok('PRE_PASS',r.returncode==0 and 'VENDA_PRE_PASS' in r.stderr,r.stderr[-300:])
    r=run_file('02d-install-admin-gate.sql.review',"SET app.expected_ref='wrong';");ok('INSTALL sem ref recusado',r.returncode and 'REF_UNPROVEN' in r.stderr)
    r=run_file('02d-install-admin-gate.sql.review');ok('INSTALL transação única',r.returncode==0,r.stderr[-600:])
    r=run_file('02d-install-admin-gate.sql.review');ok('reinstalação recusada',r.returncode and 'VENDA_PRE' in r.stderr)
    r=run_file('03d-post-admin-gate.sql.readonly');ok('POST_PASS',r.returncode==0 and 'VENDA_POST_PASS' in r.stderr,r.stderr[-300:])
    for s in G.NEW: ok('helper privado sem EXECUTE de cliente '+s,d.last(f"select has_function_privilege('authenticated','{s}','EXECUTE') or has_function_privilege('anon','{s}','EXECUTE')")=='f')
    # --- Negativas do administrador ---
    deny('admin com acesso suspenso não atribui',assign(V1,P),ADMS,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin com perfil inativo não atribui',assign(V1,P),ADMI,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin com senha provisória não atribui',assign(V1,P),ADMP,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('gestor comercial não atribui',assign(V1,P),GC,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('vendedor não se autoatribui',assign(V1,P),V1,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin de outro tenant não atribui parceiro A',assign(V1,P),ADMF,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin A não atribui parceiro de outro tenant (sem oráculo)',assign(V1,PF),ADM,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin suspenso não revoga',revoke(old),ADMS,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin suspenso não lista',"(select count(*) from public.admin_list_seller_portfolio_v1())",ADMS,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('admin suspenso não vê visão geral',"public.admin_seller_portfolio_overview_v1()",ADMS,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    deny('motivo obrigatório',assign(V1,P,' '),ADM,'22023','SELLER_PORTFOLIO_REASON_REQUIRED')
    # --- Alvos inválidos ---
    deny('vendedor com papéis combinados recusado',assign(VX,P),ADM,'22023','SELLER_PORTFOLIO_SELLER_INVALID')
    deny('vendedor inativo recusado',assign(VI,P),ADM,'22023','SELLER_PORTFOLIO_SELLER_INVALID')
    deny('vendedor de outro tenant recusado',assign(VE,P),ADM,'22023','SELLER_PORTFOLIO_SELLER_INVALID')
    deny('usuário sem papel vendedor recusado',assign(VR,P),ADM,'22023','SELLER_PORTFOLIO_SELLER_INVALID')
    d.sql(f"update public.partner_accounts set ativo=false where id='{P2}'")
    deny('parceiro inativo recusado',assign(V1,P2),ADM,'22023','SELLER_PORTFOLIO_PARTNER_INVALID')
    d.sql(f"update public.partner_accounts set ativo=true, deleted_at=now() where id='{P2}'")
    deny('parceiro excluído recusado',assign(V1,P2),ADM,'22023','SELLER_PORTFOLIO_PARTNER_INVALID')
    ov=json.loads(call(ADM,"public.admin_seller_portfolio_overview_v1()")[0])
    ids={s['user_id'] for s in ov['sellers']}
    ok('visão: só vendedores elegíveis como opção',V1 in ids and V2 in ids and not ids&{VX,VI,VE,VR},ids)
    ok('visão: parceiro excluído fora das opções',P2 not in {p['partner_id'] for p in ov['partners']})
    oa=[a for a in ov['assignments'] if a['id']==old]
    ok('visão: atribuição antiga com alvo inválido continua listada para revogação',oa and oa[0]['partner_active'] is False)
    # --- Revogação de atribuição antiga com alvo desativado ---
    d.sql(f"update public.profiles set ativo=false where user_id='{V2}'")
    r=call(ADM,revoke(old));ok('revoga atribuição antiga com vendedor e parceiro desativados',r[1] is None and d.last(f"select revoked_at is not null from platform_private.seller_portfolio_assignments where id='{old}'")=='t',r)
    ok('revogação auditada uma vez',d.last(f"select count(*) from platform_private.seller_portfolio_audit where assignment_id='{old}' and action='revoke'")=='1')
    deny('revogação repetida negada sem efeito',revoke(old),ADM,'42501','SELLER_PORTFOLIO_FORBIDDEN')
    d.sql(f"update public.partner_accounts set deleted_at=null where id='{P2}'; update public.profiles set ativo=true where user_id='{V2}'")
    # --- Positivo ---
    r=call(ADM,assign(V1,P));aid=r[0];ok('positivo: admin vigente atribui vendedor elegível a parceiro ativo',aid is not None,r)
    ok('positivo: auditoria assign única',d.last(f"select count(*) from platform_private.seller_portfolio_audit where assignment_id='{aid}' and action='assign'")=='1')
    deny('duplicidade recusada',assign(V2,P),ADM,'P0409','SELLER_PORTFOLIO_ALREADY_ASSIGNED')
    cap=json.loads(call(V1,"public.seller_portfolio_capability_v1()")[0]);ok('capability do vendedor mostra o parceiro atribuído',any(p['partner_id']==P for p in cap['partners']))
    r=call(ADM,revoke(aid));ok('positivo: revogação',r[1] is None)
    cap=json.loads(call(V1,"public.seller_portfolio_capability_v1()")[0]);ok('após revogar: parceiro some da capability',not any(p['partner_id']==P for p in cap['partners']))
    # --- Corridas atribuir × desativar ---
    def race(lock_sql,first_assign,sleep=2.0):
        out={}
        def holder():
            if first_assign:
                out['h']=d.raw(sess(ADM,f"BEGIN; SELECT {assign(V1,P)}; SELECT pg_sleep({sleep}); COMMIT;"))
            else:
                out['h']=d.raw(f"BEGIN; {lock_sql}; SELECT pg_sleep({sleep}); COMMIT;")
        t=threading.Thread(target=holder);t.start();time.sleep(0.6);t0=time.time()
        if first_assign: out['o']=d.raw(lock_sql)
        else: out['o']=d.raw(sess(ADM,f"SELECT {assign(V1,P)};"))
        out['wait']=time.time()-t0;t.join();return out
    o=race(f"update public.profiles set ativo=false where user_id='{V1}'",False)
    ok('corrida: desativação do vendedor vence → atribuição espera e é negada',o['wait']>1.0 and o['o'].returncode and 'SELLER_PORTFOLIO_SELLER_INVALID' in o['o'].stderr and not active(P),o)
    d.sql(f"update public.profiles set ativo=true where user_id='{V1}'")
    o=race(f"update public.partner_accounts set ativo=false where id='{P}'",False)
    ok('corrida: desativação do parceiro vence → atribuição espera e é negada',o['wait']>1.0 and 'SELLER_PORTFOLIO_PARTNER_INVALID' in o['o'].stderr and not active(P),o)
    d.sql(f"update public.partner_accounts set ativo=true where id='{P}'")
    o=race(f"update public.profiles set ativo=false where user_id='{ADM}'",False)
    ok('corrida: suspensão do admin vence → atribuição espera e é negada',o['wait']>1.0 and 'SELLER_PORTFOLIO_FORBIDDEN' in o['o'].stderr and not active(P),o)
    d.sql(f"update public.profiles set ativo=true where user_id='{ADM}'")
    o=race(f"update public.profiles set ativo=false where user_id='{V1}'",True)
    a1=active(P)
    ok('corrida: atribuição vence → desativação espera o commit',o['wait']>1.0 and o['h'].returncode==0 and o['o'].returncode==0 and bool(a1),o)
    cap=call(V1,"public.seller_portfolio_capability_v1()")[0]
    ok('após desativar: vendedor não opera a carteira',json.loads(cap)['ready'] is False)
    r=call(ADM,revoke(a1));ok('após desativar: atribuição continua revogável',r[1] is None,r)
    d.sql(f"update public.profiles set ativo=true where user_id='{V1}'")
    o=race(f"DELETE FROM public.user_roles WHERE user_id='{V1}' AND role='vendedor'",False)
    ok('corrida: remoção do papel vendedor vence → atribuição negada',o['wait']>1.0 and 'SELLER_PORTFOLIO_SELLER_INVALID' in o['o'].stderr and not active(P),o)
    d.sql(f"INSERT INTO public.user_roles(user_id,role) VALUES('{V1}','vendedor')")
    # --- Rollback ---
    keep=d.last("select count(*)||':'||count(revoked_at) from platform_private.seller_portfolio_assignments")
    r=run_file('04d-rollback-admin-gate.sql.review',"SET app.expected_ref='wrong';");ok('ROLLBACK sem ref recusado',r.returncode and 'REF_UNPROVEN' in r.stderr)
    r=run_file('04d-rollback-admin-gate.sql.review');ok('ROLLBACK restaura corpos 02b/02c e ACL exatos',r.returncode==0,r.stderr[-500:])
    for s in G.REPLACED: ok('rollback md5 LIVE '+s,d.md5(s)==MAN['live'][s]['md5'])
    ok('rollback preserva atribuições e histórico',d.last("select count(*)||':'||count(revoked_at) from platform_private.seller_portfolio_assignments")==keep)
    r=run_file('04d-rollback-admin-gate.sql.review');ok('ROLLBACK repetido recusa por drift',r.returncode and 'VENDA_RB_DRIFT' in r.stderr)
    r=run_file('01d-pre-admin-gate.sql.readonly');ok('PRE volta a passar após rollback (reinstalável)',r.returncode==0)
    r=run_file('02d-install-admin-gate.sql.review');ok('reinstalação após rollback',r.returncode==0,r.stderr[-300:])
    deny('após reinstalar: admin suspenso segue negado',assign(V1,P),ADMS,'42501','SELLER_PORTFOLIO_FORBIDDEN')
finally:
    ev=H/'evidence';ev.mkdir(exist_ok=True)
    res=dict(passed=sum(c['status']=='PASS' for c in checks),total=len(checks),executed_sha256=executed,checks=checks,
             note='Auth sintética por claims SQL; não prova JWT/RLS/Storage hospedados.')
    (ev/'test-admin-gate.json').write_text(json.dumps(res,indent=1,ensure_ascii=False)+"\n");print(f"RESULT {res['passed']}/{res['total']}")
