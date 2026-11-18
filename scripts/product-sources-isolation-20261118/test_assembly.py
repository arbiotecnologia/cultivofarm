import unittest, tempfile, json
from pathlib import Path
from assemble import assemble,read_capture
class Gates(unittest.TestCase):
 def test_explicit_binding(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'capture.json';p.write_text(json.dumps({'ref':'swzpzcwiasxmjutrmvkm','provenance':'synthetic','catalog':{}}))
   with self.assertRaises(ValueError):read_capture(p,'swzpzcwiasxmjutrmvkm')
   with self.assertRaises(ValueError):read_capture(p,'wrong')
 def test_absent_catalog(self):
  with self.assertRaises(ValueError):assemble({}, {},'a'*32)
 def test_no_fake_pin(self):
  with self.assertRaises(ValueError):assemble({}, {},'fake')
 def test_stable_actor_closed(self):
  state={'relations':[{'rls':True},{'rls':True}],'functions':[{'signature':'platform_private.recorte_a_actor_fresh(text)','body':'a'*32,'volatile':'s','definer':True}],'publications':None}
  with self.assertRaisesRegex(ValueError,'fresh authority'):assemble(state,state,'a'*32)
if __name__=='__main__':unittest.main()