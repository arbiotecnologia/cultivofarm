"""Builds review-only SQL for rpc_cockpit_gerar_lote_v1. Never connects anywhere."""
from pathlib import Path
import json
H = Path(__file__).resolve().parent
REF = 'swzpzcwiasxmjutrmvkm'
SIG = 'public.rpc_cockpit_gerar_lote_v1(uuid,uuid,text,jsonb)'
SIG_SPACED = 'public.rpc_cockpit_gerar_lote_v1(uuid, uuid, text, jsonb)'


def q(v):
    return "'" + v.replace("'", "''") + "'"


def guard(post: bool) -> str:
    c = json.loads((H / 'catalog.json').read_text())
    assert c['ref'] == REF
    t = c['target']
    digest = json.loads((H / 'post-hashes.json').read_text())[SIG] if post else t['pre_md5']
    acl = t['post_acl'] if post else t['pre_acl']
    L = ["DO $guard$ BEGIN",
         f" IF (SELECT project_ref FROM public.fiscal_environment_marker LIMIT 1) IS DISTINCT FROM {q(REF)} THEN RAISE EXCEPTION 'WRONG_PROJECT'; END IF;",
         f" IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({q(SIG)}) AND md5(pg_get_functiondef(oid))={q(digest)} AND proowner='postgres'::regrole AND prosecdef AND proacl::text={q(acl)}) THEN RAISE EXCEPTION 'TARGET_DRIFT'; END IF;"]
    for sig, h, a in c['functions']:
        L.append(f" IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure({q(sig)}) AND md5(pg_get_functiondef(oid))={q(h)} AND proowner='postgres'::regrole AND proacl::text={q(a)}) THEN RAISE EXCEPTION 'FUNCTION_DRIFT: %', {q(sig)}; END IF;")
    names = sorted(x[0] for x in c['lot_triggers'])
    L.append(" IF (SELECT array_agg(tgname::text ORDER BY tgname) FROM pg_trigger WHERE tgrelid='public.lotes'::regclass AND NOT tgisinternal) IS DISTINCT FROM ARRAY[" + ','.join(q(n) for n in names) + "]::text[] THEN RAISE EXCEPTION 'TRIGGER_SET_DRIFT'; END IF;")
    for name, d, f, _ in c['lot_triggers']:
        L.append(f" IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.lotes'::regclass AND tgname={q(name)} AND tgenabled='O' AND md5(pg_get_triggerdef(oid))={q(d)} AND md5(pg_get_functiondef(tgfoid))={q(f)}) THEN RAISE EXCEPTION 'TRIGGER_DRIFT: %', {q(name)}; END IF;")
    for name, d in c['lot_indexes']:
        L.append(f" IF NOT EXISTS(SELECT 1 FROM pg_index WHERE indexrelid=to_regclass({q('public.' + name)}) AND indisvalid AND indisready AND md5(pg_get_indexdef(indexrelid))={q(d)}) THEN RAISE EXCEPTION 'INDEX_DRIFT: %', {q(name)}; END IF;")
    pol = sorted(x[0] for x in c['lot_policies'])
    L.append(" IF (SELECT array_agg(polname::text ORDER BY polname) FROM pg_policy WHERE polrelid='public.lotes'::regclass) IS DISTINCT FROM ARRAY[" + ','.join(q(n) for n in pol) + "]::text[] THEN RAISE EXCEPTION 'POLICY_SET_DRIFT'; END IF;")
    for name, d in c['lot_policies']:
        L.append(f" IF NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.lotes'::regclass AND polname={q(name)} AND md5(coalesce(pg_get_expr(polqual,polrelid),'')||'|'||coalesce(pg_get_expr(polwithcheck,polrelid),'')||'|'||polcmd::text||'|'||polpermissive::text||'|'||polroles::text)={q(d)}) THEN RAISE EXCEPTION 'POLICY_DRIFT: %', {q(name)}; END IF;")
    L.append(" IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.lotes'::regclass) THEN RAISE EXCEPTION 'RLS_DRIFT'; END IF;")
    L.append(f" IF (SELECT count(*) FROM pg_trigger WHERE tgrelid='public.laboratorio_esteira_eventos'::regclass AND NOT tgisinternal)<>{int(c['event_table_triggers'])} THEN RAISE EXCEPTION 'EVENT_TRIGGER_DRIFT'; END IF;")
    for t in c.get('tables', []):
        name = q('public.' + t['name'])
        L.append(f" IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass({name}) AND relowner='postgres'::regrole AND relrowsecurity AND NOT relforcerowsecurity AND relacl::text={q(t['acl'])}) THEN RAISE EXCEPTION 'TABLE_ACL_DRIFT: %', {name}; END IF;")
        L.append(f" IF (SELECT md5(string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),'|' ORDER BY a.attnum)) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=to_regclass({name}) AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM {q(t['schema_md5'])} THEN RAISE EXCEPTION 'SCHEMA_DRIFT: %', {name}; END IF;")
        L.append(f" IF (SELECT md5(coalesce(string_agg(pg_get_constraintdef(k.oid)||':'||k.conname||':'||k.convalidated::text,'|' ORDER BY k.conname),'')) FROM pg_constraint k WHERE k.conrelid=to_regclass({name})) IS DISTINCT FROM {q(t['constraints_md5'])} THEN RAISE EXCEPTION 'CONSTRAINT_DRIFT: %', {name}; END IF;")
    for name, digest in c.get('views', []):
        L.append(f" IF md5(pg_get_viewdef(to_regclass({q(name)}),true)) IS DISTINCT FROM {q(digest)} THEN RAISE EXCEPTION 'VIEW_DRIFT: %', {q(name)}; END IF;")
    L.append("END $guard$;")
    return '\n'.join(L) + '\n'


HEAD = "-- REVIEW ONLY, NOT APPLIED BY THE AGENT. Canonical ref " + REF + " only. No fixture/data writes.\n"
CAND_ACL = f"REVOKE ALL ON FUNCTION {SIG_SPACED} FROM PUBLIC, anon, authenticated, service_role;\nGRANT EXECUTE ON FUNCTION {SIG_SPACED} TO authenticated;\n"
ROLL_ACL = f"REVOKE ALL ON FUNCTION {SIG_SPACED} FROM PUBLIC, anon, authenticated, service_role;\nGRANT EXECUTE ON FUNCTION {SIG_SPACED} TO service_role;\n"


def main():
    rpc = (H / 'rpc.sql.review').read_text()
    base = (H / 'rollback/rpc.sql.review').read_text()
    assert 'TEMP' not in base.upper().replace('PG_TEMP', '')
    tx = "BEGIN;\nSET LOCAL lock_timeout='3s';\nSET LOCAL statement_timeout='15s';\n"
    (H / 'preflight-readonly.sql').write_text(HEAD + "BEGIN READ ONLY;\n" + guard(False) + "ROLLBACK;\n")
    (H / 'postflight-readonly.sql').write_text(HEAD + "BEGIN READ ONLY;\n" + guard(True) + "ROLLBACK;\n")
    (H / 'candidate.sql.review').write_text(HEAD + tx + guard(False) + rpc + CAND_ACL + guard(True) + "COMMIT;\n")
    (H / 'rollback.sql.review').write_text(HEAD + tx + guard(True) + base + ROLL_ACL + guard(False) + "COMMIT;\n")


if __name__ == '__main__':
    main()
