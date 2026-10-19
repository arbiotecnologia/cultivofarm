import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('admin_stage', HERE / 'stage.py')
if spec is None or spec.loader is None:
    raise RuntimeError('stage_missing')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class StageTests(unittest.TestCase):
    def test_byte_exact_four_modes(self):
        manifest = json.loads((HERE / 'manifest.json').read_bytes())
        for mode in ('candidate', 'rollback', 'activation', 'deactivation'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as tmp:
                out = Path(tmp) / 'out'
                module.stage(out, mode)
                items = [manifest['activation']] if mode in ('activation','deactivation') else manifest['files']
                label = 'rollback' if mode in ('rollback','deactivation') else 'candidate'
                for item in items:
                    if item[label] is not None:
                        self.assertEqual((out/item['path']).read_bytes(), (HERE/item[label]).read_bytes())
                if mode in ('activation','deactivation'):
                    gate = (out/manifest['activation']['path']).read_bytes()
                    self.assertIn(b'FINANCIAL_CONTEXT_MONITOR_ENABLED: boolean = true', gate)
                    self.assertIn(b'PRODUCER_CONTEXT_MONITOR_ENABLED: boolean = true', gate)
                    self.assertIn(b'COMPANY_ADMIN_CONTEXT_MONITOR_ENABLED: boolean = '+(b'true' if mode=='activation' else b'false'), gate)
    def test_drift_refused_without_partial_output(self):
        original = module.ROOT
        manifest = json.loads((HERE/'manifest.json').read_bytes())
        try:
            with tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)/'root'
                for path in manifest['source_sha256']:
                    target=root/path
                    target.parent.mkdir(parents=True,exist_ok=True)
                    target.write_bytes((original/path).read_bytes())
                target.write_bytes(target.read_bytes()+b'drift')
                module.ROOT=root
                for mode in ('candidate','rollback','activation','deactivation'):
                    out=Path(tmp)/mode
                    with self.assertRaisesRegex(ValueError,'source_drift'):
                        module.stage(out,mode)
                    self.assertFalse(out.exists())
        finally:
            module.ROOT=original
    def test_nonempty_and_project_output_refused(self):
        with self.assertRaisesRegex(ValueError,'outside_project'):
            module.stage(module.ROOT/'bad','candidate')
        with tempfile.TemporaryDirectory() as tmp:
            (Path(tmp)/'keep').write_bytes(b'keep')
            with self.assertRaisesRegex(ValueError,'empty_destination'):
                module.stage(tmp,'rollback')
            self.assertEqual((Path(tmp)/'keep').read_bytes(),b'keep')
    def test_binary_unicode_lf_crlf(self):
        for data in ('Revogação\n','Revogação\r\n'):
            raw=data.encode('utf-8')
            with tempfile.TemporaryDirectory() as tmp:
                path=Path(tmp)/'bytes'
                path.write_bytes(raw)
                self.assertEqual(path.read_bytes(),raw)
                self.assertEqual(module.sha(path.read_bytes()),module.sha(raw))
if __name__=='__main__':
    unittest.main()