"""Extract only new closed private foundation; never replace existing writers."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;ROOT=H.parents[2]
F=ROOT/'scripts/b2b-downstream-audit-20261107/b4/fiscal-decision-20261108/service-bridge-current-20261109/forecast-pre-nf-20261109'
C=ROOT/'scripts/b2b-cancellation-policy-20261112'
def section(text,start,end):
 if text.count(start)!=1 or text.count(end)!=1:raise ValueError('EXACT_ANCHOR_REQUIRED')
 return text[text.index(start):text.index(end)]
def generate():
 source=(F/'02-install.sql.review').read_text()
 foundation=section(source,'CREATE TABLE platform_private.b2b_financial_forecasts(', 'CREATE FUNCTION platform_private.b2b_financial_forecast_after_approval_v1(')
 lifecycle=section((F/'06-install-fiscal-reconcile.sql.review').read_text(),'CREATE TABLE platform_private.b2b_forecast_lifecycle_gate_v1(', 'CREATE FUNCTION platform_private.b2b_forecast_lifecycle_scope_v1(')
 # Private core is captured verbatim; no public RPC or business caller is installed.
 core=(C/'capture/cancel_core.sql').read_text()+';\n'
 new_names=['b2b_financial_forecasts','b2b_financial_forecast_events','b2b_forecast_creation_gate_v1','b2b_forecast_creation_allowlist_v1','b2b_forecast_lifecycle_gate_v1','b2b_forecast_lifecycle_allowlist_v1']
 new_functions=['b2b_financial_forecast_events_immutable()','b2b_financial_forecast_guard()','b2b_forecast_creation_scope_v1(uuid,uuid,uuid,uuid)','b2b_forecast_creation_allowed_v1(uuid,uuid,uuid,uuid)','b2b_forecast_lifecycle_scope_v1(text,uuid,uuid,uuid,uuid)','b2b_forecast_lifecycle_allowed_v1(text,uuid,uuid,uuid,uuid)','b2b_financial_forecast_cancel_residual_v1(uuid,integer,text)']
 bodies=foundation+lifecycle+(C/'capture/lifecycle_scope.sql').read_text()+';\n'+(C/'capture/lifecycle_allowed.sql').read_text()+';\n'+core
 signatures=','.join('platform_private.'+n for n in new_functions)
 for n in new_functions:bodies+=f'REVOKE ALL ON FUNCTION platform_private.{n} FROM PUBLIC,anon,authenticated,service_role;\n'
 # psql variables are reviewer catalog pins, never an authorization mechanism.
 # The real target identity guard comes from the existing fiscal marker.
 event_expr="(SELECT md5(coalesce(jsonb_agg(jsonb_build_array(evtname,evtevent,evtenabled,evttags,evtfoid::regprocedure::text,md5(pg_get_functiondef(evtfoid))) ORDER BY evtname COLLATE \"C\")::text,'null')) FROM pg_event_trigger)"
 header="-- HOMOLOG ONLY vrlcdwmlytukrjezrrnf; review-only; psql -v ON_ERROR_STOP=1 -v approved_event_trigger_md5=<MD5 FROM THE SEVEN CAPTURED EVENT TRIGGERS>\n"
 pre="""CREATE TEMP TABLE cancel_homolog_review_pins(event_md5 text) ON COMMIT DROP;
INSERT INTO cancel_homolog_review_pins VALUES (:'approved_event_trigger_md5');
DO $pre$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='vrlcdwmlytukrjezrrnf' AND production_emission_allowed IS FALSE) OR EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref IS DISTINCT FROM 'vrlcdwmlytukrjezrrnf' OR production_emission_allowed IS DISTINCT FROM FALSE) THEN RAISE EXCEPTION 'HOMOLOG_MARKER_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE active) THEN RAISE EXCEPTION 'HOMOLOG_CRON_ACTIVE'; END IF;
 IF (SELECT event_md5 FROM cancel_homolog_review_pins) IS DISTINCT FROM {event_expr} THEN RAISE EXCEPTION 'HOMOLOG_EVENT_TRIGGER_PIN_REQUIRED'; END IF;
 IF (SELECT format_type(atttypid,atttypmod) FROM pg_attribute WHERE attrelid='public.partner_orders'::regclass AND attname='id' AND NOT attisdropped) IS DISTINCT FROM 'uuid' OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.partner_orders'::regclass AND contype='p' AND conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid='public.partner_orders'::regclass AND attname='id')]::smallint[]) THEN RAISE EXCEPTION 'HOMOLOG_ORDER_PARENT_SHAPE'; END IF;
