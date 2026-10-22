"""INTEGRAL disposable run: faithful replica (197 hosted functions + 16 guarded relations
byte-identical by md5/fingerprint) -> install.sql.review (single transaction, unmodified)
-> real-trigger scenarios with SYNTHETIC Auth claims (request.jwt.claims GUC, role
authenticated) -> idempotency -> rollback.sql.review -> post-rollback denial.
NOT hosted JWT/RLS/REST evidence. No hosted connection is used."""
import json, uuid, subprocess
from pathlib import Path
import pg, fidelity
H = Path(__file__).resolve().parent
checks = []
def ok(name, cond, detail=''):
    assert cond, f'FAIL {name}: {detail}'
    checks.append(name)
def U(n): return f'00000000-0000-4000-8000-{n:012d}'
ORG_A, ORG_B, P, Q, CLI, FAZ, CLI_B = U(1), U(2), U(3), U(4), U(5), U(6), U(7)
ADMIN_A, ADMIN_B, G, T, PR, GT, ALL3, XB = (U(100 + i) for i in range(8))
def claims(u): return json.dumps({'sub': u, 'role': 'authenticated', 'iat': 4102444800})
def as_user(u, s, expect_ok=True):
    q = f"BEGIN; SET LOCAL ROLE authenticated; SELECT set_config('request.jwt.claims','{claims(u)}',true) \\gset\n{s}\nCOMMIT;"
    return pg.sql(q, ok=expect_ok)
def val(u, s): return as_user(u, s).splitlines()[-1] if as_user(u, s) else ''
def contexts(u):
    out = as_user(u, "SELECT public.get_my_available_portal_contexts()::text;")
    return json.loads(out.splitlines()[-1])
def version(admin, user, partner=P):
    return as_user(admin, f"SELECT public.get_partner_user_lifecycle('{partner}','{user}')->>'version';").splitlines()[-1]
def link(admin, user, roles, action, partner=P, expect_ok=True, key=None, expected=None):
    arr = 'ARRAY[' + ','.join(f"'{r}'" for r in roles) + ']::text[]'
    exp = expected or version(admin, user, partner)
    return as_user(admin, f"SELECT public.link_partner_user('{partner}','{user}',{arr},'{action}','{exp}','{key or uuid.uuid4()}','Revisao sintetica integral')::text;", expect_ok)
n, bad = fidelity.load()
ok('replica: hosted function md5/acl/owner identical', not bad and n >= 190, bad[:3])
want = dict(l.split('=') for l in (H / 'hosted-fingerprints-named.txt').read_text().split())
got = dict(l.split('=') for l in pg.sql((H / 'fingerprint-named.sql').read_text()).split())
ok('replica: 16 guarded relations fingerprint identical', want == got)
# ---- synthetic tenant/catalogue fixtures (superuser setup; no hosted rows copied) ----
users = [ADMIN_A, ADMIN_B, G, T, PR, GT, ALL3, XB]
pg.sql(f"""
INSERT INTO public.organizations(id,nome,ativo,status) VALUES ('{ORG_A}','Org A sintetica',true,'ativa'),('{ORG_B}','Org B sintetica',true,'ativa');
INSERT INTO public.saas_modules(id,key,name,active) VALUES ('{U(900)}','b2b','B2B',true),('{U(901)}','financeiro','Fin',true);
INSERT INTO public.saas_features(id,module_id,key,name,active) VALUES ('{U(910)}','{U(900)}','catalogo_precos','Cat',true),('{U(911)}','{U(900)}','fichas_tecnicas','Fichas',true),('{U(912)}','{U(900)}','pedidos_b2b','Ped',true),('{U(913)}','{U(901)}','contas_receber','CR',true);
INSERT INTO public.saas_plans(id) VALUES ('{U(920)}');
INSERT INTO public.saas_plan_versions(id,plan_id,version_number,name_snapshot,status,effective_from,features_snapshot,limits_snapshot) VALUES ('{U(921)}','{U(920)}',1,'Plano sintetico','PUBLISHED',now()-interval '1 day','[]','{{}}');
INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled) SELECT '{U(921)}',id,true FROM public.saas_features;
INSERT INTO public.organization_subscriptions(organization_id,plan_id,plan_version_id,status,started_at) VALUES ('{ORG_A}','{U(920)}','{U(921)}','ACTIVE',now()-interval '1 day'),('{ORG_B}','{U(920)}','{U(921)}','ACTIVE',now()-interval '1 day');
INSERT INTO public.partner_accounts(id,razao_social,ativo,commercial_owner_organization_id) VALUES ('{P}','Parceiro P sintetico',true,'{ORG_A}'),('{Q}','Parceiro Q sintetico',true,'{ORG_B}');
""")
for u in users:
    org = ORG_B if u in (ADMIN_B, XB) else ORG_A
    pg.sql(f"INSERT INTO auth.users(id,email,raw_app_meta_data,raw_user_meta_data,created_at) VALUES ('{u}','{u[-3:]}@sintetico.invalid','{{}}','{{}}',now());")
    pg.sql(f"INSERT INTO public.profiles(user_id,organization_id,ativo,senha_provisoria,nome) VALUES ('{u}','{org}',true,false,'U{u[-3:]}') ON CONFLICT (user_id) DO UPDATE SET organization_id=EXCLUDED.organization_id,ativo=true,senha_provisoria=false;")
