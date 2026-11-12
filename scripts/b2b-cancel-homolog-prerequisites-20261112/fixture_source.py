"""Review-only command recipe; caller supplies real authenticated canonical RPC transport.

No HTTP client, login, data import, SQL or provider. Fiscal/payment simulation is
restricted to an injected DISPOSABLE_LOCAL adapter, never the hosted session.
"""
TARGET='vrlcdwmlytukrjezrrnf'

def validate_context(context):
 if context.get('target_ref')!=TARGET: raise ValueError('WRONG_TARGET')
 if context.get('catalog_reviewed') is not True: raise ValueError('CATALOG_NOT_REVIEWED')
 if context.get('external_delivery_disabled') is not True: raise ValueError('EXTERNAL_DELIVERY_NOT_PROVEN_OFF')
 if not context.get('actor_id') or not context.get('organization_id'): raise ValueError('REAL_SESSION_REQUIRED')

def create_order(context, rpc, inputs, receipt):
 """Retain journal key/CAS and receipt; ambiguous create never automatically repeats."""
 validate_context(context)
 if receipt.get('state')=='committed': return receipt
 if receipt.get('state')=='uncertain': raise ValueError('RECONCILE_SAME_JOURNAL_KEY_BEFORE_RETRY')
 for key in ('partner_id','plan_id','items','payment_choice'):
  if not inputs.get(key): raise ValueError('INPUT_REQUIRED:'+key)
 # Explicitly supplied price-free items, not invented prices/fiscal classification.
 if any(set(x)-{'item_id','item_tipo','volume_id','packaging_id','quantidade'} for x in inputs['items']):
  raise ValueError('PRICE_FREE_ITEMS_REQUIRED')
 if not receipt.get('key'):
  journal=rpc('recover_partner_order_attempt_v1',dict(p_partner=inputs['partner_id'],p_expected_key=None,p_expected_generation=None,p_advance=False,p_ack_order=None))
  if journal.get('state')=='committed': raise ValueError('UNRELATED_COMMITTED_JOURNAL_REQUIRES_REVIEW')
  if not journal.get('key') or not journal.get('generation'): raise ValueError('JOURNAL_UNPROVEN')
  receipt.update(key=journal['key'],generation=journal['generation'],state='reserved')
 sim=rpc('simulate_b2b_payment_condition_secure',dict(p_partner_id=inputs['partner_id'],p_payment_plan_id=inputs['plan_id'],p_items=inputs['items'],p_payment_choice=inputs['payment_choice']))
 if not sim.get('cart_hash'): raise ValueError('CANONICAL_SIMULATION_UNPROVEN')
 receipt['state']='uncertain' # Persist this receipt before dispatch in the integrating caller.
 result=rpc('create_partner_order_condition_secure',dict(p_partner_id=inputs['partner_id'],p_observacoes=inputs.get('reason'),p_items=inputs['items'],p_requested_delivery_date=None,p_payment_plan_id=inputs['plan_id'],p_expected_cart_hash=sim['cart_hash'],p_idempotency_key=receipt['key'],p_payment_choice=inputs['payment_choice']))
 if not result.get('id'): raise ValueError('ORDER_ACK_UNPROVEN')
 receipt.update(state='committed',order_id=result['id'])
 return receipt

def simulate_fiscal_payment(context, adapter, operation, args):
 validate_context(context)
 if context.get('execution_mode')!='DISPOSABLE_LOCAL': raise ValueError('HOSTED_FISCAL_PAYMENT_SIMULATION_CLOSED')
 if operation not in ('NF_AUTHORIZATION_CALLBACK','NF_CANCEL_FINAL_CALLBACK','RECEIVABLE_PAYMENT_RPC'): raise ValueError('OPERATION_CLOSED')
 return adapter(operation,args)