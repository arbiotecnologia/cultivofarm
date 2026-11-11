"""Preparation-only: serialize event sequence on the invoice before canonical checks."""
import hashlib,json
from pathlib import Path
H=Path(__file__).resolve().parent;D=H/'event-sequence';D.mkdir(exist_ok=True)
SIG='public.rpc_fiscal_event_sefaz_prepare_v1(uuid,text,text,text,uuid)'
pins=json.loads((H/'capture/event-pins.json').read_text());base=(H/'capture/event-prepare.sql').read_text()
anchor=" SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id=_invoice_id AND organization_id=v_actor_org;"
assert base.count(anchor)==1
# The actor/scope check and marker remain before the invoice lock; authority is checked again after the wait.
new=base.replace(anchor,anchor+"\n IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_EVENT_INVOICE_NOT_FOUND' USING ERRCODE='42501'; END IF;\n PERFORM 1 FROM public.fiscal_invoices WHERE id=_invoice_id AND organization_id=v_actor_org FOR UPDATE;\n IF _actor IS DISTINCT FROM auth.uid() OR public.fn_fiscal_can_operate(_actor) IS NOT TRUE OR public.h15_actor_organization() IS DISTINCT FROM v_actor_org THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;\n SELECT * INTO v_inv FROM public.fiscal_invoices WHERE id=_invoice_id AND organization_id=v_actor_org;\n SELECT project_ref,production_emission_allowed INTO v_ref,v_prod FROM public.fiscal_environment_marker LIMIT 1;\n IF v_ref IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' OR coalesce(v_prod,true) THEN RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED'; END IF;")
def guard(expected,label):
 e=json.dumps(expected,separators=(',',':')).replace("'","''")
 return f"DO $guard$ BEGIN IF (SELECT jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',(SELECT coalesce(jsonb_agg(x::text ORDER BY x::text),'[]'::jsonb) FROM unnest(p.proacl)x),'config',to_jsonb(p.proconfig),'secdef',p.prosecdef) FROM pg_proc p WHERE oid=to_regprocedure('{SIG}')) IS DISTINCT FROM '{e}'::jsonb THEN RAISE EXCEPTION '{label}_DRIFT'; END IF; END $guard$;\n"
g=guard(pins,'EVENT_PRE');(D/'candidate.sql').write_text(new)
(D/'01-pre.sql.readonly').write_text('BEGIN READ ONLY;\n'+g+'ROLLBACK;\n');(D/'02-install.sql.review').write_text('BEGIN;\n'+g+new+';COMMIT;\n')
post=H/'capture/event-post-pins.json'
if post.exists():
 pg=guard(json.loads(post.read_text()),'EVENT_POST');(D/'03-post.sql.readonly').write_text('BEGIN READ ONLY;\n'+pg+'ROLLBACK;\n')
 # Deny-only: observed concurrent sequence defect must never be restored.
 (D/'04-rollback-deny.sql.review').write_text('BEGIN;\n'+pg+f'REVOKE EXECUTE ON FUNCTION {SIG} FROM PUBLIC,anon,authenticated,service_role;\nCOMMIT;\n')
(D/'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in sorted(D.glob('*')) if p.is_file() and p.name!='SHA256SUMS'))