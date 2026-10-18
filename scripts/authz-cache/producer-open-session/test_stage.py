import hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('producer_stage',HERE/'stage.py')
if spec is None or spec.loader is None:raise RuntimeError('module unavailable')
s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
class Tests(unittest.TestCase):
 def test_exact_bytes_all_modes(self):
  m=json.loads((HERE/'manifest.json').read_bytes().decode('utf-8'))
  with tempfile.TemporaryDirectory() as t:
   for mode in ('candidate','rollback','activation'):
    out=Path(t)/mode;s.stage(out,mode)
    for i in ([m['activation']] if mode=='activation' else m['files']):
     k='rollback' if mode=='rollback' else 'candidate'
     if i[k] is None:
      self.assertIn(i['path'],json.loads((out/'REMOVE-NEW-FILES.review.json').read_bytes()));continue
     data=(out/i['path']).read_bytes();self.assertEqual(data,(HERE/i[k]).read_bytes());self.assertEqual(hashlib.sha256(data).hexdigest(),i['pre_sha256' if k=='rollback' else 'post_sha256'])
 def test_drift_no_partial_output(self):
  with tempfile.TemporaryDirectory() as t:
   old=s.ROOT;s.ROOT=Path(t)/'fake'
   try:
    m=json.loads((HERE/'manifest.json').read_bytes().decode('utf-8'))
    for i in m['files']:
     p=s.ROOT/i['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((HERE/i['candidate']).read_bytes())
    p.write_bytes(p.read_bytes()+b'drift')
    for mode in ('candidate','rollback','activation'):
     out=Path(t)/mode
     with self.assertRaisesRegex(ValueError,'source_drift'):s.stage(out,mode)
     self.assertFalse(out.exists())
   finally:s.ROOT=old
if __name__=='__main__':unittest.main()
