"""Disposable PostgreSQL only; Auth/helpers/schema reduced, no hosted access."""
from pathlib import Path
import os, subprocess, tempfile, shutil, re
ROOT=Path(__file__).resolve().parents[2]
def main():
 tmp=Path(tempfile.mkdtemp(prefix='external-ab-',dir='/tmp'));tmp.chmod(0o777)
 prefix=['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
 try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p 55489','start'],check=True,capture_output=True)
  runner=(ROOT/'scripts/tests/b2b-partner-real-rls-local.py').read_text()
  sql=runner.split('sql = r"""',1)[1].split('"""',1)[0]
  sql+="CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql AS $$ SELECT 'catalogo_precos'::text $$;"
  sql+='UPDATE public.user_roles SET role=\'administrador\'; DELETE FROM public.partner_users;'
  sql+=(ROOT/'scripts/tests/b2b-provisioning-lifecycle-local.sql').read_text()
  sql+=(ROOT/'scripts/tests/b2b-provisioning-real-triggers.sql').read_text()
  sql+=(ROOT/'scripts/tests/b2b-provisioning-auth-dependencies.sql').read_text()
  sql+="ALTER TABLE public.profiles ADD COLUMN crea text, ADD COLUMN especialidade text; ALTER TABLE public.clientes ADD COLUMN status_cliente text DEFAULT 'ativo', ADD COLUMN updated_at timestamptz DEFAULT now(); ALTER TABLE public.partner_accounts ADD COLUMN updated_at timestamptz DEFAULT now(); ALTER TABLE public.user_clientes ADD COLUMN principal boolean DEFAULT false, ADD COLUMN is_active boolean DEFAULT true, ADD COLUMN assigned_by uuid, ADD COLUMN revoked_at timestamptz;"
  m=(ROOT/'supabase/migrations/20260922160218_b19bd8e6-cb90-4d27-805e-c97272039918.sql').read_text()
  sql+='CREATE OR REPLACE FUNCTION public.admin_provision_user_profile_v1'+m.split('CREATE OR REPLACE FUNCTION public.admin_provision_user_profile_v1',1)[1].split('$function$;',1)[0]+'$function$;'
  sql+=(ROOT/'scripts/rbac-audit/proposed-external-user-ab-closed.sql').read_text()
  sql+=(ROOT/'scripts/tests/external-user-ab-assertions.sql').read_text()
  sql+='ROLLBACK;'
  r=subprocess.run(['psql','-X','-h',str(tmp),'-p','55489','-U','postgres','-v','ON_ERROR_STOP=1'],input=sql,text=True,capture_output=True)
  print(r.stderr);assert r.returncode==0,'candidate failed'
 finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-m','immediate','stop'],capture_output=True);shutil.rmtree(tmp)
if __name__=='__main__': main()
