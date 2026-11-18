"""Offline audited exact captures only. Never connects, repins, installs or publishes."""
import argparse
import hashlib
import json
from pathlib import Path
import runpy
import re

HOME = Path(__file__).resolve().parent
REFS = {'swzpzcwiasxmjutrmvkm', 'vrlcdwmlytukrjezrrnf'}
ROOT = 'public.tenant_catalog_root_save(text, uuid, jsonb, timestamp with time zone, uuid)'
PIN = '7db253bcc2150276ea2bb2f7bd90e471'
FRESH = 'platform_private.recorte_a_actor_fresh(text)'
FRESH_PIN = '0cb006c428fc13b0bf0fd7e2759f7a99'

def key(signature):
    return signature.replace(' ', '').replace('timestamptz', 'timestampwithtimezone')

def write(path, value):
    path.write_text(value, encoding='utf-8', newline='\n')

def read_capture(path):
    capture = json.loads(path.read_text(encoding='utf-8'))
    assert capture.get('ref') in REFS, 'REF_DENIED'
    assert capture.get('provenance') == 'root-exact-catalog', 'EXACT_ROOT_CAPTURE_REQUIRED'
    catalog = capture['catalog']
    assert all(name in catalog for name in ['functions', 'relations', 'config']), 'INTEGRAL_CAPTURE_REQUIRED'
    for function in catalog['functions']:
        assert '\r' not in function['definition'], 'CAPTURE_CRLF_DENIED: recapture exact; never normalize pins'
        assert hashlib.md5(function['definition'].encode('utf-8')).hexdigest() == function['md5'], 'CAPTURE_ROUNDTRIP_DRIFT'
        assert all(name in function for name in ['owner', 'acl', 'security_definer', 'config', 'volatility']), 'FUNCTION_METADATA_REQUIRED'
    for relation in catalog['relations']:
        assert all(name in relation for name in ['owner', 'rls', 'force_rls', 'acl', 'columns', 'constraints', 'triggers', 'policies', 'indexes']), 'RELATION_METADATA_REQUIRED'
    assert capture.get('reviewed_transitive_signatures'), 'ROOT_TRANSITIVE_REVIEW_REQUIRED: pg_depend alone omits PLpgSQL calls'
    functions = {key(f['signature']): f for f in catalog['functions']}
    for signature in capture['reviewed_transitive_signatures']:
        assert key(signature) in functions, ('DEPENDENCY_CAPTURE_REQUIRED', signature)
    return capture, functions

def function_body(definition):
    match = re.search(r'\bAS\s+(\$[A-Za-z_]*\$)', definition)
    assert match, 'FUNCTION_BODY_REQUIRED'
    delimiter = match.group(1)
    body, end, remainder = definition[match.end():].partition(delimiter)
    assert end, 'FUNCTION_BODY_REQUIRED'
    return body

