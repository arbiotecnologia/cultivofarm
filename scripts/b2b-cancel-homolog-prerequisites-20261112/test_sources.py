import importlib.util
import unittest
from pathlib import Path
H=Path(__file__).resolve().parent
def module(name):
 spec=importlib.util.spec_from_file_location(name,H/(name+'.py'))
 m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
f=module('fixture_source');b=module('build')
class Sources(unittest.TestCase):
 def ctx(self):return dict(target_ref=f.TARGET,catalog_reviewed=True,external_delivery_disabled=True,actor_id='real',organization_id='seller')
 def test_exact_homolog(self):
  c=self.ctx();c['target_ref']='swzpzcwiasxmjutrmvkm'
  with self.assertRaisesRegex(ValueError,'WRONG_TARGET'):f.validate_context(c)
 def test_external_off_required(self):
  c=self.ctx();c['external_delivery_disabled']=False
  with self.assertRaisesRegex(ValueError,'EXTERNAL_DELIVERY'):f.validate_context(c)
 def test_no_hosted_simulation(self):
  with self.assertRaisesRegex(ValueError,'HOSTED_FISCAL'):f.simulate_fiscal_payment(self.ctx(),lambda *_:self.fail('dispatch'),'NF_AUTHORIZATION_CALLBACK',{})
 def test_local_simulation(self):
  c=self.ctx();c['execution_mode']='DISPOSABLE_LOCAL';calls=[]
  f.simulate_fiscal_payment(c,lambda *a:calls.append(a),'RECEIVABLE_PAYMENT_RPC',{'amount_received':1})
  self.assertEqual(calls,[('RECEIVABLE_PAYMENT_RPC',{'amount_received':1})])
 def test_uncertain_never_redispatch(self):
  with self.assertRaisesRegex(ValueError,'RECONCILE_SAME'):f.create_order(self.ctx(),lambda *_:self.fail('dispatch'),{},dict(state='uncertain',key='retained'))
 def test_committed_replay(self):
  r=dict(state='committed',order_id='existing');self.assertIs(f.create_order(self.ctx(),lambda *_:self.fail('dispatch'),{},r),r)
 def test_reported_matrix(self):
  pins=__import__('json').loads((b.CANDIDATE/'capture/pins.json').read_text())
  self.assertEqual(sum(m is None for m in b.REPORTED.values()),5)
  self.assertEqual(sum(m is not None and m!=pins[s]['md5'] for s,m in b.REPORTED.items()),4)
 def test_no_client_price(self):
  inputs=dict(partner_id='p',plan_id='x',payment_choice={'method':'x'},items=[dict(item_id='i',quantidade=2,price=10)])
  with self.assertRaisesRegex(ValueError,'PRICE_FREE'):f.create_order(self.ctx(),lambda *_:self.fail('dispatch'),inputs,{})
if __name__=='__main__':unittest.main()