END $pre$;
""".replace('{event_expr}',event_expr)
 pre+='DO $absence$ BEGIN\n'
 for n in new_names:pre+=f"IF to_regclass('platform_private.{n}') IS NOT NULL THEN RAISE EXCEPTION 'STAGE_A_ALREADY_PRESENT:{n}'; END IF;\n"
 for n in new_functions:pre+=f"IF to_regprocedure('platform_private.{n}') IS NOT NULL THEN RAISE EXCEPTION 'STAGE_A_FUNCTION_PRESENT:{n}'; END IF;\n"
 pre+='END $absence$;\n'
 # Public/auth/storage catalog remains exactly identical within this stage.
 fingerprint="""SELECT md5(jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),p.proowner,p.proacl,p.proconfig) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','storage') AND p.prokind='f'),
 'relations',(SELECT jsonb_agg(jsonb_build_array(c.oid,c.relacl,c.relowner,c.relrowsecurity,c.relforcerowsecurity) ORDER BY c.oid) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage')),
 'triggers',(SELECT jsonb_agg(jsonb_build_array(t.oid,t.tgenabled,pg_get_triggerdef(t.oid)) ORDER BY t.oid) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage') AND NOT t.tgisinternal),
 'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','auth','storage')),
 'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY roleid,member) FROM pg_auth_members m))::text) AS fingerprint"""
 invariance='CREATE TEMP TABLE cancel_homolog_before ON COMMIT DROP AS '+fingerprint+';\n'
 invariance_post="DO $unchanged$ DECLARE after_hash text; BEGIN "+fingerprint.replace('SELECT md5','SELECT md5',1).replace(' AS fingerprint',' INTO after_hash')+"; IF after_hash IS DISTINCT FROM (SELECT fingerprint FROM cancel_homolog_before) THEN RAISE EXCEPTION 'EXISTING_CATALOG_CHANGED'; END IF; END $unchanged$;\n"
 post="DO $post$ BEGIN\n"
 for n in new_names:
  post+=f"IF to_regclass('platform_private.{n}') IS NULL OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='platform_private.{n}'::regclass) THEN RAISE EXCEPTION 'STAGE_A_RELATION_INVALID:{n}'; END IF;\n"
  post+=f"IF EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT relacl FROM pg_class WHERE oid='platform_private.{n}'::regclass),acldefault('r',(SELECT relowner FROM pg_class WHERE oid='platform_private.{n}'::regclass)))) WHERE grantee=0 OR grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))) THEN RAISE EXCEPTION 'STAGE_A_TABLE_ACL_OPEN:{n}'; END IF;\n"
 for n in new_functions:
  post+=f"IF to_regprocedure('platform_private.{n}') IS NULL OR EXISTS(SELECT 1 FROM aclexplode(coalesce((SELECT proacl FROM pg_proc WHERE oid='platform_private.{n}'::regprocedure),acldefault('f',(SELECT proowner FROM pg_proc WHERE oid='platform_private.{n}'::regprocedure)))) WHERE grantee=0 OR grantee IN (SELECT oid FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))) THEN RAISE EXCEPTION 'STAGE_A_FUNCTION_ACL_OPEN:{n}'; END IF;\n"
 post+="IF EXISTS(SELECT 1 FROM platform_private.b2b_forecast_creation_gate_v1 WHERE enabled) OR EXISTS(SELECT 1 FROM platform_private.b2b_forecast_lifecycle_gate_v1 WHERE enabled) OR EXISTS(SELECT 1 FROM platform_private.b2b_forecast_creation_allowlist_v1) OR EXISTS(SELECT 1 FROM platform_private.b2b_forecast_lifecycle_allowlist_v1) OR EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecasts) OR EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events) THEN RAISE EXCEPTION 'STAGE_A_NOT_CLOSED_EMPTY'; END IF;\nEND $post$;\n"
 (H/'01a-pre-foundation.sql.review').write_text(header+'BEGIN;SET LOCAL lock_timeout=\'3s\';\n'+pre+'ROLLBACK;\n')
 (H/'01b-install-foundation-closed.sql.review').write_text(header+'BEGIN;SET LOCAL lock_timeout=\'3s\';\n'+pre+invariance+bodies+post+invariance_post+'COMMIT;\n')
 (H/'01c-post-foundation.sql.readonly').write_text('BEGIN READ ONLY;\n'+post+'ROLLBACK;\n')
 rollback="BEGIN;SET LOCAL lock_timeout='3s';\nDO $target$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref='vrlcdwmlytukrjezrrnf' AND production_emission_allowed IS FALSE) OR EXISTS(SELECT 1 FROM public.fiscal_environment_marker WHERE project_ref IS DISTINCT FROM 'vrlcdwmlytukrjezrrnf' OR production_emission_allowed IS DISTINCT FROM FALSE) THEN RAISE EXCEPTION 'HOMOLOG_MARKER_REQUIRED'; END IF; END $target$;\nUPDATE platform_private.b2b_forecast_creation_gate_v1 SET enabled=false;UPDATE platform_private.b2b_forecast_lifecycle_gate_v1 SET enabled=false;\n"
 for n in new_functions:rollback+=f'REVOKE ALL ON FUNCTION platform_private.{n} FROM PUBLIC,anon,authenticated,service_role;\n'
 (H/'01d-rollback-foundation-deny.sql.review').write_text(rollback+'COMMIT;\n')
 (H/'event-trigger-pin.sql.readonly').write_text(event_expr.replace('(SELECT','SELECT',1)[:-1]+';\n')
 manifest=dict(status='PARTIAL_CLOSED_FOUNDATION_ONLY_REVIEW',target='vrlcdwmlytukrjezrrnf',installs=new_names,functions=new_functions,existing_writers_replaced=[],live_actor_flow_verified=False,
 source_sha256={str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [F/'02-install.sql.review',F/'06-install-fiscal-reconcile.sql.review',C/'capture/cancel_core.sql',C/'capture/lifecycle_scope.sql',C/'capture/lifecycle_allowed.sql']},
 prerequisites=['existing homolog fiscal marker exact/off','seven reviewed event trigger catalog MD5 supplied by operator','cron active zero','partner_orders UUID primary key','all new objects absent'])
 (H/'foundation-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print('Fundação privada fechada gerada; zero hooks/GRANT cliente/linhas comerciais.')
if __name__=='__main__':generate()