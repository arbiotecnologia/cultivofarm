import importlib.util, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('application_stage', HERE/'stage.py')
module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
class StageTests(unittest.TestCase):
    def test_candidate_and_rollback_exact(self):
        m=json.loads((HERE/'manifest.json').read_text())
        with tempfile.TemporaryDirectory() as tmp:
            for rollback in (False,True):
                out=Path(tmp)/str(rollback); module.stage(out,rollback)
                for item in m['files']:
                    label='rollback' if rollback else 'candidate'
                    if item.get(label): self.assertEqual((out/item['path']).read_bytes(),(HERE/item[label]).read_bytes())
                    else: self.assertIn(item['path'],json.loads((out/'REMOVE-ONLY.json').read_text()))
    def test_inside_project_denied(self):
        with self.assertRaises(ValueError): module.stage(module.ROOT/'review-output')
    def test_manifest_drift_atomic(self): self.drift(HERE/'manifest.json')
    def test_source_drift_atomic(self): self.drift(module.ROOT/'src/lib/pdfAplicacao.ts')
    def test_candidate_drift_atomic(self): self.drift(HERE/'candidate/src/lib/pdfAplicacao.ts')
    def test_rollback_drift_atomic(self): self.drift(HERE/'rollback/src/lib/pdfAplicacao.ts')
    def test_preflight_drift_atomic(self): self.drift(HERE/'preflight-readonly.sql')
    def drift(self,target):
        original=Path.read_bytes
        def altered(path): return original(path)+(b'\r\nacentua\xc3\xa7\xc3\xa3o\n' if path==target else b'')
        with tempfile.TemporaryDirectory() as tmp,patch.object(Path,'read_bytes',altered):
            out=Path(tmp)/'out'
            with self.assertRaises(ValueError): module.stage(out)
            self.assertFalse(out.exists())
if __name__=='__main__': unittest.main()