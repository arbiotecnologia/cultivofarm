"""Runs candidate bodies on disposable PostgreSQL; no hosted writes or JWT claim."""
from pathlib import Path
import runpy
H=Path(__file__).resolve().parent
# Reuse the existing actual lifecycle/concurrent-CAS suite and schema, extending
# setup with actual readers. No policy or security predicate rewritten.
s=(H.parent/'test_sql.py').read_text()
s=s.replace("HERE=Path(__file__).resolve().parent",f"HERE=Path({str(H.parent)!r})")
inject="""
 sql('ALTER TABLE public.partner_accounts ADD COLUMN codigo text DEFAULT \'P\', ADD COLUMN razao_social text DEFAULT \'Partner\', ADD COLUMN nome_fantasia text; CREATE TABLE public.user_access_preferences(user_id uuid PRIMARY KEY,preferred_context text,last_context text,skip_context_selector boolean,updated_at timestamptz); CREATE TABLE public.user_context_access_logs(user_id uuid,context_code text,action text,previous_context text,metadata jsonb); CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql AS $$SELECT unnest(ARRAY[\'catalogo_precos\',\'fichas_tecnicas\'])$$;')
 sql(Path(H/'readers.assembled.sql.review').read_text())
"""
# Use repr to avoid embedding escaped SQL string mistakes.
inject="\n sql("+repr("ALTER TABLE public.partner_accounts ADD COLUMN codigo text DEFAULT 'P', ADD COLUMN razao_social text DEFAULT 'Partner', ADD COLUMN nome_fantasia text; CREATE TABLE public.user_access_preferences(user_id uuid PRIMARY KEY,preferred_context text,last_context text,skip_context_selector boolean,updated_at timestamptz); CREATE TABLE public.user_context_access_logs(user_id uuid,context_code text,action text,previous_context text,metadata jsonb); CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql AS $$SELECT unnest(ARRAY['catalogo_precos','fichas_tecnicas'])$$;")+ ")\n sql((H/'readers.assembled.sql.review').read_text())\n"
s=s.replace(" deny('producer needs real client/property'",inject+" deny('producer needs real client/property'",1)
s=s.replace(" check('legacy validator unchanged',\"SELECT public.is_valid_b2b_partner_user(NULL,NULL);\",'f')", " check('null identity stays denied',\"SELECT public.is_valid_b2b_partner_user(NULL,NULL);\",'f')")
extra="""
 check('cumulative chain reader valid',f"SELECT public.is_valid_b2b_partner_user('{USER}','{P}');")
 check('technical operation allowed for residual technician',f"SELECT public.has_role('{USER}','parceiro_b2b_tecnico') AND NOT public.has_role('{USER}','parceiro_b2b');")
 sql(f"CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '{USER}'::uuid$$;")
 check('residual contexts preserve technician producer only',"SELECT (public.get_my_available_portal_contexts()->'available_contexts') @> '[\\\"technical\\\",\\\"producer\\\"]'::jsonb AND NOT (public.get_my_available_portal_contexts()->'available_contexts' ? 'b2b');")
 check('technician cannot see financial operation',f"SELECT NOT platform_private.b2b_phase1_partner_visible('{P}',false);")
 sql(f"UPDATE partner_users SET valid_from=now()+interval '1 day' WHERE user_id='{USER}';")
 check('future partner link blocked',f"SELECT NOT public.is_valid_b2b_partner_user('{USER}','{P}');")
 check('future link preserves independent producer',"SELECT public.get_my_available_portal_contexts()->'available_contexts'='[\\\"producer\\\"]'::jsonb;")
 sql(f"UPDATE partner_users SET valid_from=now()-interval '1 day',revoked_at=now() WHERE user_id='{USER}';")
 check('total partner revoke blocks chain',f"SELECT NOT public.is_valid_b2b_partner_user('{USER}','{P}');")
 sql(f"UPDATE partner_users SET revoked_at=NULL WHERE user_id='{USER}'; UPDATE profiles SET organization_id='{B}' WHERE user_id='{USER}';")
 check('profile B stale link A blocked',f"SELECT NOT public.is_valid_b2b_partner_user('{USER}','{P}');")
 sql(f"UPDATE profiles SET organization_id='{A}' WHERE user_id='{USER}'; UPDATE organizations SET partner_account_id='{Q}' WHERE id='{A}';")
 check('explicit mismatch blocked',f"SELECT NOT public.is_valid_b2b_partner_user('{USER}','{P}');")
 sql(f"UPDATE organizations SET partner_account_id=NULL WHERE id='{A}'; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '{ADMIN}'::uuid$$;")
"""
s=s.replace(' # Two transactions race same CAS;',extra+'\n # Two transactions race same CAS;')
exec(compile(s,str(H/'test_sql.py'),'exec'),{'__file__':str(H/'test_sql.py'),'H':H,'Path':Path})