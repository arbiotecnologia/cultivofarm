"""Full SQL command failures in disposable PostgreSQL; no slicing of DDL."""
import importlib.util
spec=importlib.util.spec_from_file_location('external_delimiters',H.parent.parent/'receipt-lock-order-review/assemble.py')
assembly=importlib.util.module_from_spec(spec);spec.loader.exec_module(assembly)
def catalog_state():
 return pg.sql("SELECT md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,'')||proowner::text,'|' ORDER BY oid)) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace)")
def command(name,fail=False):
 lines=list(assembly.external_lines((H/name).read_text()))
 controls=[line.strip().upper() for line,outside in lines if outside and assembly.DELIMITER.fullmatch(line)]
 assert controls==[('BEGIN READ ONLY;' if name in ('preflight.sql','postflight.sql') else 'BEGIN;'),'COMMIT;'],controls
 before=catalog_state();wrapper_before=pg.sql("SELECT md5(pg_get_functiondef('public.generate_b2b_receivable_secure(uuid)'::regprocedure))");out=[];count=0
 for line,outside in lines:
  if outside and (line.startswith('DO ') or line.startswith('CREATE ') or line.startswith('ALTER TABLE')):
   out.append("DO $trace$ BEGIN RAISE NOTICE 'ATOMIC_XID:%',txid_current(); END $trace$;\n");count+=1
  if outside and line.strip()=='COMMIT;' and fail:
   out.append("DO $fail$ BEGIN RAISE EXCEPTION 'DELIBERATE_POST_FAILURE' USING ERRCODE='P0001'; END $fail$;\n")
  out.append(line)
 process=pg.popen('');process.stdin.write(''.join(out));process.stdin.close()
 stdout=process.stdout.read();stderr=process.stderr.read();process.wait(timeout=30)
 ids=re.findall(r'ATOMIC_XID:(\d+)',stderr)
 assert len(ids)==count and len(set(ids))==1,(name,ids,stderr[-2000:])
 if fail:
  assert process.returncode!=0 and 'DELIBERATE_POST_FAILURE' in stderr,stderr[-2000:]
  assert catalog_state()==before,'partial DDL/owner/ACL committed'
   assert pg.sql("SELECT md5(pg_get_functiondef('public.generate_b2b_receivable_secure(uuid)'::regprocedure))")==wrapper_before,'wrapper changed on failed POST'
 else: assert process.returncode==0,stderr[-2000:]
 ok('complete '+name+(' failing POST preserves catalog' if fail else ' one transaction'))