import hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('attachment_stage', HERE / 'stage.py')
if spec is None or spec.loader is None:
    raise RuntimeError('stage module unavailable')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)

class Guards(unittest.TestCase):
    def test_exact_outputs(self):
        manifest = json.loads((HERE / 'manifest.json').read_bytes().decode('utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            for rollback in (False, True):
                dest = Path(tmp) / str(rollback)
                stage.stage(dest, rollback)
                for item in manifest['files']:
                    data = (dest / item['path']).read_bytes()
                    self.assertEqual(hashlib.sha256(data).hexdigest(), item['pre_sha256' if rollback else 'post_sha256'])
                    self.assertEqual(data, (HERE / item['rollback' if rollback else 'candidate']).read_bytes())

    def test_drift_rejected_before_any_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = stage.ROOT
            try:
                stage.ROOT = Path(tmp) / 'fake-root'
                manifest = json.loads((HERE / 'manifest.json').read_bytes().decode('utf-8'))
                for item in manifest['files']:
                    p = stage.ROOT / item['path']; p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes((HERE / item['candidate']).read_bytes())
                bad = stage.ROOT / manifest['files'][-1]['path']
                bad.write_bytes(bad.read_bytes() + b'// drift\n')
                dest = Path(tmp) / 'output'
                with self.assertRaisesRegex(ValueError, 'source_drift'):
                    stage.stage(dest, True)
                self.assertFalse(dest.exists())
            finally:
                stage.ROOT = original

if __name__ == '__main__':
    unittest.main()