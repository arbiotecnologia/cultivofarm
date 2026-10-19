import importlib.util, json, tempfile, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('receipt_stage', HERE / 'stage.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class StageTests(unittest.TestCase):
    def test_candidate_bytes(self):
        with tempfile.TemporaryDirectory() as out:
            module.stage(Path(out))
            for item in json.loads((HERE / 'manifest.json').read_bytes())['files']:
                self.assertEqual((Path(out) / item['path']).read_bytes(), (HERE / item['candidate']).read_bytes())
    def test_rollback_bytes_and_explicit_dependency_removal(self):
        with tempfile.TemporaryDirectory() as out:
            module.stage(Path(out), True)
            manifest = json.loads((HERE / 'manifest.json').read_bytes())
            for item in manifest['files']:
                if item.get('rollback'):
                    self.assertEqual((Path(out) / item['path']).read_bytes(), (HERE / item['rollback']).read_bytes())
            self.assertEqual(json.loads((Path(out) / 'REMOVE-ONLY.json').read_bytes()), ['src/lib/financeiro/receiptStorageLocator.ts'])
    def test_refuses_project_destination(self):
        with self.assertRaisesRegex(ValueError, 'destination'): module.stage(module.ROOT)
    def test_source_drift_atomic(self): self.drift('source')
    def test_artifact_drift_atomic(self): self.drift('artifact')
    def drift(self, kind):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'root'; here = Path(temp) / 'here'; out = Path(temp) / 'out'
            root.mkdir(); here.mkdir()
            payload = b'acento \xc3\xa7\r\n'
            (root / 'file').write_bytes(payload); (here / 'candidate').write_bytes(payload); (here / 'rollback').write_bytes(b'old\n')
            manifest = {'protected': [], 'files': [{'path': 'file', 'candidate': 'candidate', 'rollback': 'rollback', 'post_sha256': module.sha(payload), 'pre_sha256': module.sha(b'old\n')}]}
            (here / 'manifest.json').write_text(json.dumps(manifest))
            (root / 'file' if kind == 'source' else here / 'candidate').write_bytes(b'drift')
            old_root, old_here = module.ROOT, module.HERE
            module.ROOT, module.HERE = root, here
            try:
                with self.assertRaisesRegex(ValueError, 'drift'): module.stage(out)
                self.assertFalse(out.exists())
            finally: module.ROOT, module.HERE = old_root, old_here
if __name__ == '__main__': unittest.main()