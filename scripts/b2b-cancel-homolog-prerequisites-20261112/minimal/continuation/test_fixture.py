import unittest
from fixture_hosted import fixture_request
class FixtureRules(unittest.TestCase):
 def test_wrong_target(self):
  with self.assertRaisesRegex(ValueError,'WRONG_TARGET'):fixture_request({'target_ref':'swzpzcwiasxmjutrmvkm'},{},{})
 def test_uncertain_key(self):
  with self.assertRaisesRegex(ValueError,'RECONCILE_SAME_KEY'):
   fixture_request({'target_ref':'vrlcdwmlytukrjezrrnf','external_delivery_disabled':True,'actor_id':'actor','organization_id':'org'},{},{'state':'uncertain','key':'same-key'})
 def test_hosted_guard_not_reviewed(self):
  with self.assertRaisesRegex(ValueError,'E_STATEMENT_BARRIER_REVIEW_REQUIRED'):
   fixture_request({'target_ref':'vrlcdwmlytukrjezrrnf','external_delivery_disabled':True,'actor_id':'actor','organization_id':'org'},{},{'key':'same-key'})
 def test_client_flag_never_authorizes_provider(self):
  with self.assertRaisesRegex(ValueError,'E_REGISTERED_INTENT_ADAPTER_NOT_INSTALLED'):
   fixture_request({'target_ref':'vrlcdwmlytukrjezrrnf','external_delivery_disabled':True,'actor_id':'actor','organization_id':'org','stage_E_reviewed':True},{},{'key':'same-key'})
if __name__=='__main__':unittest.main()