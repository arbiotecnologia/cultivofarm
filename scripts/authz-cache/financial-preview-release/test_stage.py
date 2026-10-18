import hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError('module unavailable')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module
s = load(HERE / 'stage.py', 'financial_preview_stage')

class Tests(unittest.TestCase):
    def test_exact_bytes_all_modes(self):
        m = json.loads((HERE / 'manifest.json').read_bytes())
        with tempfile.TemporaryDirectory() as t:
            for mode in ('candidate', 'rollback', 'activation'):
                out = Path(t) / mode
                s.stage(out, mode)
                i = m['activation']
                label = 'rollback' if mode == 'rollback' else 'candidate'
                data = (out / i['path']).read_bytes()
                self.assertEqual(data, (HERE / i[label]).read_bytes())
                self.assertEqual(hashlib.sha256(data).hexdigest(), i['pre_sha256' if mode == 'rollback' else 'post_sha256'])

    def test_rollback_preserves_other_scopes(self):
        on = (HERE / 'financial-gate.on.review').read_bytes()
        off = (HERE / 'financial-gate.off.review').read_bytes()
        for data in (on, off):
            self.assertIn(b'AUTHZ_CACHE_FOUNDATION_ENABLED: boolean = true;', data)
            self.assertIn(b'PRODUCER_CONTEXT_MONITOR_ENABLED: boolean = true;', data)
            self.assertIn(b'AUTHZ_CACHE_ROLLOUT_SCOPE: "b2b-context"', data)
        self.assertIn(b'FINANCIAL_CONTEXT_MONITOR_ENABLED: boolean = true;', on)
        self.assertIn(b'FINANCIAL_CONTEXT_MONITOR_ENABLED: boolean = false;', off)
        # Excluding the authorized financial comment/flag delta, every other byte is identical.
        self.assertEqual(on.split(b'// Financial-only')[0], off.split(b'// Financial-only')[0])

    def test_old_manifests_refuse_current_gate_without_output(self):
        for name in ('financial-open-session', 'producer-open-session', 'producer-preference-release', 'principal-draft-release', 'b2b-open-session'):
            stage_path = HERE.parent / name / ('stage-review.py' if name == 'b2b-open-session' else 'stage.py')
            old = load(stage_path, 'historical_' + name.replace('-', '_'))
            with tempfile.TemporaryDirectory() as t:
                for mode in ('candidate', 'rollback', 'activation'):
                    out = Path(t) / mode
                    if name == 'b2b-open-session':
                        manifest = json.loads((stage_path.parent / 'manifest.json').read_bytes())
                        receipt = json.loads((stage_path.parent / 'receipt-preview-20261018-2255.json').read_bytes())
                        with self.assertRaisesRegex(ValueError, 'source_drift|receipt_manifest_mismatch'):
                            old.stage(manifest, receipt, out)
                        self.assertFalse(out.exists())
                        continue
                    with self.assertRaises(ValueError):
                        old.stage(out, mode)
                    self.assertFalse(out.exists())

    def test_source_drift_no_partial_output(self):
        with tempfile.TemporaryDirectory() as t:
            old = s.ROOT
            s.ROOT = Path(t) / 'fake'
            try:
                m = json.loads((HERE / 'manifest.json').read_bytes())
                for i in m['files']:
                    p = s.ROOT / i['path']
                    p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes((HERE / i['candidate']).read_bytes() + b'drift')
                for mode in ('candidate', 'rollback', 'activation'):
                    out = Path(t) / mode
                    with self.assertRaisesRegex(ValueError, 'source_drift'):
                        s.stage(out, mode)
                    self.assertFalse(out.exists())
            finally:
                s.ROOT = old

if __name__ == '__main__':
    unittest.main()