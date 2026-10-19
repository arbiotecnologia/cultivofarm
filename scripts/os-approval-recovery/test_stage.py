from pathlib import Path
import importlib.util,tempfile,unittest,json,hashlib
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('approval_stage',H/'stage.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class StageTests(unittest.TestCase):
 def test_candidate_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   m.stage(d)
   for f in json.loads((H/'manifest.json').read_bytes())['files']:self.assertEqual((Path(d)/f['path']).read_bytes(),(m.ROOT/f['path']).read_bytes())
 def test_rollback_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   m.stage(d,True)
   for f in json.loads((H/'manifest.json').read_bytes())['files']:self.assertEqual((Path(d)/f['path']).read_bytes(),(H/f['rollback']).read_bytes())
 def test_inside_rejected(self):
  with self.assertRaisesRegex(ValueError,'destination_inside_project'):m.stage(m.ROOT/'tmp')
 def test_nonempty_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/'other').write_text('untouched')
   with self.assertRaisesRegex(ValueError,'destination_not_empty'):m.stage(d)
   self.assertEqual((Path(d)/'other').read_text(),'untouched')
if __name__=='__main__':unittest.main()
