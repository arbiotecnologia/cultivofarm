import hashlib, importlib.util, json, tempfile, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('financial_attachment_stage', HERE / 'stage.py')
if spec is None or spec.loader is None:
    raise RuntimeError('stage unavailable')
stage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(stage)

class Guards(unittest.TestCase):
    def test_outputs_byte_exact_and_rollback_only_panel(self):
        manifest = json.loads((HERE / 'manifest.json').read_bytes().decode('utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            for rollback in (False, True):
                dest = Path(tmp) / str(rollback)
                stage.stage(dest, rollback)
                for item in manifest['files']:
                    artifact = item['rollback' if rollback else 'candidate']
                    path = dest / item['path']
                    if artifact is None:
                        self.assertFalse(path.exists())
                    else:
                        self.assertEqual(path.read_bytes(), (HERE / artifact).read_bytes())
                        self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), item['pre_sha256' if rollback else 'post_sha256'])
                for protected in manifest['protected']:
                    self.assertFalse((dest / protected).exists())

    def rejection(self, protected):
        manifest = json.loads((HERE / 'manifest.json').read_bytes().decode('utf-8'))
        with tempfile.TemporaryDirectory() as tmp:
            original = stage.ROOT
            try:
                stage.ROOT = Path(tmp) / 'fake-root'
                for path in list(manifest['protected']) + [i['path'] for i in manifest['files']]:
                    p = stage.ROOT / path; p.parent.mkdir(parents=True, exist_ok=True)
                    p.write_bytes((original / path).read_bytes())
                bad = stage.ROOT / (next(iter(manifest['protected'])) if protected else manifest['files'][0]['path'])
                bad.write_bytes(bad.read_bytes() + b'// drift\r\n')
                dest = Path(tmp) / 'out'
                with self.assertRaisesRegex(ValueError, 'protected_drift' if protected else 'source_drift'):
                    stage.stage(dest, True)
                self.assertFalse(dest.exists())
            finally:
                stage.ROOT = original

    def test_monitor_drift_blocks_before_output(self):
        self.rejection(True)

    def test_panel_drift_blocks_before_output(self):
        self.rejection(False)

    def test_never_installs_in_project(self):
        with self.assertRaisesRegex(ValueError, 'outside project'):
            stage.stage(stage.ROOT / 'tmp-review')

if __name__ == '__main__':
    unittest.main()