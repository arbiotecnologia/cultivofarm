#!/usr/bin/env python3
"""Bateria local da correção (PostgreSQL DESCARTÁVEL restaurado do espelho completo 851b14f9/attempt-221). Nunca hosted.
Uso: FELIG_SOCK=/tmp/felig FELIG_PORT=55901 FELIG_DB=t python3 test_pg.py
Claims SQL sintéticas: não provam JWT/RLS/Storage hospedados."""
import hashlib,json,os,subprocess,sys
from pathlib import Path
H=Path(__file__).resolve().parent;EV=H/'evidence';EV.mkdir(exist_ok=True)
att=EV/f"attempt-{max([int(p.name[-3:]) for p in EV.glob('attempt-*')],default=0)+1:03d}";att.mkdir()
SU=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
BASE=SU+['psql','-X','-At','-v','ON_ERROR_STOP=1','-h',os.environ.get('FELIG_SOCK','/tmp/felig'),'-p',os.environ.get('FELIG_PORT','55901'),'-U','postgres','-d',os.environ.get('FELIG_DB','t')]
REF="SET fiscal_elig_fix.review_project_ref='swzpzcwiasxmjutrmvkm';"
ADM='00000000-0000-0000-0000-000000000024'
checks=[]
def run(s):
    r=subprocess.run(BASE,input=s,capture_output=True,text=True,timeout=120);return r.returncode,r.stdout.strip(),r.stderr.strip()
def last(s):
    c,o,e=run(s);assert c==0,e;return o.splitlines()[-1] if o else ''
def ok(name,cond,detail=None):
    checks.append(dict(test=name,status='PASS' if cond else 'FAIL',detail=detail));print('PASS' if cond else 'FAIL',name,'' if cond else str(detail)[:500],flush=True)
def as_adm(s): return f"""SET ROLE authenticated; SET request.jwt.claim.sub='{ADM}'; SET request.jwt.claims='{json.dumps({"sub":ADM,"role":"authenticated","exp":4102444800})}';"""+s
def elig(src,i,three=False):
    return run(as_adm(f"SELECT public.fn_fiscal_invoice_eligibility('{src}','{i}'{',NULL' if three else ''})::text;"))
def J(o): return json.loads([l for l in o.splitlines() if l.startswith('{')][-1])
def codes(o): return sorted({r['code'] for r in J(o)['reasons']})
def f(n): return (H/n).read_text()
md5=lambda sig:last(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure));")
S2='public.fn_fiscal_invoice_eligibility(text,uuid)';S3='public.fn_fiscal_invoice_eligibility(text,uuid,uuid)'
PROT=['public.rpc_fiscal_invoice_apply_authorization_v1(uuid,text,text,timestamptz,text,text,uuid)','platform_private.b2b_fiscal_invoice_bridge_v1(uuid)','platform_private.b2b_allocate_document(uuid)','platform_private.b2b_financial_forecast_reconcile_fiscal_v1(uuid,uuid)']
LIVE_EXPECTED={PROT[0]:'766fb81a3c7dafa71de7806e559f0730',PROT[1]:'9b14fa08913075c08bc905074fb98a10',PROT[2]:'cc539ca8c501af53a528d66b810aecd8',PROT[3]:'f8f3b5e52653fa7c8b69c393c2eefa4d'}
CM=json.loads(f('candidate-md5.json'))
c,o,e=run(f"SELECT 1 FROM pg_proc LIMIT 1;");assert c==0,e
prot=lambda:{s:md5(s) for s in PROT}
p0=prot();ok('espelho: quatro rotinas fiscais B4 = MD5 LIVE informados pelo auditor',p0==LIVE_EXPECTED,p0)
ok('espelho: índice b2b_one_title_per_document e PK de alocação por document_id',last("SELECT (SELECT count(*) FROM pg_indexes WHERE indexname='b2b_one_title_per_document' AND indexdef LIKE '%(b2b_document_id)%')||':'||(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='platform_private.b2b_document_allocations'::regclass AND contype='p');")=='1:PRIMARY KEY (document_id)')
DONE=last("SELECT string_agg(id::text,',' ORDER BY id) FROM public.entregas WHERE status='entregue' AND partner_order_id IS NOT NULL;").split(',')
CANC=last("SELECT string_agg(id::text,',' ORDER BY id) FROM public.entregas WHERE status='cancelada';").split(',')
# Entrega parcial real: pedido com >1 entrega concluída (revenda 1+1 / parciais do harness).
PART=last("SELECT coalesce(string_agg(id::text,',' ORDER BY id),'') FROM public.entregas e WHERE status='entregue' AND partner_order_id IN (SELECT partner_order_id FROM public.entregas WHERE status='entregue' GROUP BY 1 HAVING count(*)>1);").split(',')
ORDERS=last("SELECT string_agg(id::text,',' ORDER BY id) FROM public.partner_orders;").split(',')
def snapshot_orders(three):
    return {o:(lambda r:(r[0],r[1][-1:] and r[1].splitlines()[-1],r[2].splitlines()[0] if r[2] else ''))(elig('PARTNER_ORDER',o,three)) for o in ORDERS}
