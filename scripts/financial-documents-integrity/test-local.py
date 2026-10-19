"""Disposable PG 17 in /tmp only. Full candidate/rollback, exact financial bodies.
Auth uid/jwt/foldername, reduced source tables/parent RLS and producer membership
are declared stubs. Claims with current iat are not signed JWT or browser login.
Never connects to hosted Supabase; never regenerates fixed goldens.
"""
from pathlib import Path
import subprocess, tempfile, os, json, hashlib

HERE = Path(__file__).resolve().parent
ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
UID_A = '11111111-1111-4111-8111-111111111111'
UID_B = '22222222-2222-4222-8222-222222222222'
PARENTS = [('RECEIVABLE','accounts_receivable'),('PAYABLE','accounts_payable'),('DELIVERY','entregas'),('FISCAL_INVOICE','fiscal_invoices'),('PAYMENT_RECEIVABLE','receivable_payments'),('PAYMENT_PAYABLE','payable_payments'),('FINANCIAL_RECEIPT','financial_receipts'),('REPORT_EXPORT','financial_report_exports')]

def parent(i, variant=1):
    return f'{i+1:08d}-0000-4000-8000-{variant:012d}'

def actor(uid):
    return f"RESET ROLE; SELECT set_config('request.jwt.claims',jsonb_build_object('sub','{uid}','role','authenticated','iat',floor(extract(epoch FROM clock_timestamp())))::text,false); SET ROLE authenticated;"

def insert(i, variant=1, author=UID_A, org=None, path=None):
    typ = PARENTS[i][0]; oid = parent(i,variant)
    locator = path or (f'{ORG_A}/generated/file.pdf' if i >= 6 else f'{typ}/{oid}/file.txt')
    return f"INSERT INTO public.financial_documents(owner_type,owner_id,document_type,file_name,storage_path,uploaded_by,organization_id) VALUES('{typ}','{oid}','OTHER','file.txt','{locator}','{author}',{'NULL' if org is None else repr(org)})"

def ok(label, expr):
    return f"SELECT pg_temp.ok('{label}',({expr}));\n"

def err(label, sql, code='42501'):
    return f"SELECT pg_temp.err('{label}',$q${sql}$q$,'{code}');\n"

