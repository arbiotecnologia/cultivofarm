import importlib.util, json, tempfile, unittest
from pathlib import Path
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('financial_environment_stage', HERE / 'stage.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class Staging(unittest.TestCase):
    def test_candidate(self): self.check_mode('candidate')
    def test_rollback(self): self.check_mode('rollback')
    def check_mode(self, mode):
        with tempfile.TemporaryDirectory() as out:
            module.stage(out, mode)
            manifest = json.loads((HERE / 'manifest.json').read_bytes())
            for item in manifest['files']:
                if item[mode]: self.assertEqual((Path(out)/item['path']).read_bytes(), (HERE/item[mode]).read_bytes())
            if mode == 'rollback': self.assertEqual(json.loads((Path(out)/'REMOVE-NEW-FILES.review.json').read_bytes()), ['src/test/config/financialAdminEnvironment.integration.test.tsx'])
    def test_refuses_inside(self):
        with self.assertRaisesRegex(ValueError,'outside'): module.stage(module.ROOT, 'candidate')
    def test_refuses_nonempty(self):
        with tempfile.TemporaryDirectory() as out:
            (Path(out)/'keep').write_bytes(b'keep')
            with self.assertRaisesRegex(ValueError,'empty'): module.stage(out,'rollback')
    def test_drift_atomic(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)/'root'; here=Path(temp)/'here';out=Path(temp)/'out';root.mkdir();here.mkdir()
            (here/'manifest.json').write_bytes(b'drift')
            old_root,old_here=module.ROOT,module.HERE;module.ROOT,module.HERE=root,here
            try:
                with self.assertRaisesRegex(ValueError,'manifest_drift'): module.stage(out,'candidate')
                self.assertFalse(out.exists())
            finally: module.ROOT,module.HERE=old_root,old_here
if __name__ == '__main__': unittest.main()