import unittest,copy,hashlib
from build import build,extend,TARGETS,FRESH,validate_signatures
from assemble import assemble
class Assembly(unittest.TestCase):
 def fixture(self):
  defs={sig:'CREATE OR REPLACE FUNCTION x() RETURNS void LANGUAGE plpgsql STABLE AS $$ BEGIN RETURN; END $$;\n' for sig in TARGETS+[FRESH]}
  for sig in TARGETS:
   if any(name in sig for name in ('upload_finalize','upload_access','upload_cancel_begin')):
    defs[sig]='CREATE FUNCTION x() RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE u platform_private.product_dossier_uploads; BEGIN SELECT * INTO u FROM platform_private.product_dossier_uploads WHERE id=p_upload_id; RETURN to_jsonb(u); END $$;'
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
  out=extend('platform_private.product_dossier_upload_finalize(uuid)',"DECLARE u platform_private.product_dossier_uploads; BEGIN SELECT * INTO u FROM platform_private.product_dossier_uploads WHERE id=p_upload_id; SELECT * INTO d FROM dossier FOR UPDATE;SELECT * INTO u FROM uploads FOR UPDATE;RETURN jsonb_build_object();END")
  self.assertEqual(out.count('product_dossier_structured_scope('),3)
 def test_unqualified_or_duplicate_signature_rejected(self):
  for signatures in [['tenant_product_dossier_management_save(uuid)'],[FRESH,FRESH],['public.x(p_id uuid) ,']]:
   with self.assertRaisesRegex(ValueError,'qualified unique'):validate_signatures(signatures)
 def test_upload_service_and_missing_alias_fail_closed(self):
  for body,error in [('BEGIN PERFORM platform_private.require_service_role(); RETURN; END','service-only'),('BEGIN RETURN; END','alias drift')]:
   with self.assertRaisesRegex(ValueError,error):extend('platform_private.product_dossier_upload_finalize(uuid)',body)
  for name in ['attest','cancel']:
   with self.assertRaisesRegex(ValueError,'unknown target'):extend('platform_private.product_dossier_upload_'+name+'(uuid)','BEGIN RETURN; END')
 def test_access_pending_preserve_canonical_manage_scope(self):
  for sig in ['platform_private.product_dossier_upload_access(uuid)','platform_private.product_dossier_upload_pending(uuid)']:
   body=self.fixture()[0][sig].replace('BEGIN','BEGIN PERFORM platform_private.product_dossier_manage_scope(p_product_id);',1)
   out=extend(sig,body)
   self.assertIn('product_dossier_manage_scope(p_product_id)',out)
   self.assertIn("'mutate'",out)
   self.assertNotIn("'read_catalog'",out)
 def test_service_wrappers_are_byte_preserved(self):
  d,p=self.fixture()
  for name in ['attest','cancel']:
   sig='public.tenant_product_dossier_upload_'+name+'(uuid)'
   body='CREATE FUNCTION public.x() RETURNS void LANGUAGE sql STABLE SECURITY INVOKER AS $$ SELECT platform_private.require_service_role() $$;'
   d[sig]=body;p[sig]=hashlib.md5(body.encode()).hexdigest()
  out=build(d,p)
  for sig in d:
   if sig.startswith('public.'):self.assertIn(d[sig],out)
 def test_fresh_metadata_post_rejected(self):
  fresh={'signature':FRESH,'definition':'x','volatile':'v','definer':True,'owner':'postgres','acl':'{postgres=X/postgres}'}
  pre={'functions':[fresh],'relations':[],'publications':None};post=copy.deepcopy(pre);post['functions'][0]['volatile']='s'
  with self.assertRaisesRegex(ValueError,'fresh authority'):assemble(pre,post,{})
 def test_publications_preserved(self):
  fresh={'signature':FRESH,'definition':'x','volatile':'v','definer':True,'owner':'postgres','acl':'{postgres=X/postgres}'}
  pre={'functions':[fresh],'relations':[],'publications':None};post=copy.deepcopy(pre);post['publications']=[]
  with self.assertRaisesRegex(ValueError,'publication drift'):assemble(pre,post,{})
if __name__=='__main__':unittest.main()
