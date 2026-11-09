#!/usr/bin/env python3
"""Offline integrity verification for the scoped review-only rollout."""
import hashlib
import json
import os
import sys
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
OLD_PRE_SHA256 = '5401300b1293e0e0bc55a6e388e30cf79e1ddd10f01103a2557e7d0ef62f9bdd'
OLD_CAPTURE_SHA256 = '52537967cfc724c90728646ac0165def3560ffc56802962becbeea2e8fee19ea'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def main():
    package = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else H / 'production-rollout-posplans-20261108'
    pending_final = os.environ.get('ROLLOUT_DEFER_FINAL_EXECUTION') == '1'
    if pending_final:
        assert package.is_relative_to(Path('/tmp')), 'PENDING_FINAL_EXECUTION_NOT_TEMPORARY'
    manifest = json.loads((package / 'manifest.json').read_text())
    assert manifest['status'] == 'REVIEW_ONLY_INACTIVE_NOT_APPROVED'
    assert manifest['production_ref'] == 'swzpzcwiasxmjutrmvkm'
    assert manifest['hosted_io'] is False and manifest['default_enabled'] is False
    assert manifest['authenticated_real_proof'] == 'NOT_RUN'
    expected = set(manifest['files']) | {'manifest.json'}
    actual = {path.name for path in package.iterdir() if path.is_file()}
    assert actual == expected, {'missing': sorted(expected - actual), 'extra': sorted(actual - expected)}
    for name, row in manifest['files'].items():
        path = package / name
        assert path.stat().st_size == row['bytes'], name
        assert sha(path) == row['sha256'], name
    assert manifest['files']['00-production-pre-posplans.sql.readonly']['sha256'] != OLD_PRE_SHA256

    source_map = json.loads((package / 'artifact-sources.json').read_text())
    assert set(source_map) == set(manifest['files']) - {'artifact-sources.json', 'manifest.json'}
    for name, row in source_map.items():
        assert sha(package / name) == row['artifact_sha256'], name
        if row['mode'] == 'COPY_EXACT':
            source = ROOT / row['source']
            assert source.is_file(), (name, row['source'])
            assert sha(source) == row['source_sha256'] == row['artifact_sha256'], name
        else:
            assert row['mode'] == 'GENERATED_FROM_PINNED_INPUTS'
            for source_row in row['inputs']:
                source = ROOT / source_row['path']
                assert source.is_file(), (name, source_row['path'])
                assert sha(source) == source_row['sha256'], (name, source_row['path'])

    capture_path = H / 'reconciliation-posplans-20261108/live-current-metadata-a7b973949.json'
    capture = json.loads(capture_path.read_text())
    assert capture['expected_ref'] == 'swzpzcwiasxmjutrmvkm'
    assert len(capture['functions']) == 20 and len(capture['triggers']) == 120 and len(capture['relations']) == 17
    for row in capture['functions']:
        assert hashlib.md5(row['definition'].encode()).hexdigest() == row['md5'], row['signature']
    assert 'COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDO' not in capture_path.read_text()
    short = next(row for row in capture['functions'] if row['signature'] == 'public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)')
    assert short['md5'] == 'a4d47ccf5d116141ed46e9de9ea7eeaa'
    assert 'COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDA' in short['definition']
    relation_security_path = H / 'reconciliation-posplans-20261108/live-current-relation-security-20261109.json'
    relation_security = json.loads(relation_security_path.read_text())
    assert relation_security['expected_ref'] == 'swzpzcwiasxmjutrmvkm'
    assert relation_security['hosted_io_by_agent'] is False
    assert len(relation_security['relations']) == 18
    assert len({(row['schema'], row['name']) for row in relation_security['relations']}) == 18
    scope = json.loads((package / 'evidence-scope-metadata.json').read_text())
    assert scope['capture_sha256'] == sha(capture_path) != OLD_CAPTURE_SHA256
    assert scope['relation_security_sha256'] == sha(relation_security_path)
    assert scope['relation_security_pins'] == 18
    assert scope['guarded_existing_functions'] >= 20 and scope['pre_triggers'] == 120
    assert sha(package / 'evidence-live-relation-security.json') == sha(relation_security_path)
    pre_text = (package / '00-production-pre-posplans.sql.readonly').read_text()
    for row in relation_security['relations']:
        name = f"{row['schema']}.{row['name']}"
        acl = ','.join(sorted(row['acl'].strip('{}').split(','))) if row['acl'] else ''
        pin = json.dumps([name, acl, row['rls'], row['force_rls'], row['owner']], separators=(',', ':')).replace("'", "''")
        assert pin in pre_text, ('RELATION_SECURITY_PIN_MISSING', name)

    assert (package / 'evidence-run.exitcode').read_text().strip() == '0'
    assert 'Traceback' not in (package / 'evidence-run.stderr.txt').read_text()
    checks = json.loads((package / 'evidence-checks.json').read_text())
    pilot = json.loads((package / 'evidence-pilot-checks.json').read_text())['checks']
    assert all(row['status'] == 'PASS' for row in checks)
    assert len(pilot) == 30 and all(row['status'] == 'PASS' for row in pilot)
    summary = json.loads((package / 'evidence-summary.json').read_text())
    assert summary['capture_functions_md5_verified'] == 20
    assert summary['relation_security_pins'] == 18
    assert summary['relation_security_sha256'] == sha(relation_security_path)
    assert summary['pilot_containment_checks'] == 30
    assert summary['positive_fiscal_receivable'] == 'NOT_RUN_OUT_OF_SCOPE'
    reverse = summary['full_reverse_rollback']
    expected_checks = {'logistics-only': 40, 'integrated': 41}[reverse['branch']]
    assert len(checks) == expected_checks, (reverse['branch'], len(checks), expected_checks)
    assert all(value is False for value in reverse['closed'].values())
    assert reverse['history_before'] == reverse['history_after']
    assert reverse['plans_before'] == reverse['plans_after']
    assert reverse['real_baselines_preserved'] is True and reverse['current_catalog_preserved'] is True
    assert reverse['deny_only_no_body_restoration'] is True
    assert reverse['composed_generators'] == ['SEND_COMPOSED_ROLLBACK', 'CONFIRM_COMPOSED_ROLLBACK']
    assert all(row['returncode'] != 0 and row['permission_denied'] is True for row in reverse['authenticated_negative'].values())
    send_rollback = (package / '92-send-rollback-deny.sql.review').read_text()
    confirm_rollback = (package / '91-confirmation-rollback-deny.sql.review').read_text()
    assert 'SEND_COMPOSED_ROLLBACK' in send_rollback and 'CONFIRM_COMPOSED_ROLLBACK' not in send_rollback
    assert 'CONFIRM_COMPOSED_ROLLBACK' in confirm_rollback and 'SEND_COMPOSED_ROLLBACK' not in confirm_rollback
    assert 'public.rpc_entrega_enviar_manual_v1(uuid,timestamptz,text)' in send_rollback
    assert 'public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)' not in send_rollback
    assert 'public.rpc_entrega_confirmar_manual_v1(uuid,timestamptz,text,jsonb)' in confirm_rollback
    for text in (send_rollback, confirm_rollback):
        assert 'CREATE OR REPLACE' not in text and 'GRANT ' not in text

    final_sql = {
        path.name for path in package.iterdir()
        if path.name.endswith('.sql.review') or path.name.endswith('.sql.readonly')
    }
    final_execution = manifest['final_artifact_execution']
    if pending_final:
        assert final_execution['status'] == 'NOT_RUN_PENDING_TEMPORARY_STAGING'
        assert 'evidence-final-artifact-execution.json' not in manifest['files']
        final_count = 0
    else:
        assert final_execution['status'] == 'PASS'
        execution_path = package / 'evidence-final-artifact-execution.json'
        execution = json.loads(execution_path.read_text())
        assert execution['status'] == 'PASS' and execution['hosted'] is False
        assert execution['postgresql_version'].startswith('17.')
        assert execution['relation_security_preserved'] is True
        assert execution['history_before'] == execution['history_after']
        assert execution['plans_before_md5'] == execution['plans_after_md5']
        assert execution['gates_activated'] is False
        assert sha(execution_path) == final_execution['evidence_sha256']
        executed = {row['file']: row for row in execution['artifacts']}
        assert set(executed) == final_sql
        for name, row in executed.items():
            assert row['returncode'] == 0 and row['sha256'] == sha(package / name), name
        assert all(row['permission_denied'] is True and row['returncode'] != 0
                   for row in execution['authenticated_negative'].values())
        final_count = len(executed)
        assert final_count == final_execution['artifacts'] == 24

    print(json.dumps({
        'status': 'VERIFIED_OFFLINE_PENDING_FINAL_EXECUTION' if pending_final else 'VERIFIED_OFFLINE_REVIEW_ONLY_INACTIVE_NOT_APPROVED',
        'package': str(package),
        'files_verified': len(manifest['files']),
        'manifest_sha256': sha(package / 'manifest.json'),
        'pre_sha256': sha(package / '00-production-pre-posplans.sql.readonly'),
        'capture_sha256': sha(capture_path),
        'relation_security_sha256': sha(relation_security_path),
        'relation_security_pins': 18,
        'composition_checks': len(checks),
        'pilot_checks': len(pilot),
        'final_artifacts_executed': final_count,
        'hosted_io': False,
        'authenticated_real_proof': 'NOT_RUN',
    }, indent=2))


if __name__ == '__main__':
    main()