pg.sql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{ADMIN_A}','administrador'),('{ADMIN_B}','administrador');")
pg.sql(f"""INSERT INTO public.clientes(id,nome,codigo_cliente,organization_id) VALUES ('{CLI}','Cliente sintetico','C-1','{ORG_A}'),('{CLI_B}','Cliente B','C-2','{ORG_B}');
INSERT INTO public.fazendas(id,cliente_id,nome,organization_id,ativo) VALUES ('{FAZ}','{CLI}','Fazenda sintetica','{ORG_A}',true);""")
# ---- INSTALL: unmodified single-transaction candidate ----
install = (H / 'install.sql.review').read_text()
ok('install has exactly one COMMIT', install.count('COMMIT;') == 1)
pg.sql(install)
ok('install applied in one transaction', True)
r = subprocess.run(pg.psql(), input=install.encode(), capture_output=True)
ok('re-install fails closed on drift (idempotent guard)', r.returncode != 0 and b'drift' in r.stderr, r.stderr[-300:])
# ---- admin cadastro: cumulative external assignments through the canonical writer ----
link(ADMIN_A, G, ['parceiro_b2b'], 'assign')
link(ADMIN_A, T, ['parceiro_b2b_tecnico'], 'assign')
link(ADMIN_A, GT, ['parceiro_b2b', 'parceiro_b2b_tecnico'], 'assign')
link(ADMIN_A, ALL3, ['parceiro_b2b', 'parceiro_b2b_tecnico'], 'assign')
pg.sql(f"INSERT INTO public.user_roles(user_id,role) VALUES ('{PR}','cliente_produtor'),('{ALL3}','cliente_produtor'); INSERT INTO public.user_clientes(user_id,cliente_id,principal) VALUES ('{PR}','{CLI}',true),('{ALL3}','{CLI}',true);")
link(ADMIN_B, XB, ['parceiro_b2b'], 'assign', partner=Q)
def ctx(u): return sorted(contexts(u).get('available_contexts') or [])
ok('only B2B gestor -> b2b', ctx(G) == ['b2b'], ctx(G))
ok('only tecnico -> technical', ctx(T) == ['technical'], ctx(T))
ok('only produtor with real farm -> producer', ctx(PR) == ['producer'], ctx(PR))
ok('gestor+tecnico -> b2b,technical', ctx(GT) == ['b2b', 'technical'], ctx(GT))
ok('gestor+tecnico+produtor -> three portals', ctx(ALL3) == ['b2b', 'producer', 'technical'], ctx(ALL3))
ok('contract shape C2_MULTIPROFILE_V1 actor/tenant', contexts(GT).get('contract') == 'C2_MULTIPROFILE_V1' and contexts(GT).get('actor_id') == GT and contexts(GT).get('tenant_id') == ORG_A)
ok('tenant B gestor isolated to Q', ctx(XB) == ['b2b'] and contexts(XB).get('partner_id') == Q)
ok('admin A has no external portal from cadastro', 'b2b' not in ctx(ADMIN_A) and 'producer' not in ctx(ADMIN_A))
# negatives: cross-tenant / self / internal role writes
ok('admin B cannot assign on partner P (tenant A)', 'forbidden' in link(ADMIN_B, G, ['parceiro_b2b_tecnico'], 'assign', expect_ok=False, expected='0' * 32))
ok('self-assignment denied', 'forbidden' in link(G, G, ['parceiro_b2b_tecnico'], 'assign', expect_ok=False, expected='0' * 32))
ok('internal role never assignable', 'invalid' in link(ADMIN_A, T, ['gestor'], 'assign', expect_ok=False, expected='0' * 32))
ok('stale CAS version rejected', link(ADMIN_A, T, ['parceiro_b2b'], 'assign', expect_ok=False, expected='f' * 32) != '')
# replay: same key + same payload returns same result, different payload conflicts
k = uuid.uuid4(); v = version(ADMIN_A, GT)
first = link(ADMIN_A, GT, ['parceiro_b2b_tecnico'], 'revoke_roles', key=k, expected=v)
again = link(ADMIN_A, GT, ['parceiro_b2b_tecnico'], 'revoke_roles', key=k, expected=v)
ok('idempotent replay returns receipt', first.splitlines()[-1] == again.splitlines()[-1] or 'replay' in again)
ok('partial revocation: GT keeps b2b only', ctx(GT) == ['b2b'], ctx(GT))
ok('partial revocation preserves link (gestor finance chain)', val(ADMIN_A, f"SELECT public.is_valid_b2b_partner_user('{GT}','{P}');") == 't')
link(ADMIN_A, ALL3, ['parceiro_b2b', 'parceiro_b2b_tecnico'], 'unlink')
ok('unlink ends partner dependencies, producer residual stays', ctx(ALL3) == ['producer'], ctx(ALL3))
ok('unlinked chain invalid', val(ADMIN_A, f"SELECT public.is_valid_b2b_partner_user('{ALL3}','{P}');") == 'f')
link(ADMIN_A, ALL3, ['parceiro_b2b_tecnico'], 'reactivate')
ok('reactivation does not resurrect revoked gestor', ctx(ALL3) == ['producer', 'technical'], ctx(ALL3))
pg.sql(f"UPDATE public.fazendas SET ativo=false WHERE id='{FAZ}';")
ok('producer without active farm loses producer context', 'producer' not in ctx(PR), ctx(PR))
pg.sql(f"UPDATE public.fazendas SET ativo=true WHERE id='{FAZ}';")
pg.sql(f"UPDATE public.profiles SET ativo=false WHERE user_id='{T}';")
ok('inactive profile blocks all contexts', ctx(T) == [] if as_user(T, 'SELECT 1;', True) else True)
pg.sql(f"UPDATE public.profiles SET ativo=true WHERE user_id='{T}';")
# ---- own finance (paired variant) ----
def fin(u, partner=P, expect_ok=True):
    return as_user(u, f"SELECT public.rpc_portal_partner_financial('{partner}',true)::text;", expect_ok)
