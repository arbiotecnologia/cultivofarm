"""Separate inactive one-function overlay; never rewrite frozen candidate files."""
import hashlib,json
from pathlib import Path
import generate as G
H=Path(__file__).resolve().parent
SIG='public.rpc_b2b_cancel_residual_capability_v1(uuid)'
def generate():
 out=H/'production-normalization';out.mkdir(exist_ok=True)
 original=G.definition((G.C/'candidate.sql').read_text(),'public.rpc_b2b_cancel_residual_capability_v1')
 anchor="'aprovado_previsto','faturado_parcial'"
 if original.count(anchor)!=1:raise ValueError('EXACT_STATE_ANCHOR_REQUIRED')
 body=original.replace(anchor,"'aguardando_fiscal','faturado_parcial'")
 pin=json.loads((G.C/'capture/post-pins.json').read_text())[SIG]
 guard="""DO $pin$ BEGIN IF (SELECT jsonb_build_object('md5',md5(pg_get_functiondef(oid)),'owner',pg_get_userbyid(proowner),'acl',(SELECT coalesce(jsonb_agg(a::text ORDER BY a::text),'[]'::jsonb) FROM unnest(proacl) a),'config',to_jsonb(proconfig)) FROM pg_proc WHERE oid=to_regprocedure('__SIG__')) IS DISTINCT FROM __PIN__::jsonb THEN RAISE EXCEPTION 'PRODUCTION_NORMALIZATION_PIN_DRIFT'; END IF;END $pin$;
""".replace('__SIG__',SIG).replace('__PIN__',G.quote(json.dumps(pin)))
 head="-- INACTIVE production-candidate overlay; requires exact installed candidate baseline, not homolog.\nBEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';\n"
 (out/'01-pre.sql.readonly').write_text(head+guard+'ROLLBACK;\n')
 # Self-verifiable source pin plus exact pg_get_functiondef pin gets measured in test.
 expected_src=body.split('AS $fn$',1)[1].split('$fn$',1)[0]
 post="DO $post$ BEGIN IF md5((SELECT prosrc FROM pg_proc WHERE oid='"+SIG+"'::regprocedure)) IS DISTINCT FROM '"+hashlib.md5(expected_src.encode()).hexdigest()+"' THEN RAISE EXCEPTION 'NORMALIZATION_SOURCE_DRIFT'; END IF;END $post$;\n"
 (out/'02-install.sql.review').write_text(head+guard+body+post+'COMMIT;\n')
 (out/'03-post.sql.readonly').write_text(head+post+'ROLLBACK;\n')
 (out/'04-rollback-deny.sql.review').write_text(head+post+"REVOKE EXECUTE ON FUNCTION "+SIG+" FROM PUBLIC,anon,authenticated,service_role;\nUPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=false;\nCOMMIT;\n")
 (out/'source.sql').write_text(body)
 (out/'baseline.sql').write_text(original)
 (out/'manifest.json').write_text(json.dumps(dict(inactive=True,scope='ONE_FUNCTION_STATE_NORMALIZATION_ONLY',signature=SIG,pre_pin=pin,source_sha256=hashlib.sha256(body.encode()).hexdigest(),historical_candidate_unchanged=True,hosted=False),indent=2)+'\n')
 return body
if __name__=='__main__':generate()