def assemble(pre_path, post_path, out):
    pre, functions = read_capture(pre_path)
    post, post_functions = read_capture(post_path)
    assert pre['ref'] == post['ref'], 'POST_REF_DENIED'
    assert functions[key(ROOT)]['md5'] == PIN, 'CANONICAL_ROOT_REVIEW_REQUIRED: do not repin'
    assert functions[key(FRESH)]['md5'] == FRESH_PIN, 'FRESH_ACTOR_REVIEW_REQUIRED: do not repin'
    assert functions[key(FRESH)]['volatility'] == 'v', 'FRESH_ACTOR_VOLATILE_REQUIRED'
    assert all(acl.split('=')[0] == functions[key(FRESH)]['owner'] for acl in functions[key(FRESH)]['acl'] or []), 'FRESH_ACTOR_OWNER_ONLY_REQUIRED'
    required = {'public.produtos', 'public.product_technical_profiles', 'public.product_target_recommendations', 'public.product_crop_recommendations', 'public.catalog_technical_sources', 'public.culturas', 'public.catalogo_alvos', 'platform_private.tenant_catalog_root_cfg', 'platform_private.tenant_catalog_root_receipts'}
    assert required <= {r['name'] for r in pre['catalog']['relations']}, 'BASE_RELATIONS_REQUIRED'
    # No automatic metadata writer alignment. Unchanged functions must remain byte/ACL/owner exact.
    for signature, function in functions.items():
        if signature != key(ROOT):
            assert post_functions.get(signature) == function, ('POST_DEPENDENCY_DRIFT', function['signature'])
    for signature in ['platform_private.product_relations_apply_v1(uuid,uuid,jsonb)', 'platform_private.product_source_https_v1(text)']:
        helper = post_functions.get(key(signature))
        assert helper and helper['owner'] == functions[key(ROOT)]['owner'] and helper['security_definer'] == (signature.startswith('platform_private.product_relations')), 'POST_HELPER_OWNER_REQUIRED'
        assert all(acl.split('=')[0] == helper['owner'] for acl in helper['acl'] or []), 'POST_HELPER_OWNER_ONLY_REQUIRED'
    reader = post_functions.get(key('public.tenant_product_documentary_read_v1(uuid)'))
    assert reader and reader['owner'] == functions[key(ROOT)]['owner'] and reader['security_definer'] and reader['volatility'] == 'v', 'POST_READER_AUTHORITY_REQUIRED'
    for name in ['platform_private.product_evidence_gate_v1', 'platform_private.product_evidence_history_v1']:
        relation = next((r for r in post['catalog']['relations'] if r['name'] == name), None)
        assert relation and relation['rls'] is True, 'POST_PRIVATE_RLS_REQUIRED'
        if name.endswith('history_v1'):
            assert any('(product_id, sequence DESC)' in index for index in relation['indexes'] or []), 'POST_LATEST_EVIDENCE_INDEX_REQUIRED'
        assert relation and relation['owner'] == functions[key(ROOT)]['owner'], 'POST_PRIVATE_OWNER_REQUIRED'
        assert all(acl.split('=')[0] == relation['owner'] for acl in relation['acl'] or []), 'POST_PRIVATE_ACL_REQUIRED'
    build = runpy.run_path(str(HOME/'build.py'), run_name='product_candidate_library')
    delta = build['extend'](functions[key(ROOT)]['definition'])
    expected_body = function_body(delta)
    actual_body = function_body(post_functions[key(ROOT)]['definition'])
    assert expected_body == actual_body, 'POST_ROOT_NOT_EXACT_CANDIDATE'
    assert function_body(build['reader']) == function_body(reader['definition']), 'POST_READER_NOT_EXACT_CANDIDATE'
    before_relations = {r['name']: r for r in pre['catalog']['relations']}
    after_relations = {r['name']: r for r in post['catalog']['relations']}
    for name, relation in before_relations.items():
        assert after_relations.get(name) == relation, ('POST_EXISTING_RELATION_DRIFT', name)
    assert {'platform_private.product_evidence_gate_v1', 'platform_private.product_evidence_history_v1'} <= after_relations.keys(), 'POST_ADDITIVE_RELATIONS_REQUIRED'
    query = (HOME/'capture-query.sql.review').read_text(encoding='utf-8').strip().rstrip(';')
    def json_sql(catalog):
        return "'" + json.dumps(catalog, ensure_ascii=False).replace("'", "''") + "'::jsonb"
    before = json_sql(pre['catalog']); after = json_sql(post['catalog'])
    check = lambda snapshot: f"DO $check$ BEGIN IF ({query}) IS DISTINCT FROM {snapshot} THEN RAISE EXCEPTION 'PRODUCT_CATALOG_DRIFT'; END IF; END $check$;\n"
    source = build['schema'] + build['helper'] + (HOME/'relations.sql.review').read_text(encoding='utf-8') + build['reader'] + delta
    out.mkdir(parents=True, exist_ok=True)
    write(out/'01-pre.sql.review', check(before))
    # Reinstall is idempotent only if the entire post-catalog is exact. No partial DDL adoption.
    install = "BEGIN; DO $install$ BEGIN IF ("+query+") = "+after+" THEN RETURN; END IF; IF ("+query+") IS DISTINCT FROM "+before+" THEN RAISE EXCEPTION 'PRODUCT_PRE_DRIFT'; END IF; EXECUTE $candidate$"+source+"$candidate$; END $install$;\n"+check(after)+"COMMIT;\n"
    write(out/'02-install.sql.review', install)
    write(out/'03-post.sql.review', check(after))
    write(out/'04-release.sql.review', 'BEGIN;\n'+check(after)+"UPDATE platform_private.product_evidence_gate_v1 SET enabled=true WHERE singleton; COMMIT;\n")
    write(out/'05-rollback.sql.review', 'BEGIN;\n'+check(after)+"UPDATE platform_private.product_evidence_gate_v1 SET enabled=false WHERE singleton; COMMIT;\n-- Reader and extended writer enforce the closed gate; history/confirmed roots retained.\n")
    write(out/'manifest.json', json.dumps({'ref': pre['ref'], 'review_only': True, 'pre_sha256': hashlib.sha256(pre_path.read_bytes()).hexdigest(), 'post_sha256': hashlib.sha256(post_path.read_bytes()).hexdigest(), 'files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(out.glob('*.review'))}}, indent=2)+'\n')

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--pre', type=Path, required=True)
    parser.add_argument('--post', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    assemble(args.pre, args.post, args.out)
