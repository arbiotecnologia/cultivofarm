"""Original package composition in socket-only disposable PG; never hosted SQL."""
import hashlib
import importlib.util
import json
from pathlib import Path
import db

H = Path(__file__).resolve().parent
ROOT = H.parents[2]
CCR = 'scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/production-rollout-posplans-20261108-condition-contract-required/rev2-coherence-20261109'
PACKAGES = [
    CCR + '/81-ccr2-install.sql.review', CCR + '/82-ccr2-post.sql.readonly',
    'scripts/c2-pilot-economic-approval-20261111/01-pre.sql.readonly',
    'scripts/c2-pilot-economic-approval-20261111/02-install.sql.review',
    'scripts/c2-pilot-economic-approval-20261111/03-post.sql.readonly',
    'scripts/c2-fiscal-cancel-audit-20261111/diagnostic/01-pre.sql.readonly',
    'scripts/c2-fiscal-cancel-audit-20261111/diagnostic/02-install.sql.review',
    'scripts/c2-fiscal-cancel-audit-20261111/diagnostic/03-post.sql.readonly',
    'scripts/c2-fiscal-cancel-audit-20261111/event-sequence/01-pre.sql.readonly',
    'scripts/c2-fiscal-cancel-audit-20261111/event-sequence/02-install.sql.review',
    'scripts/c2-fiscal-cancel-audit-20261111/event-sequence/03-post.sql.readonly',
]
MARK = "SET app.expected_ref='swzpzcwiasxmjutrmvkm';SET c2pilot.expected_ref='swzpzcwiasxmjutrmvkm';"
PRIVATE = ['fiscal_close_pending', 'b2b_financial_forecasts', 'b2b_allocation_reversals',
           'b2b_document_allocations', 'b2b_fiscal_service_permits', 'b2b_fiscal_invoice_snapshots',
           'b2b_financial_forecast_events', 'b2b_forecast_lifecycle_gate_v1', 'b2b_forecast_lifecycle_allowlist_v1']


def compose(out):
    out.mkdir(exist_ok=True)
    d = db.DB()
    d.md5 = lambda s: d.last(f"SELECT md5(pg_get_functiondef('{s}'::regprocedure))")
    p = ROOT / 'scripts/c2-pilot-economic-approval-20261111/fixture.py'
    spec = importlib.util.spec_from_file_location('original_fixture', p)
    if spec is None or spec.loader is None:
        raise RuntimeError('ORIGINAL_FIXTURE_LOADER')
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    fixture = m.Mirror.__new__(m.Mirror)
    fixture.d = d
    rows = [{'path': p, 'sha256': h, 'exit': 0} for p, h in fixture.install_reported_stack().items()]
    for path in PACKAGES:
        f = ROOT / path
        r = d.raw(MARK + f.read_text())
        rows.append({'path': path, 'sha256': hashlib.sha256(f.read_bytes()).hexdigest(), 'exit': r.returncode, 'stderr': r.stderr})
        (out / 'original-packages.json').write_text(json.dumps(rows, indent=2) + '\n')
        if r.returncode:
            raise RuntimeError(path + ':' + r.stderr)
    # Reproduce only the owner-reported ACL delta, exclusively in disposable PG.
    # No permissions/RLS changes belong to the production cancellation installer.
    d.sql('REVOKE TRUNCATE,REFERENCES,TRIGGER ON public.partner_orders,public.partner_accounts FROM anon,authenticated;')
    for rel in PRIVATE:
        d.sql(f'GRANT ALL ON TABLE platform_private.{rel} TO postgres;')
    d.sql("DO $$BEGIN IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='platform_private.b2b_financial_forecasts'::regclass AND tgenabled<>'O' AND NOT tgisinternal) THEN RAISE EXCEPTION 'LOCAL_DISABLED_FORECAST_CONTROL';END IF;END$$;")
    (out / 'acl-origin.json').write_text(json.dumps({'source': 'Owner integral metadata delta 2026-11-12 02:20 UTC', 'public_removed': ['TRUNCATE','REFERENCES','TRIGGER'], 'private_explicit_owner': PRIVATE, 'hosted': False}, indent=2) + '\n')
    return d