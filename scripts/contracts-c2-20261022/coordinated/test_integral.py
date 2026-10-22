"""One database chain: actual assembled readers/provisioning/lifecycle + rollback.
Synthetic Auth/reduced schema; does not bypass production drift guards in installation.
"""
from pathlib import Path
H=Path(__file__).resolve().parent
s=(H/'test_provisioning.py').read_text()
s=s.replace("sql+=(H/'provisioning.sql.review').read_text()", """
 sql+="ALTER TABLE public.partner_accounts ADD COLUMN codigo text DEFAULT 'P', ADD COLUMN razao_social text DEFAULT 'Partner', ADD COLUMN nome_fantasia text; ALTER TABLE public.partner_users ADD COLUMN revoked_by uuid, ADD COLUMN revoke_reason text; CREATE TABLE public.user_access_preferences(user_id uuid PRIMARY KEY,preferred_context text,last_context text,skip_context_selector boolean,updated_at timestamptz); CREATE TABLE public.user_context_access_logs(user_id uuid,context_code text,action text,previous_context text,metadata jsonb); CREATE TABLE public.partner_audit_logs(id uuid DEFAULT gen_random_uuid(),partner_id uuid,usuario_id uuid,acao text,dados_anteriores jsonb,dados_novos jsonb,created_at timestamptz DEFAULT now()); ALTER TABLE public.user_clientes ADD COLUMN valid_until timestamptz;"
 sql+=(H/'readers.assembled.sql.review').read_text()
 sql+=(H/'provisioning.sql.review').read_text()
 lifecycle=(H.parent/'candidate.sql.review').read_text()
 sql+=lifecycle[lifecycle.index('CREATE FUNCTION platform_private.c2_partner_lifecycle'):].removesuffix('COMMIT;\\n')
 """)
# Column already included by base setup extension.
s=s.replace(' ALTER TABLE public.user_clientes ADD COLUMN valid_until timestamptz;', '')
# Before output, real joined resolver read, then execute exact rollback and ACL.
s=s.replace(" print(f'PASS {len(checks)}", """
 run(f"UPDATE public.profiles SET senha_provisoria=false WHERE user_id='{a['user_id']}';")
 check('joined reader after claim finish actual triggers',f"SELECT public.is_valid_b2b_partner_user('{a['user_id']}','{partner}');")
 run((H/'rollback-family.sql.review').read_text())
 for sig in ['public.link_partner_user(uuid,uuid,text[],text,text,uuid,text)','platform_private.c2_partner_lifecycle(uuid,uuid,text[],text,text,uuid,text)','public.b2b_claim_provisioning(uuid,uuid,text,text,public.app_role[],uuid[],uuid)','public.b2b_finish_provisioning(uuid,uuid,uuid)']:
  for who in ['anon','authenticated','service_role']:
   check('rollback ACL '+sig+' '+who,f"SELECT NOT has_function_privilege('{who}','{sig}','EXECUTE');")
 check('rollback preserves residual roles',f"SELECT count(*)=2 FROM public.user_roles WHERE user_id='{a['user_id']}';")
 check('rollback context closed',f"SELECT NOT public.is_valid_b2b_partner_user('{a['user_id']}','{partner}');")
 print(f'PASS {len(checks)}""")
exec(compile(s,str(H/'test_provisioning.py'),'exec'),{'__file__':str(H/'test_provisioning.py'),'Path':Path})
