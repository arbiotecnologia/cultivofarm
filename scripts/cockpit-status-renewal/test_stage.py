import importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
R=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('stage',R/'stage.py')
stage=importlib.util.module_from_spec(spec);spec.loader.exec_module(stage)
class StageTests(unittest.TestCase):
 def test_fixed_hashes(self):stage.verify()
 def test_wrong_project(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);(root/'manifest.json').write_text(json.dumps({'project_ref':'wrong','files':{}}))
   with patch.object(stage,'R',root),self.assertRaisesRegex(ValueError,'WRONG_PROJECT'):stage.verify()
 def test_artifact_drift(self):
  with tempfile.TemporaryDirectory() as t:
   root=Path(t);(root/'x').write_text('changed');(root/'manifest.json').write_text(json.dumps({'project_ref':'swzpzcwiasxmjutrmvkm','files':{'x':'0'*64}}))
   with patch.object(stage,'R',root),self.assertRaisesRegex(ValueError,'ARTIFACT_DRIFT'):stage.verify()
if __name__=='__main__':unittest.main()