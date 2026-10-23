"""Run ONLY after independent fiscal ACL installation. No writes or synthetic JWT.
Uses real session tokens provided out-of-band; never prints tokens, payload or metadata.
Expected A/B/anon=401/403; checks B against explicitly supplied UUID of A.
"""
import os, json, urllib.request, urllib.error

url = os.environ.get('C2_REST_URL', '')
if url != 'https://swzpzcwiasxmjutrmvkm.supabase.co':
    raise SystemExit('STOP: canonical ref not confirmed')
key = os.environ.get('C2_PUBLISHABLE_KEY')
uuid_a = os.environ.get('C2_FISCAL_UUID_A')
tokens = [os.environ.get('C2_REAL_TOKEN_B'), os.environ.get('C2_REAL_TOKEN_A')]
if not key or not uuid_a or not all(tokens):
    raise SystemExit('STOP: real A/B sessions and explicit A UUID required; no synthetic authentication')
for label, token in zip(['B against A UUID', 'A direct UUID', 'anonymous'], [*tokens, None]):
    headers = {'apikey': key, 'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    body = json.dumps({'p_sales_channel': 'b2b_partner', 'p_operation_type': 'venda_mercadoria',
                       'p_uf': 'SP', 'p_scope_type': 'partner_order', 'p_scope_id': uuid_a}).encode()
    req = urllib.request.Request(url + '/rest/v1/rpc/fn_fiscal_requirement_resolve', data=body, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    if status not in (401, 403):
        raise SystemExit(f'FAIL {label}: HTTP {status}; no response contents printed')
    print(f'PASS {label}: HTTP {status}')