ord2_before=snapshot_orders(False);ord3_before=snapshot_orders(True)
# 1. Reprodução antes da correção
for sig3 in (False,True):
    c,o,e=elig('ENTREGA',DONE[0],sig3)
    ok(f"ANTES: entrega concluída falha com enum vazio ({'3' if sig3 else '2'} args)",c!=0 and 'invalid input value for enum status_entrega: ""' in e,e[:300])
# 2. PRE
c,o,e=run(f('01-pre.sql.readonly'));ok('PRE sem ref do projeto falha fechado',c!=0 and 'FELIG_PRE_PROJECT_REF_REQUIRED' in e,e[:200])
c,o,e=run(REF+f('01-pre.sql.readonly'));ok('PRE passa com pins (corpo/owner/ACL/config/3-arg/enum)',c==0 and 'FELIG_PRE_OK' in o,e)
# PRE drift: corpo alterado numa transação revertida
c,o,e=run("BEGIN;COMMENT ON FUNCTION "+S2+" IS 'x';"+REF+f('01-pre.sql.readonly').replace('BEGIN READ ONLY;','').replace('ROLLBACK;','')+"ROLLBACK;")
ok('PRE ignora COMMENT (não faz parte do corpo) — controle',c==0,e[:200])
c,o,e=run("BEGIN;GRANT EXECUTE ON FUNCTION "+S2+" TO anon;"+REF+f('01-pre.sql.readonly').replace('BEGIN READ ONLY;','').replace('ROLLBACK;','')+"ROLLBACK;")
ok('PRE detecta deriva de ACL',c!=0 and 'FELIG_PRE_META_DRIFT_2ARG' in e,e[:200])
# 3. INSTALL
c,o,e=run(f('02-install.sql.review'));ok('INSTALL sem ref falha fechado sem efeito',c!=0 and md5(S2)==CM['live_md5_2arg'],e[:200])
c,o,e=run(REF+f('02-install.sql.review'));ok('INSTALL aplica corpo candidato',c==0 and md5(S2)==CM['candidate_md5_2arg'],e)
c,o,e=run(REF+f('02-install.sql.review'));ok('INSTALL repetido aborta por deriva (não reaplica)',c!=0 and 'FELIG_INSTALL_BODY_DRIFT_2ARG' in e,e[:200])
c,o,e=run(REF+f('03-post.sql.readonly'));ok('POST passa',c==0 and 'FELIG_POST_OK' in o,e)
ok('3-arg intocado e ACLs preservadas',md5(S3)==CM['live_md5_3arg_untouched'] and last(f"SELECT proacl::text FROM pg_proc WHERE oid='{S2}'::regprocedure")=='{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}')
ok('autorização/ponte/alocação/reconciliação intocadas',prot()==LIVE_EXPECTED)
# 4. Chamadas reais pós-correção
res={}
for sig3 in (False,True):
    n='3' if sig3 else '2'
    for i in DONE:
        c,o,e=elig('ENTREGA',i,sig3);res[f'{n}:done:{i}']=(c,o[-400:],e[:300])
        ok(f'DEPOIS ({n} args) entrega concluída {i[:8]} responde sem erro e sem NOT_COMPLETED/CANCELED',c==0 and not {'FISCAL_DELIVERY_NOT_COMPLETED','FISCAL_DELIVERY_CANCELED'}&set(codes(o)),(c,e,o[-300:]))
    for i in [p for p in PART if p]:
        c,o,e=elig('ENTREGA',i,sig3);res[f'{n}:partial:{i}']=(c,o[-400:])
        ok(f'DEPOIS ({n} args) entrega parcial concluída {i[:8]} sem NOT_COMPLETED',c==0 and 'FISCAL_DELIVERY_NOT_COMPLETED' not in codes(o),(c,e))
    for i in CANC:
        c,o,e=elig('ENTREGA',i,sig3);res[f'{n}:canc:{i}']=(c,o[-400:])
        ok(f'DEPOIS ({n} args) entrega cancelada {i[:8]} nega com CANCELED e NOT_COMPLETED',c==0 and {'FISCAL_DELIVERY_CANCELED','FISCAL_DELIVERY_NOT_COMPLETED'}<=set(codes(o)),(c,e,o[-300:]))
    for st in ('separado','em_rota'):
        # SEAM: estado não concluído só existe em transação revertida (triggers de entrega ignorados via replica); nada persiste.
        c,o,e=run(f"BEGIN;SET session_replication_role=replica;UPDATE public.entregas SET status='{st}',entregue_em=NULL,confirmada_em=NULL,recebimento_confirmado_em=NULL WHERE id='{DONE[0]}';SET session_replication_role=origin;"+as_adm(f"SELECT public.fn_fiscal_invoice_eligibility('ENTREGA','{DONE[0]}'{',NULL' if sig3 else ''})::text;")+"ROLLBACK;")
        ok(f'DEPOIS ({n} args) entrega não concluída ({st}) nega NOT_COMPLETED + RECEIPT_MISSING, ineligible',c==0 and {'FISCAL_DELIVERY_NOT_COMPLETED','FISCAL_DELIVERY_RECEIPT_MISSING'}<=set(codes(o)) and J(o)['eligible'] is False,(c,e,o[-300:]))
    c,o,e=elig('ENTREGA','00000000-0000-0000-0000-00000000dead',sig3);ok(f'({n} args) entrega inexistente nega NOT_FOUND',c==0 and 'FISCAL_DELIVERY_NOT_FOUND' in codes(o),e)
