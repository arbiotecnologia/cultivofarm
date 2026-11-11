"""Mede no espelho composto (PostgreSQL descartável) os seis corpos conferidos pelo auditor. Sem acesso hospedado."""
import json,os,shutil,subprocess,sys,tempfile
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
SIGS={"public.c2_internal_order_entry_capability_v1()":"e2619c71becfebf38c8d03562ff11ce2",
"public.create_partner_order_condition_secure(uuid,text,jsonb,date,uuid,text,text,jsonb)":"e86385fefb25c68d9dd4d0fef6619f27",
"public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)":"fe82f5381d426136f2627803f3b0005d",
"platform_private.b2b_internal_commercial_actor()":"6555396c4f8fe914177d2ccfc3891279",
"platform_private.c2_internal_order_target_reason(uuid,uuid)":"07d7c9002cbfe17497c9ee4a92d5a928",
"public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)":"97bcdb9884b54adb3bd4aae4915e32d0"}
def main():
    assert not os.environ.get('PGHOST'),'HOSTED_PG_ENV_REFUSED'
    out=H/'evidence'/'measure';out.mkdir(parents=True,exist_ok=True)
    work=Path(tempfile.mkdtemp(prefix='vendedor-measure-',dir='/tmp'));mirror=work/'project';mirror.mkdir()
    shutil.copytree(ROOT/'scripts',mirror/'scripts',ignore=shutil.ignore_patterns('__pycache__','.git'))
    fixture=mirror/'scripts/b2b-solid-packaging-order-20261106/test-local-pg.py'
    t=fixture.read_text();a='A, F = u(1), u(2)';assert t.count(a)==1
    fixture.write_text(t.replace(a,"A, F = '007bb519-cba0-4704-be2c-cb93ad010048', u(2)"))
    driver=mirror/'scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/compose_current.py'
    t=driver.read_text();a="  if os.environ.get('NEW_E2E_LINKED_APPROVAL')=='1':";assert t.count(a)==1
    blk="""  if os.environ.get('VENDEDOR_MEASURE')=='1':
   import json as _j
   res={}
   for sig in %r:
    d=B.run_raw("SELECT pg_get_functiondef('"+sig+"'::regprocedure);")
    body=d.stdout if d.returncode==0 else None
    res[sig]=dict(md5=B.last("SELECT md5(pg_get_functiondef('"+sig+"'::regprocedure));") if d.returncode==0 else None,error=None if d.returncode==0 else d.stderr[-300:])
    if body is not None: (Path(OUT)/(sig.replace('(','_').replace(')','').replace(',','_')+'.sql')).write_text(B.sql("SELECT pg_get_functiondef('"+sig+"'::regprocedure);"))
   (Path(OUT)/'measured.json').write_text(_j.dumps(res,indent=2)+'\\n')
   return 0
""" % (list(SIGS),)
    driver.write_text(t.replace(a,blk+a))
    pg=next(Path('/nix/store').glob('*-postgresql-17.11/bin'))
    env={**os.environ,'PATH':str(pg)+':'+os.environ['PATH'],'NEW_E2E_OUT':str(out),'VENDEDOR_MEASURE':'1'}
    r=subprocess.run([sys.executable,str(driver)],cwd=mirror,env=env,capture_output=True,text=True,timeout=560)
    (out/'run.stdout.txt').write_text(r.stdout);(out/'run.stderr.txt').write_text(r.stderr)
    m=json.loads((out/'measured.json').read_text()) if (out/'measured.json').exists() else {}
    cmp={s:dict(expected=e,measured=(m.get(s) or {}).get('md5'),match=(m.get(s) or {}).get('md5')==e) for s,e in SIGS.items()}
    (out/'comparison.json').write_text(json.dumps(cmp,indent=2)+'\n');print(json.dumps(cmp,indent=1));print(r.stderr[-1500:]);return r.returncode
if __name__=='__main__':sys.exit(main())
