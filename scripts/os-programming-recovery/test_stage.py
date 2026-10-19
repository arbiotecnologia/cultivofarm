from pathlib import Path
import importlib.util,tempfile,unittest,json,hashlib,shutil
from unittest.mock import patch
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('program_stage',H/'stage.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class StageTests(unittest.TestCase):
 def test_self_contained_rollback_and_distinct_guards(self):
  rollback=(H/'rollback.sql.review').read_text();candidate=(H/'candidate.sql.review').read_text()
  self.assertNotIn('TEMP',rollback)
  self.assertIn((H/'rollback/rpc.sql.review').read_text(),rollback)
  self.assertIn('a42d6b07f51e6dacf41096f6cefb8163',(H/'preflight-readonly.sql').read_text())
  self.assertNotEqual((H/'preflight-readonly.sql').read_bytes(),(H/'postflight-readonly.sql').read_bytes())
  self.assertIn('TO authenticated;',candidate)
  self.assertNotIn('TO service_role;',candidate)
  self.assertIn('TO service_role;',rollback)
 def test_candidate_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   m.stage(d);f=json.loads((H/'manifest.json').read_text())['runtime']
   self.assertEqual((Path(d)/f['path']).read_bytes(),(m.ROOT/f['path']).read_bytes())
 def test_rollback_bytes(self):
  with tempfile.TemporaryDirectory() as d:
   m.stage(d,True);f=json.loads((H/'manifest.json').read_text())['runtime']
   self.assertEqual(hashlib.sha256((Path(d)/f['path']).read_bytes()).hexdigest(),m.PRE)
 def test_moving_baseline_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'pkg';shutil.copytree(H,p,ignore=shutil.ignore_patterns('snapshot','__pycache__'))
   manifest=json.loads((p/'manifest.json').read_text());manifest['baseline_commit']='HEAD'
   (p/'manifest.json').write_text(json.dumps(manifest))
   with patch.object(m,'H',p):
    with self.assertRaisesRegex(ValueError,'fixed_baseline_drift'):m.stage(Path(d)/'out')
 def test_inside_rejected(self):
  with self.assertRaisesRegex(ValueError,'destination_inside_project'):m.stage(m.ROOT/'tmp')
 def test_nonempty_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/'keep').write_text('keep')
   with self.assertRaisesRegex(ValueError,'destination_not_empty'):m.stage(d)
if __name__=='__main__':unittest.main()