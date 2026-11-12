"""Final original-schema delta only; generation is offline and does not contact a DB."""
import hashlib
import json
import runpy
import shutil
import tempfile
from pathlib import Path

H = Path(__file__).resolve().parent
SOURCE = H.parent
ROOT = SOURCE.parents[1]
REF = 'swzpzcwiasxmjutrmvkm'


def replace_once(body, old, new):
    if body.count(old) != 1:
        raise RuntimeError('FINAL_ANCHOR_COUNT:' + old[:90])
    return body.replace(old, new)


def function_pins(pins):
    payload = json.dumps(pins, separators=(',', ':')).replace("'", "''")
    return """DO $pins$ DECLARE sig text; expected jsonb; actual jsonb; BEGIN
 FOR sig,expected IN SELECT * FROM jsonb_each('""" + payload + """'::jsonb) LOOP
  SELECT jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),
   'owner',pg_get_userbyid(p.proowner),'acl',(SELECT coalesce(jsonb_agg(x::text ORDER BY x::text),'[]'::jsonb) FROM unnest(p.proacl)x),
   'config',to_jsonb(p.proconfig)) INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(sig);
  IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'FINAL_FUNCTION_DRIFT:%',sig USING ERRCODE='42501'; END IF;
 END LOOP;
END $pins$;
"""


DESTINATION = """DO $destination$ BEGIN
 -- Review marker is a destination fence, NEVER actor authority. The operator must
 -- independently verify the connection project ref before setting this marker.
 IF current_setting('b2b_cancel_final.review_project_ref',true) IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm'
 THEN RAISE EXCEPTION 'FINAL_ORIGINAL_REF_NOT_VERIFIED' USING ERRCODE='42501'; END IF;
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'FINAL_OWNER_REQUIRED' USING ERRCODE='42501'; END IF;
END $destination$;
"""


def closed_state():
    return """DO $closed$ BEGIN
 IF (SELECT count(*) FROM platform_private.b2b_cancel_policy_gate_v1)<>1 OR
  EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_gate_v1 WHERE enabled) THEN
  RAISE EXCEPTION 'FINAL_GATE_NOT_CLOSED' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM platform_private.b2b_cancel_policy_allowlist_v1) THEN
  RAISE EXCEPTION 'FINAL_SCOPE_NOT_EMPTY' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN (
  'public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text)'::regprocedure,
  'public.rpc_b2b_cancel_residual_capability_v1(uuid)'::regprocedure,
  'platform_private.b2b_cancel_confirmed_fiscal_v1(uuid)'::regprocedure)
  AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE')
   OR has_function_privilege('service_role',p.oid,'EXECUTE'))) THEN
  RAISE EXCEPTION 'FINAL_EXECUTE_NOT_CLOSED' USING ERRCODE='42501'; END IF;
END $closed$;
"""


def security_checks():
    baseline = H / 'capture/security-pins.json'
    if not baseline.exists():
        raise RuntimeError('FINAL_ORIGINAL_SECURITY_CAPTURE_REQUIRED')
    expected = json.dumps(json.loads(baseline.read_text()), separators=(',', ':')).replace("'", "''")
    state = (H / 'security-state.sql').read_text().strip().rstrip(';')
    return "DO $security$ BEGIN IF (" + state + ") IS DISTINCT FROM '" + expected + "'::jsonb THEN RAISE EXCEPTION 'FINAL_ORIGINAL_SECURITY_DRIFT' USING ERRCODE='42501'; END IF; END $security$;\n"


