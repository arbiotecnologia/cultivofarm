import unittest,copy,hashlib
from build import build,extend,TARGETS,FRESH
from assemble import assemble
class Assembly(unittest.TestCase):
 def fixture(self):
  defs={sig:'CREATE OR REPLACE FUNCTION x() RETURNS void LANGUAGE plpgsql STABLE AS $$ BEGIN RETURN; END $$;\n' for sig in TARGETS+[FRESH]}
  defs['platform_private.product_dossier_coverage(uuid)']="CREATE FUNCTION x() RETURNS uuid[] LANGUAGE sql AS $$ SELECT CASE WHEN cardinality(covered_microorganism_ids)=0 THEN ARRAY[microorganism_id] ELSE covered_microorganism_ids END FROM d $$;\n"
  pins={k:hashlib.md5(v.encode()).hexdigest() for k,v in defs.items()};return defs,pins
 def test_pin_drift(self):
  d,p=self.fixture();d[FRESH]+=' '
  with self.assertRaisesRegex(ValueError,'pin mismatch'):build(d,p)
 def test_missing_canonical_dependency(self):
  d,p=self.fixture();del d[TARGETS[0]]
  with self.assertRaisesRegex(ValueError,'closure'):build(d,p)
 def test_exact_coverage_anchor(self):
  with self.assertRaisesRegex(ValueError,'anchor drift'):extend('platform_private.product_dossier_coverage(uuid)','SELECT 1')
 def test_gate_default_and_no_public_grants(self):
  d,p=self.fixture();out=build(d,p);self.assertIn('enabled boolean NOT NULL DEFAULT false',out);self.assertNotIn('GRANT USAGE',out);self.assertNotIn('CREATE TABLE public.',out)
 def test_wrappers_must_be_canonical(self):
  d,p=self.fixture();d['public.fake()']='fake';p['public.fake()']=hashlib.md5(b'fake').hexdigest()
  with self.assertRaisesRegex(ValueError,'unexpected public'):build(d,p)
 def test_upload_reauth_every_lock_and_return(self):
  out=extend('platform_private.product_dossier_upload_finalize(uuid)',"BEGIN SELECT * INTO d FROM dossier FOR UPDATE;SELECT * INTO u FROM uploads FOR UPDATE;RETURN jsonb_build_object();END")
  self.assertEqual(out.count('product_dossier_structured_scope('),3)
 def test_fresh_metadata_post_rejected(self):
  fresh={'signature':FRESH,'definition':'x','volatile':'v','definer':True,'owner':'postgres','acl':'{postgres=X/postgres}'}
  pre={'functions':[fresh],'relations':[],'publications':None};post=copy.deepcopy(pre);post['functions'][0]['volatile']='s'
  with self.assertRaisesRegex(ValueError,'fresh authority'):assemble(pre,post,{})
 def test_publications_preserved(self):
  fresh={'signature':FRESH,'definition':'x','volatile':'v','definer':True,'owner':'postgres','acl':'{postgres=X/postgres}'}
  pre={'functions':[fresh],'relations':[],'publications':None};post=copy.deepcopy(pre);post['publications']=[]
  with self.assertRaisesRegex(ValueError,'publication drift'):assemble(pre,post,{})
if __name__=='__main__':unittest.main()
