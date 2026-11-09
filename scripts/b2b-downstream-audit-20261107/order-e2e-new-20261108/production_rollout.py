#!/usr/bin/env python3
"""Assemble review-only scoped POSPLANOS rollout from one clean disposable run."""
import hashlib
import importlib.util
import json
import os
import shutil
from pathlib import Path

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
E = Path(os.environ['NEW_E2E_OUT']).resolve()
OUT = H / 'production-rollout-posplans-20261108'
REF = 'swzpzcwiasxmjutrmvkm'
OLD_PRE_SHA256 = '5401300b1293e0e0bc55a6e388e30cf79e1ddd10f01103a2557e7d0ef62f9bdd'


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def rel(path):
    path = Path(path).resolve()
    return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)


def load_current_scope():
    spec = importlib.util.spec_from_file_location('rollout_current_scope', H / 'current_scope.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pre_from_install(install, candidate):
    install_text = Path(install).read_text()
    candidate_text = Path(candidate).read_text()
    assert install_text.endswith(candidate_text), (install, 'candidate suffix drift')
    return install_text[:-len(candidate_text)].rstrip() + '\n'


def main():
    assert E.is_dir() and E.is_relative_to(H / 'evidence'), E
    checks = json.loads((E / 'checks.json').read_text())
    assert (E / 'run.exitcode').read_text().strip() == '0'
    assert checks and all(row['status'] == 'PASS' for row in checks)
    assert 'Traceback' not in (E / 'run.stderr.txt').read_text()
    workspace = json.loads((E / 'workspace.json').read_text())
    assert workspace['mirror'].startswith('/tmp/') and workspace['output'] == str(E)

    # Prove that every generator/input source used by the mirror is still the
    # exact source in this repository before replacing the visible package.
    source_manifest_path = E / 'source-manifest.json'
    source_manifest = json.loads(source_manifest_path.read_text())
    for row in source_manifest['sources']:
        source = ROOT / row['file']
        assert source.is_file(), ('REHEARSAL_SOURCE_MISSING', row['file'])
        assert sha(source) == row['sha256'], ('REHEARSAL_SOURCE_DRIFT', row['file'])

    current_scope = load_current_scope()
    capture = current_scope.CAPTURE
    assert capture['expected_ref'] == REF
    assert len(capture['functions']) == 20
    for row in capture['functions']:
        assert hashlib.md5(row['definition'].encode()).hexdigest() == row['md5'], row['signature']
    capture_bytes = (current_scope.CAPTURE_PATH).read_bytes()
    assert b'COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDO' not in capture_bytes
    short = next(row for row in capture['functions'] if row['signature'] == 'public.rpc_cockpit_criar_entrega_v1(uuid,text,uuid,numeric,jsonb)')
    assert short['md5'] == 'a4d47ccf5d116141ed46e9de9ea7eeaa'
    assert 'COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDA' in short['definition']

    delivery = E / 'delivery-confirmation'
    send = E / 'delivery-send'
    physical = E / 'physical-finished-product'
    pilot = E / 'pilot-containment'
    for required in (delivery, send, physical, E / 'logistics', E / 'os-endpoint', pilot):
        assert required.is_dir(), f'missing fresh artifact directory: {required}'
    scope_metadata = json.loads((delivery / 'scope-metadata.json').read_text())
    assert scope_metadata['capture_sha256'] == sha(current_scope.CAPTURE_PATH)
    assert scope_metadata['relation_security_sha256'] == sha(current_scope.RELATION_SECURITY_PATH)
    assert scope_metadata['relation_security_pins'] == 18
    assert scope_metadata['independent_diff_sha256'] == sha(current_scope.DIFF_PATH)
    assert scope_metadata['guarded_existing_functions'] >= 20
    assert scope_metadata['pre_triggers'] == 120

    assert sha(E / 'logistics/candidate.sql.review') == '8ad4def8d4ae3c2e86518f2d82bf57f053cee66b0d7e165b84472cb586812c20'
    reconciliation = H / 'reconciliation-posplans-20261108'
    guard_source = json.loads((reconciliation / 'live-catalog-guards-20261108.json').read_text())
    current_baseline = json.loads((E / 'current-catalog-baseline.json').read_text())
    current_posplans = json.loads((E / 'current-catalog-posplans.json').read_text())
    assert current_baseline['guard_capture_sha256'] == guard_source['capture_sha256']
    assert sha(reconciliation / 'live-catalog-guards-20261108.sql.capture') == guard_source['capture_sha256']
    for state in (current_baseline, current_posplans):
        measured = {row['signature']: row['md5'] for row in state['functions']}
        for signature, expected in guard_source['functions'].items():
            assert measured.get(signature) == expected, (signature, measured.get(signature), expected)

    partial = json.loads((E / 'review-70d08c.json').read_text())['results']
    endpoint = json.loads((E / 'os-endpoint-tests.json').read_text())['results']
    pilot_checks = json.loads((pilot / 'checks.json').read_text())
    assert len(partial) == 13 and all(row['status'] == 'PASS' for row in partial)
    assert len(endpoint) == 15 and all(row['status'] == 'PASS' for row in endpoint)
    assert len(pilot_checks['checks']) == 30 and all(row['status'] == 'PASS' for row in pilot_checks['checks'])
    pilot_manifest = json.loads((pilot / 'manifest.json').read_text())
    assert pilot_manifest['hosted'] is False and pilot_manifest['default_enabled'] is False
    assert pilot_manifest['candidate_sha256'] == sha(pilot / 'candidate.sql.review')

    frontend = {}
    expected_test_counts = {'frontend-ui': 21, 'frontend-candidate': 13, 'frontend-os-compat': 73}
    for name in ('frontend-ui', 'frontend-candidate', 'frontend-os-compat', 'typecheck'):
        assert (E / f'{name}.exitcode').read_text().strip() == '0', name
        log_text = (E / f'{name}.txt').read_text()
        if name in expected_test_counts:
            assert f"Tests  {expected_test_counts[name]} passed" in log_text, (name, 'test count drift')
        frontend[name] = {'exitcode': 0, 'sha256': sha(E / f'{name}.txt')}
        if name in expected_test_counts:
            frontend[name]['tests'] = expected_test_counts[name]

    rollback = json.loads((E / 'full-logistics-rollback.json').read_text())
    assert rollback['current_catalog_preserved'] is True
    assert all(value is False for value in rollback['closed'].values())
    assert rollback['history_before'] == rollback['history_after']
    b4_scope = json.loads((E / 'integrated-b4-fiscal-bridge.json').read_text())
    assert b4_scope['status'] == 'NOT_RUN_OUT_OF_SCOPE' and b4_scope['hosted'] is False

    plan_post_path = ROOT / 'scripts/commercial-plans-tenant-20261108/03-post.sql.readonly'
    assert sha(plan_post_path) == '033312331dd757c72c625f027d24176efa33931c8881ab002122a4e56867e894'
    state_expression = (delivery / 'state.sql.review').read_text().strip()
    initial = current_scope.initial_production_pre(E, state_expression, plan_post_path.read_text())
    assert 'PRODUCTION_PRE_SCOPED_FUNCTIONS' in initial
    assert 'COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDO' not in initial
    assert sha(current_scope.CAPTURE_PATH) != '52537967cfc724c90728646ac0165def3560ffc56802962becbeea2e8fee19ea'

    staging = H / f'{OUT.name}.staging-{E.name}'
    assert not staging.exists(), staging
    staging.mkdir()
    sources = {}

    def copy(source, target):
        source = Path(source)
        target = staging / target
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        assert sha(source) == sha(target), target
        sources[target.name] = {
            'mode': 'COPY_EXACT',
            'source': rel(source),
            'source_sha256': sha(source),
            'artifact_sha256': sha(target),
        }

    def generated(target, text, inputs):
        target_path = staging / target
        target_path.write_text(text)
        sources[target] = {
            'mode': 'GENERATED_FROM_PINNED_INPUTS',
            'inputs': [{'path': rel(path), 'sha256': sha(path)} for path in inputs],
            'artifact_sha256': sha(target_path),
        }

    generated('00-production-pre-posplans.sql.readonly', initial, [
        current_scope.CAPTURE_PATH, current_scope.RELATION_SECURITY_PATH, current_scope.DIFF_PATH,
        delivery / 'scope-pre.json', delivery / 'state.sql.review',
        plan_post_path, H / 'current_scope.py',
    ])
    artifacts = {
        'evidence-live-catalog-guards.sql.capture': reconciliation / 'live-catalog-guards-20261108.sql.capture',
        'evidence-live-catalog-guards.json': reconciliation / 'live-catalog-guards-20261108.json',
        'evidence-live-relation-security.json': current_scope.RELATION_SECURITY_PATH,
        'evidence-source-manifest.json': source_manifest_path,
        'evidence-run.stdout.txt': E / 'run.stdout.txt',
        'evidence-run.stderr.txt': E / 'run.stderr.txt',
        'evidence-run.exitcode': E / 'run.exitcode',
        'evidence-checks.json': E / 'checks.json',
        'evidence-scope-metadata.json': delivery / 'scope-metadata.json',
        'evidence-pilot-checks.json': pilot / 'checks.json',
        '11-confirmation-install.sql.review': delivery / 'install.sql.review',
        '12-confirmation-post.sql.readonly': delivery / 'postflight.sql.review',
        '91-confirmation-send-rollback-deny.sql.review': delivery / 'rollback-composed.sql.review',
        '20-send-pre.sql.readonly': send / 'preflight.sql.review',
        '21-send-install.sql.review': send / 'install.sql.review',
        '22-send-post.sql.readonly': send / 'postflight.sql.review',
        '31-physical-install.sql.review': physical / 'install.sql.review',
        '32-physical-post.sql.readonly': physical / 'postflight.sql.review',
        '93-physical-rollback-deny.sql.review': physical / 'rollback.sql.review',
        '41-logistics-install.sql.review': E / 'logistics/install.sql.review',
        '42-logistics-post.sql.readonly': E / 'logistics/postflight.sql.review',
        '94-logistics-rollback-deny.sql.review': E / 'logistics/rollback.sql.review',
        '50-endpoint-reader-pre.sql.readonly': E / 'os-endpoint/01-pre.sql.readonly',
        '51-endpoint-reader-install.sql.review': E / 'os-endpoint/02-install.sql.review',
        '52-endpoint-reader-post.sql.readonly': E / 'os-endpoint/03-post.sql.readonly',
        '90-endpoint-reader-rollback-deny.sql.review': E / 'os-endpoint/04-rollback-deny.sql.review',
        '60-pilot-containment-pre.sql.readonly': pilot / '01-pre.sql.readonly',
        '61-pilot-containment-install.sql.review': pilot / '02-install.sql.review',
        '62-pilot-containment-post.sql.readonly': pilot / '03-post.sql.readonly',
        '89-pilot-containment-rollback-deny.sql.review': pilot / '04-rollback-deny.sql.review',
        'README.md': H / 'production-rollout.README.md',
    }
    for target, source in artifacts.items():
        copy(source, target)
    generated('30-physical-pre-after-confirmation-send.sql.readonly',
              'BEGIN READ ONLY;\n' + pre_from_install(physical / 'install.sql.review', physical / 'candidate.sql.review') + 'ROLLBACK;\n',
              [physical / 'install.sql.review', physical / 'candidate.sql.review'])
    generated('40-logistics-pre-after-physical.sql.readonly',
              'BEGIN READ ONLY;\n' + pre_from_install(E / 'logistics/install.sql.review', E / 'logistics/candidate.sql.review') + 'ROLLBACK;\n',
              [E / 'logistics/install.sql.review', E / 'logistics/candidate.sql.review'])

    evidence_summary = {
        'evidence_directory': rel(E),
        'scope': 'PostgreSQL 17.11 descartável e testes locais; não é prova JWT/RLS/Storage/hosted',
        'source_manifest_sha256': sha(source_manifest_path),
        'source_files_revalidated': len(source_manifest['sources']),
        'capture_sha256': sha(current_scope.CAPTURE_PATH),
        'independent_diff_sha256': sha(current_scope.DIFF_PATH),
        'capture_functions_md5_verified': 20,
        'capture_triggers': len(capture['triggers']),
        'capture_relations': len(capture['relations']),
        'relation_security_pins': len(current_scope.SECURITY_RELATIONS),
        'relation_security_sha256': sha(current_scope.RELATION_SECURITY_PATH),
        'transcription_correction': 'COCKPIT_ENTREGA_ENDERECO_ORIGEM_INVALIDA; MD5 a4d47ccf5d116141ed46e9de9ea7eeaa',
        'composition_checks': len(checks),
        'partial_regressions': len(partial),
        'endpoint_reader_checks': len(endpoint),
        'pilot_containment_checks': len(pilot_checks['checks']),
        'pilot_candidate_sha256': pilot_manifest['candidate_sha256'],
        'frontend': frontend,
        'full_reverse_rollback': rollback,
        'b4_fiscal_scope': b4_scope,
        'positive_fiscal_receivable': 'NOT_RUN_OUT_OF_SCOPE',
    }
    (staging / 'evidence-summary.json').write_text(json.dumps(evidence_summary, indent=2) + '\n')
    sources['evidence-summary.json'] = {
        'mode': 'GENERATED_FROM_PINNED_INPUTS',
        'inputs': [{'path': rel(E / 'checks.json'), 'sha256': sha(E / 'checks.json')}],
        'artifact_sha256': sha(staging / 'evidence-summary.json'),
    }
    (staging / 'artifact-sources.json').write_text(json.dumps(sources, indent=2) + '\n')

    previous = None
    if OUT.exists():
        previous = {
            'manifest_sha256': sha(OUT / 'manifest.json'),
            'pre_sha256': sha(OUT / '00-production-pre-posplans.sql.readonly'),
            'promoted': False,
        }
    files = {path.name: {'sha256': sha(path), 'bytes': path.stat().st_size} for path in sorted(staging.iterdir()) if path.is_file() and path.name != 'manifest.json'}
    manifest = {
        'status': 'REVIEW_ONLY_INACTIVE_NOT_APPROVED',
        'production_ref': REF,
        'hosted_io': False,
        'default_enabled': False,
        'evidence_directory': rel(E),
        'baseline': 'POSPLANOS + captura LIVE corrigida + diff independente; escopo estrito, sem migração ampla nem reinstalação de planos',
        'scope_metadata': scope_metadata,
        'current_catalog_evidence': {
            'pre': sha(E / 'current-catalog-baseline.json'),
            'post_plans': sha(E / 'current-catalog-posplans.json'),
            'tenant_guards': 6,
            'live_guard_capture_sha256': guard_source['capture_sha256'],
            'live_guard_function_md5': guard_source['functions'],
        },
        'pilot_containment': {
            'required_before_activation': True,
            'candidate_sha256': pilot_manifest['candidate_sha256'],
            'checks': len(pilot_checks['checks']),
            'master_switch_is_not_authority': True,
        },
        'previous_package': previous,
        'order': ['00 production PRE', '11/12 confirmation closed', '20/21/22 send closed', '30/31/32 physical OFF', '40/41/42 logistics OFF', '50/51/52 endpoint OFF', '60/61/62 ARBio containment OFF'],
        'rollback_order': ['89 pilot containment', '90 endpoint+reader', '94 logistics', '93 physical', '91 composed send+confirmation'],
        'excluded': ['commercial plan reinstall/rollback', 'B4', 'fiscal bridge', 'NF/NFS-e', 'receivables', 'payments', 'communication', 'frontend publication', 'automatic gate activation'],
        'authenticated_real_proof': 'NOT_RUN',
        'files': files,
    }
    (staging / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    assert files['00-production-pre-posplans.sql.readonly']['sha256'] != OLD_PRE_SHA256

    verify = H / 'verify_production_rollout.py'
    if verify.exists():
        import subprocess, sys
        result = subprocess.run([sys.executable, str(verify), str(staging)], cwd=ROOT, text=True, capture_output=True)
        assert result.returncode == 0, result.stdout + result.stderr

    if OUT.exists():
        archive = H / 'evidence' / f'superseded-{OUT.name}-before-{E.name}'
        assert not archive.exists(), archive
        shutil.move(str(OUT), str(archive))
        previous['archive'] = rel(archive)
        # Preserve the archive location in the final manifest without changing
        # any artifact payload; then recompute only the manifest itself.
        final_manifest = json.loads((staging / 'manifest.json').read_text())
        final_manifest['previous_package'] = previous
        (staging / 'manifest.json').write_text(json.dumps(final_manifest, indent=2) + '\n')
    staging.rename(OUT)
    print(json.dumps({'out': str(OUT), 'files': len(files), 'manifest_sha256': sha(OUT / 'manifest.json'), 'pre_sha256': sha(OUT / '00-production-pre-posplans.sql.readonly'), 'previous_package': previous}, indent=2))


if __name__ == '__main__':
    main()