def main():
    with tempfile.TemporaryDirectory(prefix='original-cancel-generator-', dir='/tmp') as temp:
        work = Path(temp)
        shutil.copytree(SOURCE / 'capture', work / 'capture')
        shutil.copyfile(SOURCE / 'generate.py', work / 'generate.py')
        runpy.run_path(str(work / 'generate.py'))
        body = (work / 'candidate.sql').read_text()
    # Forecast state is a TEXT contract distinct from the partner_order_status ENUM.
    body = replace_once(body, "f.state NOT IN ('aprovado_previsto','faturado_parcial')", "f.state NOT IN ('aguardando_fiscal','faturado_parcial')")
    body = replace_once(body, ' RETURN platform_private.b2b_financial_forecast_cancel_residual_v1(f.id,p_expected_version,p_reason)',
        " IF f.residual_amount IS NULL OR f.residual_amount<=0 OR f.state NOT IN ('aguardando_fiscal','faturado_parcial') THEN RAISE EXCEPTION 'B2B_FORECAST_STATE_CONFLICT' USING ERRCODE='PT409'; END IF;\n RETURN platform_private.b2b_financial_forecast_cancel_residual_v1(f.id,p_expected_version,p_reason)")
    body = replace_once(body, 'GRANT EXECUTE ON FUNCTION public.rpc_b2b_cancel_residual_capability_v1(uuid) TO authenticated;',
        'REVOKE ALL ON FUNCTION public.rpc_b2b_cancel_residual_capability_v1(uuid) FROM authenticated;')
    body += "\nREVOKE EXECUTE ON FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text) FROM PUBLIC,anon,authenticated,service_role;\n"
    # New private tables receive no client ACL and RLS is enabled as defense in depth.
    body += "ALTER TABLE platform_private.b2b_cancel_policy_gate_v1 ENABLE ROW LEVEL SECURITY;\nALTER TABLE platform_private.b2b_cancel_policy_allowlist_v1 ENABLE ROW LEVEL SECURITY;\n"
    (H / 'candidate.sql').write_text(body)
    pins = json.loads((SOURCE / 'capture/pins.json').read_text())
    pre = DESTINATION + function_pins(pins) + security_checks() + """DO $fresh$ BEGIN
 IF to_regclass('platform_private.b2b_cancel_policy_gate_v1') IS NOT NULL
 OR to_regclass('platform_private.b2b_cancel_policy_allowlist_v1') IS NOT NULL
 OR to_regprocedure('platform_private.b2b_cancel_confirmed_fiscal_v1(uuid)') IS NOT NULL
 OR to_regprocedure('public.rpc_b2b_cancel_residual_capability_v1(uuid)') IS NOT NULL THEN
 RAISE EXCEPTION 'FINAL_ALREADY_INSTALLED_OR_PARTIAL' USING ERRCODE='42501'; END IF;
END $fresh$;
"""
    (H / '01-pre.sql.readonly').write_text('BEGIN READ ONLY;\nSET LOCAL search_path TO pg_catalog,public;\n' + pre + 'ROLLBACK;\n')
    post_path = H / 'capture/post-pins.json'
    if post_path.exists():
        post = DESTINATION + function_pins(json.loads(post_path.read_text())) + security_checks()
        (H / '02-install-closed.sql.review').write_text("BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL search_path TO pg_catalog,public;\n" + pre + body + post + closed_state() + 'COMMIT;\n')
        (H / '03-post.sql.readonly').write_text('BEGIN READ ONLY;\nSET LOCAL search_path TO pg_catalog,public;\n' + post + closed_state() + 'ROLLBACK;\n')
        rollback = "UPDATE platform_private.b2b_cancel_policy_gate_v1 SET enabled=false;\nREVOKE EXECUTE ON FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text),public.rpc_b2b_cancel_residual_capability_v1(uuid) FROM PUBLIC,anon,authenticated,service_role;\n"
        # Rollback accepts an independently reviewed activation changing ACL only;
        # it still pins exact bodies, owners, configs and original relation security.
        relaxed = {s: {k: v for k, v in p.items() if k != 'acl'} for s, p in json.loads(post_path.read_text()).items()}
        check = function_pins(json.loads(post_path.read_text()))
        for sig, pin in json.loads(post_path.read_text()).items():
            # No relaxed installation or implicit restoration: rollback here is exact closed-package containment.
            pass
        (H / '04-rollback-deny.sql.review').write_text("BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL search_path TO pg_catalog,public;\n" + post + rollback + closed_state() + 'COMMIT;\n')
        (H / '05-post-rollback.sql.readonly').write_text((H / '03-post.sql.readonly').read_text())
    provenance = [{'path': str(p.relative_to(ROOT)), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
        for p in [SOURCE / 'generate.py', *sorted((SOURCE / 'capture').glob('*'))] if p.is_file()]
    (H / 'sources.json').write_text(json.dumps({'target': REF, 'provenance': provenance, 'homolog_sources': []}, indent=2) + '\n')
    (H / 'SHA256SUMS').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(H)}\n'
        for p in sorted(H.rglob('*')) if p.is_file() and p.name not in ['SHA256SUMS', 'manifest.json'] and '__pycache__' not in p.parts))


if __name__ == '__main__':
    main()