"""Exact package bytes, deny rollback, closed reinstall; disposable PostgreSQL only."""
import hashlib,json,sys,uuid
from pathlib import Path
sys.path.insert(0,'/tmp/c2neg');import db
H=Path(__file__).resolve().parent;out=H/'evidence'/('roundtrip-'+uuid.uuid4().hex[:8]);out.mkdir();rows=[]
def check(n,c,detail=None):rows.append(dict(test=n,status='PASS' if c else 'FAIL',detail=detail));print(rows[-1]['status'],n)
name='round_'+uuid.uuid4().hex[:12];db.DB('postgres').sql(f'CREATE DATABASE {name} TEMPLATE c2');d=db.DB(name)
def history():return d.last("select md5(jsonb_build_object('titles',(select jsonb_agg(to_jsonb(t) order by id) from accounts_receivable t),'installments',(select jsonb_agg(to_jsonb(t) order by id) from accounts_receivable_installments t),'payments',(select jsonb_agg(to_jsonb(t) order by id) from receivable_payments t),'events',(select jsonb_agg(to_jsonb(t) order by id) from platform_private.b2b_financial_forecast_events t),'stock',(select jsonb_agg(to_jsonb(t) order by id) from estoque_produto t),'delivery',(select jsonb_agg(to_jsonb(t) order by id) from entregas t))::text)")
try:
 before=history()
 for filename in ['03-post.sql.readonly','04-rollback-deny.sql.review','05-post-rollback.sql.readonly','06-reinstall-closed.sql.review','03-post.sql.readonly']:
  r=d.raw((H/filename).read_text());check(filename+' bytes exatos',r.returncode==0,dict(sha256=hashlib.sha256((H/filename).read_bytes()).hexdigest(),stderr=r.stderr))
 check('rollback/reinstalação preservam todo histórico financeiro e físico',before==history())
 check('reinstalação não reabre gate',d.last('select enabled from platform_private.b2b_cancel_policy_gate_v1')=='f')
 check('helpers privados continuam sem EXECUTE cliente',d.last("select NOT has_function_privilege('authenticated','platform_private.b2b_cancel_confirmed_fiscal_v1(uuid)','EXECUTE') AND NOT has_function_privilege('service_role','platform_private.b2b_cancel_confirmed_fiscal_v1(uuid)','EXECUTE')")=='t')
 order=d.last("select partner_order_id from fiscal_invoices where id='00000000-0000-0000-0000-000000000900'")
 check('fixture física existente é entrega 1+1 real',d.last(f"select count(*)=2 AND sum(quantidade_entregue)=2 AND bool_and(status::text='entregue' AND quantidade_entregue=1) from entregas where partner_order_id='{order}'")=='t')
 r=d.raw(f"SET ROLE authenticated;SET request.jwt.claim.sub='00000000-0000-0000-0000-000000000030';SET request.jwt.claims='{{\"sub\":\"00000000-0000-0000-0000-000000000030\",\"role\":\"authenticated\",\"iat\":1}}';SELECT rpc_b2b_cancel_residual_capability_v1('{order}');")
 check('capacidade após reinstalação fechada opaca',r.returncode==0 and json.loads(r.stdout.strip().splitlines()[-1])=={'available':False})
except Exception as e:check('harness',False,repr(e))
(out/'checks.json').write_text(json.dumps(rows,indent=2)+'\n');code=int(any(x['status']=='FAIL' for x in rows));(out/'exitcode').write_text(str(code));print(out);sys.exit(code)