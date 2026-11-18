"""Offline negative capture/gate tests. Synthetic data never authorizes installation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
H=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('product_assembly',H/'assemble.py')
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
class CaptureTests(unittest.TestCase):
 def test_no_synthetic_provenance(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'capture.json';p.write_text(json.dumps({'ref':'vrlcdwmlytukrjezrrnf','provenance':'synthetic'}),encoding='utf-8',newline='\n')
   with self.assertRaisesRegex(AssertionError,'EXACT_ROOT'):module.read_capture(p)
 def test_ref_fail_closed(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'capture.json';p.write_text('{}',encoding='utf-8',newline='\n')
   with self.assertRaisesRegex(AssertionError,'REF_DENIED'):module.read_capture(p)
 def test_utf8_roundtrip_required(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'capture.json';p.write_text(json.dumps({'ref':'vrlcdwmlytukrjezrrnf','provenance':'root-exact-catalog','catalog':{'functions':[{'definition':'ação','md5':'fake'}],'relations':[],'config':[]}}),encoding='utf-8',newline='\n')
   with self.assertRaisesRegex(AssertionError,'ROUNDTRIP'):module.read_capture(p)
 def test_crlf_not_repinned(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp)/'capture.json';p.write_text(json.dumps({'ref':'vrlcdwmlytukrjezrrnf','provenance':'root-exact-catalog','catalog':{'functions':[{'definition':'ação\r\n','md5':'fake'}],'relations':[],'config':[]}}),encoding='utf-8',newline='\n')
   with self.assertRaisesRegex(AssertionError,'CRLF_DENIED'):module.read_capture(p)
 def test_reader_body_not_stale_or_delimiter_dependent(self):
  canonical="CREATE FUNCTION f() RETURNS void AS $f$BEGIN RETURN; END$f$;"
  captured="CREATE FUNCTION f() RETURNS void AS $function$BEGIN RETURN; END$function$;"
  self.assertEqual(module.function_body(canonical),module.function_body(captured))
  self.assertNotEqual(module.function_body(canonical),module.function_body(captured.replace('RETURN;','RAISE EXCEPTION;')))
 def test_body_missing_fails_closed(self):
  with self.assertRaisesRegex(AssertionError,'BODY_REQUIRED'):module.function_body('CREATE FUNCTION f();')
if __name__=='__main__':unittest.main()
