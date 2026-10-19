from pathlib import Path
import json,tempfile,unittest
from stage import stage,H,ROOT
class Tests(unittest.TestCase):
 def test_candidate(self):
  d=Path(tempfile.mkdtemp())/'out';stage(d)
  for f in json.loads((H/'manifest.json').read_text())['files']:self.assertEqual((d/f['path']).read_bytes(),(ROOT/f['path']).read_bytes())
 def test_rollback(self):
  d=Path(tempfile.mkdtemp())/'out';stage(d,True)
  m=json.loads((H/'manifest.json').read_text())
  for f in m['files']:
   if f['rollback']:self.assertEqual((d/f['path']).read_bytes(),(H/f['rollback']).read_bytes())
  self.assertEqual(json.loads((d/'REMOVE-ONLY.json').read_text()),[f['path'] for f in m['files'] if not f['rollback']])
 def test_checkout_denied(self):
  with self.assertRaises(ValueError):stage(ROOT/'forbidden')
 def test_nonempty_denied(self):
  d=Path(tempfile.mkdtemp());(d/'keep').write_text('untouched')
  with self.assertRaises(ValueError):stage(d)
  self.assertEqual((d/'keep').read_text(),'untouched')
if __name__=='__main__':unittest.main()