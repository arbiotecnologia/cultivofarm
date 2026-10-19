import importlib.util,unittest,tempfile,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('stage',Path(__file__).with_name('stage.py'))
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class StageTests(unittest.TestCase):
 def test_candidate(self):
  with tempfile.TemporaryDirectory() as t:
   s.stage(t)
   for f in json.loads((s.H/'manifest.json').read_bytes())['files']:
    self.assertEqual((Path(t)/f['path']).read_bytes(),(s.ROOT/f['path']).read_bytes())
 def test_rollback(self):
  with tempfile.TemporaryDirectory() as t:
   s.stage(t,True)
   for f in json.loads((s.H/'manifest.json').read_bytes())['files']:
    self.assertEqual((Path(t)/f['path']).read_bytes(),(s.H/f['rollback']).read_bytes())
 def test_checkout(self):
  with self.assertRaisesRegex(ValueError,'inside_project'):s.stage(s.ROOT/'out')
 def test_nonempty(self):
  with tempfile.TemporaryDirectory() as t:
   p=Path(t)/'keep';p.write_text('keep')
   with self.assertRaisesRegex(ValueError,'not_empty'):s.stage(t)
   self.assertEqual(list(Path(t).iterdir()),[p])
if __name__=='__main__':unittest.main()