ok('entrega revertida voltou a entregue (sem efeito persistido)',last(f"SELECT status FROM public.entregas WHERE id='{DONE[0]}'")=='entregue')
c,o,e=run(f"SET ROLE anon;SELECT public.fn_fiscal_invoice_eligibility('ENTREGA','{DONE[0]}');");ok('anon continua sem EXECUTE',c!=0 and 'permission denied' in e,e[:200])
c,o,e=run(f"SET ROLE authenticated;SET request.jwt.claim.sub='00000000-0000-0000-0000-00000000beef';SELECT public.fn_fiscal_invoice_eligibility('ENTREGA','{DONE[0]}');");ok('ator sem empresa continua negado (H15)',c!=0 and 'H15_' in e,e[:200])
ok('origem PARTNER_ORDER: resultado idêntico antes/depois (2 args)',snapshot_orders(False)==ord2_before)
ok('origem PARTNER_ORDER: resultado idêntico antes/depois (3 args)',snapshot_orders(True)==ord3_before)
# 5. ROLLBACK
c,o,e=run(f('04-rollback.sql.review'));ok('ROLLBACK sem ref falha fechado',c!=0 and md5(S2)==CM['candidate_md5_2arg'],e[:200])
c,o,e=run(REF+f('04-rollback.sql.review'));ok('ROLLBACK restaura corpo capturado exato e ACL',c==0 and md5(S2)==CM['live_md5_2arg'],e)
c,o,e=elig('ENTREGA',DONE[0]);ok('pós-rollback: falha de enum volta (falha fechada, nenhuma elegibilidade concedida)',c!=0 and 'status_entrega' in e,e[:200])
c,o,e=run(REF+f('01-pre.sql.readonly'));ok('pós-rollback PRE passa de novo',c==0)
c,o,e=run(REF+f('02-install.sql.review'));ok('reinstalação após rollback idêntica',c==0 and md5(S2)==CM['candidate_md5_2arg'])
c,o,e=run(REF+f('04-rollback.sql.review'));ok('rollback final deixa espelho no estado capturado',c==0 and md5(S2)==CM['live_md5_2arg'])
ok('rotinas protegidas intocadas ao final',prot()==LIVE_EXPECTED)
sums={n:hashlib.sha256((H/n).read_bytes()).hexdigest() for n in ['01-pre.sql.readonly','02-install.sql.review','03-post.sql.readonly','04-rollback.sql.review','candidate.sql','generate.py','test_pg.py','live-capture/eligibility-2arg.sql','live-capture/pins.json']}
(att/'checks.json').write_text(json.dumps(checks,indent=1,ensure_ascii=False)+'\n');(att/'calls.json').write_text(json.dumps(res,indent=1)+'\n');(att/'tested-sha256.json').write_text(json.dumps(sums,indent=1)+'\n')
fails=[x for x in checks if x['status']!='PASS'];(att/'exitcode').write_text(('1' if fails else '0')+'\n')
print(len(checks)-len(fails),'/',len(checks));sys.exit(1 if fails else 0)
