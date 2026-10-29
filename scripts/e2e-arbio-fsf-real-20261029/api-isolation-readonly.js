/*
 * READ-ONLY REST/RPC isolation probe for REAL sessions (AR Bio / tenantFSF).
 * Run by the account HOLDER in the DevTools console of https://app.cultivofarm.com.br after a normal login.
 * - Uses only GET with `Prefer: count=exact` and `Range: 0-0` (no row bodies kept, no writes, no RPC that mutates).
 * - The access token is read inside the holder's browser and NEVER printed, returned, stored or sent elsewhere.
 * - Output: sanitized JSON (HTTP status, counts, sha256 prefixes of ids). Paste only that output.
 * - This proves what PostgREST/RLS returned to THAT real JWT; privileged SQL never substitutes for it.
 */
(async () => {
  const REF = 'swzpzcwiasxmjutrmvkm';
  const BASE = `https://${REF}.supabase.co`;
  const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3enB6Y3dpYXN4bWp1dHJtdmttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNjk3NDQsImV4cCI6MjEwNDY0NTc0NH0.nriSPV5bhUPZHi31yZ23t8U609tJ7rBYeQl0rUcG4GU';
  const ORG_ARBIO = '007bb519-cba0-4704-be2c-cb93ad010048';
  const ORG_TENANT_FSF = '8f57c7dd-0557-4041-b401-7a00f7244626';
  const PARTNER_FSF_IN_ARBIO = '4a7e37e0-632a-41d5-8ccb-c627185ad5b3';
  const PARTNER_TESTE_AUDITORIA = '7e52de9a-4bed-4d1e-8200-3255a805465c';
  if (location.origin !== 'https://app.cultivofarm.com.br') throw new Error('ORIGIN_NOT_CANONICAL');
  const key = `sb-${REF}-auth-token`;
  const raw = localStorage.getItem(key);
  if (!raw) throw new Error('NO_CANONICAL_SESSION');
  const session = JSON.parse(raw);
  const token = session.access_token; // never logged
  const uid = session.user && session.user.id;
  const sha = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(s))))).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  const probe = async (label, path) => {
    const r = await fetch(`${BASE}/rest/v1/${path}`, { method: 'GET', headers: { apikey: ANON, Authorization: `Bearer ${token}`, Prefer: 'count=exact', Range: '0-0', Accept: 'application/json' } });
    const range = r.headers.get('content-range') || '';
    const count = range.includes('/') ? range.split('/')[1] : null;
    return { label, http: r.status, count: count === '*' ? null : Number(count) };
  };
  const checks = [
    ['own_profile', `profiles?select=user_id&user_id=eq.${uid}`],
    ['org_arbio_row', `organizations?select=id&id=eq.${ORG_ARBIO}`],
    ['org_tenant_fsf_row', `organizations?select=id&id=eq.${ORG_TENANT_FSF}`],
    ['organizations_all_visible', 'organizations?select=id'],
    ['partner_fsf_in_arbio', `partner_accounts?select=id&id=eq.${PARTNER_FSF_IN_ARBIO}`],
    ['partner_teste_auditoria', `partner_accounts?select=id&id=eq.${PARTNER_TESTE_AUDITORIA}`],
    ['partners_owned_by_arbio', `partner_accounts?select=id&commercial_owner_organization_id=eq.${ORG_ARBIO}`],
    ['orders_partner_fsf', `partner_orders?select=id&partner_id=eq.${PARTNER_FSF_IN_ARBIO}`],
    ['orders_partner_teste_auditoria', `partner_orders?select=id&partner_id=eq.${PARTNER_TESTE_AUDITORIA}`],
    ['fin_settings_partner_fsf', `partner_financial_settings?select=partner_id&partner_id=eq.${PARTNER_FSF_IN_ARBIO}`],
    ['receivables_partner_fsf', `accounts_receivable?select=id&partner_id=eq.${PARTNER_FSF_IN_ARBIO}`],
    ['clientes_visible', 'clientes?select=id'],
    ['clientes_org_arbio', `clientes?select=id&organization_id=eq.${ORG_ARBIO}`],
    ['clientes_org_tenant_fsf', `clientes?select=id&organization_id=eq.${ORG_TENANT_FSF}`],
    ['partner_users_self', `partner_users?select=partner_id&user_id=eq.${uid}`],
    ['user_roles_self', `user_roles?select=role&user_id=eq.${uid}`],
    ['company_fiscal_settings_visible', 'company_fiscal_settings?select=id'],
  ];
  const results = [];
  for (const [label, path] of checks) results.push(await probe(label, path));
  const out = { contract: 'ARBIO_FSF_API_ISOLATION_READONLY_V1', ref: REF, origin: location.origin, at: new Date().toISOString(),
    actor_sha: await sha(uid), token_exp: session.expires_at || null, results };
  console.log(JSON.stringify(out, null, 2)); // contains no token, no email, no row data
  return out;
})();
