import hashlib, json, tempfile, unittest
from pathlib import Path
from stage import stage
HERE = Path(__file__).resolve().parent
MANIFEST = json.loads((HERE / "manifest.json").read_text())

class StageTests(unittest.TestCase):
    def seed(self, root):
        for entry in MANIFEST['files']:
            p = root / entry['path']; p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes((HERE / entry['rollback']).read_bytes())
    def test_roundtrip_bytes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.seed(root)
            stage(root, 'candidate')
            for e in MANIFEST['files']:
                self.assertEqual(hashlib.sha256((root/e['path']).read_bytes()).hexdigest(), e['candidate_sha256'])
            stage(root, 'rollback')
            for e in MANIFEST['files']:
                self.assertEqual((root/e['path']).read_bytes(), (HERE/e['rollback']).read_bytes())
    def test_second_file_drift_writes_nothing(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); self.seed(root)
            last = root / MANIFEST['files'][-1]['path']; last.write_bytes(last.read_bytes()+b'\r\n// drift')
            before = {e['path']: (root/e['path']).read_bytes() for e in MANIFEST['files']}
            with self.assertRaises(ValueError): stage(root, 'candidate')
            for path, data in before.items(): self.assertEqual((root/path).read_bytes(), data)

if __name__ == '__main__': unittest.main()
