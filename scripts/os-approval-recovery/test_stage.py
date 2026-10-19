from pathlib import Path
import importlib.util,tempfile,unittest,json,hashlib,subprocess,shutil
from unittest.mock import patch
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
 def test_exact_immutable_baseline(self):
  data=subprocess.run(['git','show',m.BASELINE_COMMIT+':'+m.BASELINE_PATH],cwd=m.ROOT,check=True,capture_output=True).stdout
  self.assertEqual(hashlib.sha256(data).hexdigest(),'9c20bd608f1cd8109df806ea4cc5db829ce3a9aaadd20e652e856d024cc0bc37')
  self.assertEqual((H/'rollback/OSDetalhesDialog.tsx').read_bytes(),data)
  self.assertNotEqual(hashlib.sha256((m.ROOT/m.BASELINE_PATH).read_bytes()).hexdigest(),hashlib.sha256(data).hexdigest())
 def assert_manifest_refusal(self,change,reason):
  with tempfile.TemporaryDirectory() as temp:
   package=Path(temp)/'package';shutil.copytree(H,package)
   manifest=json.loads((package/'manifest.json').read_bytes());change(manifest,package)
   (package/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
   (package/'manifest.sha256').write_text(m.sha(package/'manifest.json')+'\n')
   dest=Path(temp)/'out'
   with patch.object(m,'H',package):
    with self.assertRaisesRegex(ValueError,reason):m.stage(dest,True)
   self.assertFalse(dest.exists())
 def test_rehashed_moving_baseline_rejected(self):
  self.assert_manifest_refusal(lambda manifest,_:manifest.update(baseline_commit='HEAD'),'baseline_commit_drift')
 def test_rehashed_pre_equals_post_rejected(self):
  self.assert_manifest_refusal(lambda manifest,_:manifest['files'][0].update(pre=manifest['files'][0]['post']),'baseline_hash_drift')
 def test_rehashed_candidate_as_rollback_rejected(self):
  def change(manifest,package):
   (package/'rollback/OSDetalhesDialog.tsx').write_bytes((m.ROOT/m.BASELINE_PATH).read_bytes())
  self.assert_manifest_refusal(change,'source_drift')
 def test_inside_rejected(self):
  with self.assertRaisesRegex(ValueError,'destination_inside_project'):m.stage(m.ROOT/'tmp')
 def test_nonempty_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   (Path(d)/'other').write_text('untouched')
   with self.assertRaisesRegex(ValueError,'destination_not_empty'):m.stage(d)
   self.assertEqual((Path(d)/'other').read_text(),'untouched')
if __name__=='__main__':unittest.main()