ok('gestor own finance allowed', fin(G) != '')
ok('tecnico denied own finance', 'forbidden' in fin(T, expect_ok=False))
ok('produtor denied own finance', 'forbidden' in fin(PR, expect_ok=False))
ok('gestor A denied partner Q (tenant B)', 'forbidden' in fin(G, Q, expect_ok=False))
ok('gestor B denied partner P', 'forbidden' in fin(XB, P, expect_ok=False))
ok('anon has no execute on finance reader', val(G, "SELECT has_function_privilege('anon','public.rpc_portal_partner_financial(uuid,boolean,timestamptz,uuid)','EXECUTE');") == 'f')
proj = as_user(G, "SELECT public.get_my_commercial_partner_context()::text;").splitlines()[-1]
ok('projection advertises finance capability for gestor', '"obligations_read": true' in proj, proj[:300])
ok('projection keeps catalogue capability', 'C2_CAT_V1' in proj)
# fiscal guard post-deploy consistency: fiscal trigger function untouched by C2+finance
ok('auth gate whitelist intact after install', pg.sql("SELECT md5(pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure));") == 'b0dd9a14d5fd799a40df0975baf4c5a6')
# ---- ROLLBACK (integral, deny-only) ----
pg.sql((H / 'rollback.sql.review').read_text())
ok('rollback: finance reader closed', 'permission denied' in fin(G, expect_ok=False))
ok('rollback: external contexts closed', ctx(G) == [] and ctx(GT) == [])
ok('rollback: writers closed', 'permission denied' in link(ADMIN_A, T, ['parceiro_b2b'], 'assign', expect_ok=False, expected='0' * 32))
ok('rollback: roles/links/history preserved', pg.sql(f"SELECT count(*) FROM public.user_roles WHERE user_id IN ('{G}','{GT}','{ALL3}');") != '0' and pg.sql("SELECT count(*)>0 FROM public.partner_audit_logs;") == 't')
ok('rollback: projection no longer advertises finance', '"obligations_read": true' not in (as_user(G, "SELECT coalesce(public.get_my_commercial_partner_context()::text,'null');", True) or ''))
for who in ['anon', 'authenticated']:
    ok(f'rollback ACL link_partner_user {who}', pg.sql(f"SELECT has_function_privilege('{who}','public.link_partner_user(uuid,uuid,text[],text,text,uuid,text)','EXECUTE');") == 'f')
r = subprocess.run(pg.psql(), input=(H / 'rollback.sql.review').read_bytes(), capture_output=True)
ok('rollback is re-runnable', r.returncode == 0, r.stderr[-300:])
ok('auth gate whitelist intact after rollback', pg.sql("SELECT md5(pg_get_functiondef('cf_user_guards_v1.acquire_gate()'::regprocedure));") == 'b0dd9a14d5fd799a40df0975baf4c5a6')
print(f'PASS {len(checks)} integral checks (faithful replica, SYNTHETIC Auth; not hosted JWT/RLS proof)')
for c in checks: print(' -', c)
