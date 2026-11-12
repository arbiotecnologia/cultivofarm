"""Reviewed command source only; no transport, users, secrets or final-state SQL.

Session callers can prepare identifiers now, but fiscal dispatch remains closed
until E has a reviewed server capability and a private registered-intent adapter.
"""
TARGET='vrlcdwmlytukrjezrrnf'
def fixture_request(context, inputs, receipt):
 if context.get('target_ref')!=TARGET:raise ValueError('WRONG_TARGET')
 if context.get('external_delivery_disabled') is not True:raise ValueError('EXTERNAL_OUTPUTS_NOT_PROVEN_OFF')
 if not context.get('actor_id') or not context.get('organization_id'):raise ValueError('SESSION_REQUIRED')
 if receipt.get('state')=='uncertain':raise ValueError('RECONCILE_SAME_KEY_NO_AUTOMATIC_RETRY')
 if not receipt.get('key'):raise ValueError('DURABLE_KEY_REQUIRED')
 if context.get('stage_E_reviewed') is not True:raise ValueError('E_STATEMENT_BARRIER_REVIEW_REQUIRED')
 # A client flag is not an authority token and cannot open an absent adapter.
 raise ValueError('E_REGISTERED_INTENT_ADAPTER_NOT_INSTALLED')

def session_test_steps():
 return [
  'owner selects existing synthetic seller/partner/product/condition through canonical scoped UI',
  'buyer simulate -> durable prepare -> create; retain key and server receipt',
  'seller commercial/financial explicit approvals through reviewed existing endpoints',
  'server-derived immutable forecast: aguardando_fiscal; no physical release',
  'registered NF intent -> private homolog-only simulated provider -> canonical callback',
  'Financeiro reads exact NF/title/installments; payment R$1 through payment RPC in its own transaction',
  'separate final linked cancellation -> CANCELED only if no payment; otherwise REQUIRES_REVIEW',
  'replay same intent/key, revocation under wait, wrong tenant, rejected/nonfinal event and deny rollback',
 ]