def main():
    manifest = json.loads((HERE/'manifest.json').read_bytes().decode('utf-8'))
    tmp = Path(tempfile.mkdtemp(prefix='findocs-integrity-',dir='/tmp')); tmp.chmod(0o777)
    prefix = ['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid() == 0 else []
    cmd = ['psql','-X','-h',str(tmp),'-p','55484','-U','postgres','-v','ON_ERROR_STOP=1']
    passed = 0
    def run(sql=None,file=None,success=True):
        result = subprocess.run(cmd+(['-f',str(file)] if file else []),input=sql,text=True,capture_output=True)
        (tmp/'last-output.log').write_text(result.stdout+result.stderr,encoding='utf-8')
        if (result.returncode == 0) != success:
            raise RuntimeError(result.stdout[-2000:]+result.stderr[-5000:])
        nonlocal passed
        passed += result.stderr.count('NOTICE:  PASS ')
        return result
    def snap():
        return run(sql="SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_array(oid::regprocedure::text,md5(pg_get_functiondef(oid)),proacl::text,proconfig,pg_get_userbyid(proowner)) ORDER BY oid::regprocedure::text) FROM pg_proc WHERE pronamespace IN ('public'::regnamespace,'platform_private'::regnamespace)), 'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.financial_documents'::regclass AND NOT tgisinternal));").stdout
    try:
        subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'server.log'),'-o',f'-k {tmp} -h "" -p 55484','start'],check=True,capture_output=True)
        for f in ['local-setup.sql','baseline-functions.sql','local-baseline.sql']:
            run(file=HERE/f)
        # Every captured financial/auth function must match immutable live MD5/ACL/config/owner.
        run(file=HERE/'contracts-guard.sql.review'); run(file=HERE/'preflight.sql.review')
        baseline = snap()
        sql = f"INSERT INTO public.organizations(id) VALUES('{ORG_A}'),('{ORG_B}'); INSERT INTO public.profiles(user_id,organization_id) VALUES('{UID_A}','{ORG_A}'),('{UID_B}','{ORG_B}'); INSERT INTO public.user_roles VALUES('{UID_A}','financeiro'),('{UID_B}','administrador'); INSERT INTO public.platform_org_admin_invites VALUES('{UID_B}','done',now()-interval '1 minute');"
        for i,(typ,table) in enumerate(PARENTS):
            for variant,org in [(1,ORG_A),(2,ORG_B),(3,None)]:
                bucket = 'financial-receipts' if i == 6 else 'financial-reports'
                locator = f"{org or ORG_A}/generated/file.pdf"
                sql += f"INSERT INTO public.{table}(id,organization_id,storage_bucket,storage_path) VALUES('{parent(i,variant)}',{'NULL' if org is None else repr(org)},'{bucket}','{locator}');"
        run(sql=sql)
        # Reproduce the reported defect on unmodified baseline, then roll it back.
        reproduction = actor(UID_B)+"BEGIN;"+insert(0,author=UID_B)+"; SELECT organization_id FROM public.financial_documents; ROLLBACK;"
        result = run(sql=reproduction)
        assert ORG_B in result.stdout, 'baseline must reproduce orgB with ownerA'
        passed += 1
        run(sql='RESET ROLE;')
        # Drift rejection includes adulterated function in before/after snapshots.
        run(sql="CREATE OR REPLACE FUNCTION public.storage1_path_strict(p_name text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path TO '' AS $$SELECT false$$;")
        drift = snap(); run(file=HERE/'candidate.sql.review',success=False); assert snap() == drift; passed += 1
        run(file=HERE/'baseline-functions.sql')
        assert snap() == baseline; passed += 1
        run(file=HERE/'candidate.sql.review'); run(file=HERE/'postflight.sql.review')
        installed = snap()
        run(file=HERE/'candidate.sql.review',success=False); assert snap() == installed; passed += 1
        sql = """CREATE FUNCTION pg_temp.ok(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END$$;
CREATE FUNCTION pg_temp.err(label text,q text,c text) RETURNS void LANGUAGE plpgsql AS $$DECLARE got text; BEGIN BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS got=RETURNED_SQLSTATE; IF got=c THEN RAISE NOTICE 'PASS %',label; RETURN; END IF; RAISE EXCEPTION 'FAIL % code %',label,got; END; RAISE EXCEPTION 'FAIL % no error',label; END$$;
"""
        sql += actor(UID_A)+ok('current iat h15 A',f"public.h15_actor_organization()='{ORG_A}'")
        for i,(typ,table) in enumerate(PARENTS):
            sql += insert(i)+ ';'
            sql += ok(typ+' valid insert',f"EXISTS(SELECT 1 FROM public.financial_documents WHERE owner_type='{typ}' AND owner_id='{parent(i)}' AND organization_id='{ORG_A}')")
            sql += err(typ+' foreign parent',insert(i,2))
            sql += err(typ+' parent NULL org',insert(i,3))
            sql += err(typ+' absent parent',insert(i,4))
            sql += err(typ+' spoof uploaded_by',insert(i,author=UID_B))
            sql += err(typ+' wrong path',insert(i,path='wrong/owner/file.txt'))
            sql += err(typ+' traversal',insert(i,path=f'{typ}/{parent(i)}/../file.txt'))
            sql += err(typ+' reparent',f"UPDATE public.financial_documents SET owner_id='{parent(i,2)}' WHERE owner_type='{typ}'")
            sql += err(typ+' author mutation',f"UPDATE public.financial_documents SET uploaded_by='{UID_B}' WHERE owner_type='{typ}'")
            sql += err(typ+' tenant mutation',f"UPDATE public.financial_documents SET organization_id='{ORG_B}' WHERE owner_type='{typ}'")
            sql += f"UPDATE public.financial_documents SET file_name='renamed.txt' WHERE owner_type='{typ}';"
            sql += ok(typ+' same owner update',f"EXISTS(SELECT 1 FROM public.financial_documents WHERE owner_type='{typ}' AND file_name='renamed.txt')")
            sql += f"DELETE FROM public.financial_documents WHERE owner_type='{typ}';"
            sql += ok(typ+' hard delete denied RLS zero rows',f"EXISTS(SELECT 1 FROM public.financial_documents WHERE owner_type='{typ}')")
            if i < 6:
                sql += ok(typ+' Storage unchanged',f"public.financial_storage_object_permitted('financial-docs','{typ}/{parent(i)}/file.txt') IS {'FALSE' if typ=='DELIVERY' else 'TRUE'}")
            sql += f"SELECT public.rpc_financial_document_soft_delete((SELECT id FROM public.financial_documents WHERE owner_type='{typ}' LIMIT 1),'auditoria local');"
            sql += ok(typ+' tombstone not visible',f"NOT EXISTS(SELECT 1 FROM public.financial_documents WHERE owner_type='{typ}')")
            sql += "RESET ROLE;"+ok(typ+' canonical tombstone persisted',f"EXISTS(SELECT 1 FROM public.financial_documents WHERE owner_type='{typ}' AND deleted_at IS NOT NULL AND deleted_by='{UID_A}')")+actor(UID_A)
        sql += actor(UID_B)+ok('admin B current iat ready',f"public.h15_actor_organization()='{ORG_B}'")+err('reported admin B foreign owner exploit',insert(0,author=UID_B))
        sql += "RESET ROLE; SELECT set_config('request.jwt.claims',jsonb_build_object('sub','"+UID_B+"','role','authenticated','iat',0)::text,false); SET ROLE authenticated;"+ok('iat0 fails readiness','public.h15_actor_organization() IS NULL')+err('iat0 denies insert',insert(0,2,author=UID_B))
        sql += actor(UID_A)+err('unsupported owner',"INSERT INTO public.financial_documents(owner_type,owner_id,document_type,file_name,storage_path,uploaded_by) VALUES('UNKNOWN','"+parent(0)+"','OTHER','file.txt','x/y/z','"+UID_A+"')")
        sql += 'RESET ROLE;'+f"UPDATE public.profiles SET ativo=false WHERE user_id='{UID_A}';"+actor(UID_A)+err('inactive actor denied',insert(0))
        sql += 'RESET ROLE;'+f"UPDATE public.profiles SET ativo=true WHERE user_id='{UID_A}'; DELETE FROM public.user_roles WHERE user_id='{UID_A}';"+actor(UID_A)+err('role removed denied',insert(0))
        sql += 'RESET ROLE;'+f"INSERT INTO public.user_roles VALUES('{UID_A}','financeiro');"
        # Service no-UID is DB role proof, not caller-supplied JWT role.
        sql += "SELECT set_config('request.jwt.claims','{}',false); SET ROLE service_role;"
        for i,(typ,_) in enumerate(PARENTS):
            sql += insert(i,org=ORG_A)+';'+ok(typ+' service valid',f"EXISTS(SELECT 1 FROM public.financial_documents WHERE owner_type='{typ}' AND deleted_at IS NULL)")
            sql += err(typ+' service foreign parent',insert(i,2,org=ORG_A))
            sql += err(typ+' service NULL tenant',insert(i))
            sql += err(typ+' service NULL parent',insert(i,3,org=ORG_A))
        sql += "RESET ROLE; SET ROLE anon;"+err('anon no UID denied',insert(0,org=ORG_A))+"RESET ROLE;"
        # Legacy path compatibility only for unchanged canonical tombstone, not new writes.
        sql += "DROP TRIGGER zz_financial_document_integrity ON public.financial_documents;"+insert(0,org=ORG_A,path=f'{ORG_A}/RECEIVABLE/{parent(0)}/legacy.txt')+';'
        sql += "CREATE TRIGGER zz_financial_document_integrity BEFORE INSERT OR UPDATE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.guard_financial_document_integrity();"
        sql += actor(UID_A)+"SELECT public.rpc_financial_document_soft_delete((SELECT id FROM public.financial_documents WHERE storage_path LIKE '%/legacy.txt'),'legado local');"
        sql += ok('valid legacy locator softdelete without reparent','NOT EXISTS(SELECT 1 FROM public.financial_documents WHERE storage_path LIKE \'%/legacy.txt\')')
        sql += 'RESET ROLE; DROP TRIGGER zz_financial_document_integrity ON public.financial_documents; ALTER TABLE public.financial_documents DISABLE TRIGGER tenant_organization_guard;'+insert(0,path=f'RECEIVABLE/{parent(0)}/null-legacy.txt')+'; ALTER TABLE public.financial_documents ENABLE TRIGGER tenant_organization_guard;'
        sql += "CREATE TRIGGER zz_financial_document_integrity BEFORE INSERT OR UPDATE ON public.financial_documents FOR EACH ROW EXECUTE FUNCTION public.guard_financial_document_integrity();"
        sql += actor(UID_A)+ok('NULL legacy invisible',"NOT EXISTS(SELECT 1 FROM public.financial_documents WHERE storage_path LIKE '%null-legacy.txt')")
        sql += err('canonical softdelete NULL legacy denied',"SELECT public.rpc_financial_document_soft_delete((SELECT id FROM public.financial_documents WHERE storage_path LIKE '%null-legacy.txt'),'local')",'22023')
        sql += 'RESET ROLE;'
        run(sql=sql)
        # Rollback refuses exact post drift; no collateral change.
        run(sql="ALTER FUNCTION public.guard_financial_document_integrity() SET search_path='public';")
        bad = snap(); run(file=HERE/'rollback.sql.review',success=False); assert snap() == bad; passed += 1
        run(sql="ALTER FUNCTION public.guard_financial_document_integrity() SET search_path='';")
        assert snap() == installed; passed += 1
        run(file=HERE/'rollback.sql.review'); assert snap() == baseline; passed += 1
        # Inject POST failure into temporary full script (original and goldens unchanged).
        source = (HERE/'candidate.sql.review').read_bytes(); broken = tmp/'post-failure.sql'
        broken.write_bytes(source.replace(b'acad7f5119cd53c52a0d9383ff24e0a2',b'00000000000000000000000000000000'))
        run(file=broken,success=False); assert snap() == baseline; passed += 1
        run(file=HERE/'rollback.sql.review',success=False); assert snap() == baseline; passed += 1
        assert manifest['function_post_md5'] == 'acad7f5119cd53c52a0d9383ff24e0a2'
        print(json.dumps({'pass_checks':passed,'full_candidate_rollback':True,'local_pg':'17','claims':'synthetic current iat; not login/JWT','tmp':str(tmp)},indent=2))
    finally:
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)

if __name__ == '__main__':
    main()