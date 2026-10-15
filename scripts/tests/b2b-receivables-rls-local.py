"""Effective PostgreSQL RLS before/after; reduced schema and Auth/dependencies simulated.
Never connects to hosted Supabase. Baseline predicates from canonical read-only 2026-10-15.
"""
from pathlib import Path
import os, re, shutil, subprocess, tempfile

ROOT = Path(__file__).resolve().parents[2]

def main():
    tmp = Path(tempfile.mkdtemp(prefix='b2b-ar-rls-', dir='/tmp')); tmp.chmod(0o777)
    prefix = ['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
    started = False
    try:
        subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
        subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55493','start'],check=True,capture_output=True); started=True
        sql = r"""
CREATE ROLE authenticated; CREATE ROLE anon; CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA auth,platform_private TO authenticated,anon;
CREATE TYPE app_role AS ENUM('administrador','gestor','financeiro','gestor_comercial','administrativo','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor');
CREATE TABLE profiles(user_id uuid,organization_id uuid,ativo boolean,senha_provisoria boolean);
CREATE TABLE organizations(id uuid,ativo boolean,status text,partner_account_id uuid);
CREATE TABLE user_roles(user_id uuid,role app_role);
CREATE TABLE partner_users(user_id uuid,partner_id uuid,papel text);
CREATE TABLE partner_accounts(id uuid,commercial_owner_organization_id uuid,ativo boolean,deleted_at timestamptz);
CREATE TABLE user_clientes(user_id uuid,cliente_id uuid,is_active boolean);
CREATE TABLE accounts_receivable(id int,organization_id uuid,partner_id uuid,origin_type text,customer_id uuid);
CREATE TABLE accounts_receivable_installments(id int,organization_id uuid,receivable_id int);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
-- Auth transport, entitlement and producer link dependencies simulated, not JWT evidence.
CREATE FUNCTION platform_private.platform_actor_access_ready(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.ready',true)='true' AND EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND ativo AND NOT senha_provisoria) $$;
CREATE FUNCTION public.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
CREATE FUNCTION platform_private.has_role(uuid,app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT public.has_role($1,$2) AND platform_private.platform_actor_access_ready($1) $$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo IS TRUE WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND platform_private.platform_actor_access_ready(p.user_id) $$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT platform_private.h15_actor_organization() $$;
CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql AS $$ SELECT 'catalogo_precos' WHERE current_setting('test.entitled',true)='true' $$;
CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid,boolean) RETURNS boolean LANGUAGE sql AS $$ SELECT current_setting('test.legacy',true)='true' $$;
CREATE FUNCTION public.get_cliente_ids_for_user(uuid) RETURNS uuid[] LANGUAGE sql SECURITY DEFINER AS $$ SELECT ARRAY(SELECT cliente_id FROM user_clientes WHERE user_id=$1 AND is_active) $$;
CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION platform_private.is_same_tenant_user(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=$1 AND organization_id=platform_private.h15_actor_organization()) $$;
CREATE FUNCTION platform_private.is_tenant_admin_for_user(p_target_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT auth.uid() IS NOT NULL AND public.has_role(auth.uid(),'administrador'::public.app_role) AND NOT public.is_platform_superadmin(auth.uid()) AND NOT public.is_platform_superadmin(p_target_user_id) AND platform_private.is_same_tenant_user(p_target_user_id) $$;
CREATE FUNCTION public.is_financial_staff(uuid) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT platform_private.platform_actor_access_ready($1) AND (has_role($1,'administrador') OR has_role($1,'gestor') OR has_role($1,'financeiro')) $$;
GRANT SELECT ON partner_users,accounts_receivable,accounts_receivable_installments TO authenticated,anon;
ALTER TABLE partner_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant admins can read same organization partner links" ON partner_users FOR SELECT TO authenticated USING(platform_private.is_tenant_admin_for_user(user_id));
ALTER TABLE accounts_receivable ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts_receivable_installments ENABLE ROW LEVEL SECURITY;
CREATE POLICY accounts_receivable_select_financial ON accounts_receivable FOR SELECT TO authenticated USING(is_financial_staff((SELECT auth.uid())));
CREATE POLICY ar_b2b_readers ON accounts_receivable FOR SELECT TO authenticated USING(origin_type='B2B_ORDER' AND (platform_private.has_role((SELECT auth.uid()),'gestor_comercial') OR platform_private.has_role((SELECT auth.uid()),'administrativo')));
CREATE POLICY ar_partner_select_own_b2b ON accounts_receivable FOR SELECT TO authenticated USING(origin_type='B2B_ORDER' AND platform_private.has_role((SELECT auth.uid()),'parceiro_b2b') AND partner_id IN(SELECT pu.partner_id FROM partner_users pu WHERE pu.user_id=(SELECT auth.uid())));
CREATE POLICY ar_producer_read ON accounts_receivable FOR SELECT TO authenticated USING(platform_private.has_role((SELECT auth.uid()),'cliente_produtor') AND customer_id=ANY(get_cliente_ids_for_user((SELECT auth.uid()))) AND partner_id IS NULL AND origin_type IS DISTINCT FROM 'B2B_ORDER');
CREATE POLICY tenant_isolation_d51_5 ON accounts_receivable AS RESTRICTIVE FOR ALL TO authenticated USING(organization_id IS NOT NULL AND organization_id=platform_private.h15_actor_organization()) WITH CHECK(organization_id IS NOT NULL AND organization_id=platform_private.h15_actor_organization());
CREATE POLICY accounts_receivable_installments_select_financial ON accounts_receivable_installments FOR SELECT TO authenticated USING(is_financial_staff((SELECT auth.uid())));
CREATE POLICY ari_b2b_readers ON accounts_receivable_installments FOR SELECT TO authenticated USING((platform_private.has_role((SELECT auth.uid()),'gestor_comercial') OR platform_private.has_role((SELECT auth.uid()),'administrativo')) AND EXISTS(SELECT 1 FROM accounts_receivable ar WHERE ar.id=receivable_id AND ar.origin_type='B2B_ORDER'));
CREATE POLICY ari_partner_select_own_b2b ON accounts_receivable_installments FOR SELECT TO authenticated USING(platform_private.has_role((SELECT auth.uid()),'parceiro_b2b') AND EXISTS(SELECT 1 FROM accounts_receivable ar WHERE ar.id=receivable_id AND ar.origin_type='B2B_ORDER' AND ar.partner_id IN(SELECT pu.partner_id FROM partner_users pu WHERE pu.user_id=(SELECT auth.uid()))));
CREATE POLICY ari_producer_read ON accounts_receivable_installments FOR SELECT TO authenticated USING(platform_private.has_role((SELECT auth.uid()),'cliente_produtor') AND EXISTS(SELECT 1 FROM accounts_receivable ar WHERE ar.id=receivable_id AND ar.customer_id=ANY(get_cliente_ids_for_user((SELECT auth.uid()))) AND ar.partner_id IS NULL AND ar.origin_type IS DISTINCT FROM 'B2B_ORDER'));
CREATE POLICY tenant_isolation_d51_5 ON accounts_receivable_installments AS RESTRICTIVE FOR ALL TO authenticated USING(organization_id IS NOT NULL AND organization_id=platform_private.h15_actor_organization()) WITH CHECK(organization_id IS NOT NULL AND organization_id=platform_private.h15_actor_organization());
"""
        # Existing canonical resolver; omit ACL statements only in this reduced runner.
        context=(ROOT/'scripts/rbac-audit/b2b-commercial-context.sql').read_text().split('REVOKE ALL',1)[0]
        sql+=context
        sql+=r"""
CREATE FUNCTION pg_temp.check_read(label text,expected int[]) RETURNS void LANGUAGE plpgsql AS $$ DECLARE a int[]; b int[]; BEGIN SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO a FROM accounts_receivable; SELECT coalesce(array_agg(id ORDER BY id),'{}') INTO b FROM accounts_receivable_installments; IF a IS DISTINCT FROM expected OR b IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FAIL % titles=% installments=% expected=%',label,a,b,expected; END IF; RAISE NOTICE 'PASS %',label; END $$;
CREATE FUNCTION pg_temp.assert_true(label text,result boolean) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF result IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
INSERT INTO organizations VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,'ativa',NULL),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,'ativa',NULL);
INSERT INTO profiles VALUES('44444444-4444-4444-8444-444444444444','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,false);
INSERT INTO user_roles VALUES('44444444-4444-4444-8444-444444444444','parceiro_b2b');
INSERT INTO partner_accounts VALUES('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,NULL),('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true,NULL),('33333333-3333-4333-8333-333333333333','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',true,NULL);
INSERT INTO partner_users VALUES('44444444-4444-4444-8444-444444444444','11111111-1111-4111-8111-111111111111','gestor');
INSERT INTO accounts_receivable VALUES(1,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','B2B_ORDER',NULL),(2,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','22222222-2222-4222-8222-222222222222','B2B_ORDER',NULL),(3,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','33333333-3333-4333-8333-333333333333','B2B_ORDER',NULL),(4,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,NULL,'55555555-5555-4555-8555-555555555555'),(5,NULL,'11111111-1111-4111-8111-111111111111','B2B_ORDER',NULL),(6,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','B2B_ORDER',NULL);
INSERT INTO accounts_receivable_installments SELECT id,organization_id,id FROM accounts_receivable;
INSERT INTO accounts_receivable_installments VALUES(7,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',999),(8,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',3),(9,'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',1);
INSERT INTO user_clientes VALUES('44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555',true);
SELECT set_config('test.uid','44444444-4444-4444-8444-444444444444',false),set_config('test.ready','true',false),set_config('test.entitled','true',false),set_config('test.legacy','false',false);
SET ROLE authenticated;
SELECT pg_temp.assert_true('baseline self partner_users hidden',(SELECT count(*) FROM partner_users)=0);
SELECT pg_temp.assert_true('baseline coherent context exists',platform_private.b2b_commercial_context()->>'partner_id'='11111111-1111-4111-8111-111111111111');
SELECT pg_temp.check_read('baseline functional failure titles and installments empty','{}');
RESET ROLE;
"""
        candidate=ROOT/'scripts/rbac-audit/proposed-b2b-receivables-read.sql'
        if candidate.exists():
            sql+=re.sub(r'DO \$baseline\$.*?\$baseline\$;', '', candidate.read_text(), flags=re.S)
            sql+="SET ROLE authenticated; SELECT pg_temp.check_read('own only sibling foreign NULL forged child excluded',ARRAY[1]); SELECT pg_temp.assert_true('partner_users remains hidden',(SELECT count(*) FROM partner_users)=0); RESET ROLE;"
            cases=[('UPDATE profiles SET ativo=false','inactive'),('UPDATE profiles SET senha_provisoria=true','provisional'),("SELECT set_config('test.ready','false',false)",'unready'),("SELECT set_config('test.entitled','false',false)",'entitlement revoked'),("UPDATE partner_users SET papel='tecnico'",'role link mismatch'),('UPDATE partner_accounts SET ativo=false','partner inactive'),('UPDATE partner_accounts SET commercial_owner_organization_id=NULL','owner NULL'),("UPDATE partner_accounts SET commercial_owner_organization_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'",'owner crossed'),("UPDATE user_roles SET role='parceiro_b2b_tecnico'; UPDATE partner_users SET papel='tecnico'",'technical denied'),("INSERT INTO partner_users VALUES(auth.uid(),'22222222-2222-4222-8222-222222222222','gestor')",'duplicate link'),('DELETE FROM partner_users','revoked link')]
            for mutate,label in cases:
                sql+=f"BEGIN; {mutate}; SET LOCAL ROLE authenticated; SELECT pg_temp.check_read('{label}','{{}}'); ROLLBACK;"
            sql+="BEGIN; UPDATE partner_users SET partner_id='22222222-2222-4222-8222-222222222222'; SET LOCAL ROLE authenticated; SELECT pg_temp.check_read('switch sibling own only',ARRAY[2]); ROLLBACK;"
            sql+="BEGIN; UPDATE user_roles SET role='cliente_produtor'; SET LOCAL ROLE authenticated; SELECT pg_temp.check_read('producer separation unchanged',ARRAY[4]); RESET ROLE; UPDATE user_clientes SET is_active=false; SET LOCAL ROLE authenticated; SELECT pg_temp.check_read('producer revoked','{}'); ROLLBACK;"
            sql+="SET ROLE anon; SELECT pg_temp.check_read('anonymous empty','{}'); RESET ROLE;"
        run=subprocess.run(['psql','-X','-h',str(tmp),'-p','55493','-U','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
        print(run.stderr); assert run.returncode==0
    finally:
        if started: subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True)
        shutil.rmtree(tmp)

if __name__=='__main__': main()