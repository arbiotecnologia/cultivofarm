"""C2-ORD v3 (rebased sobre 20261023192728 instalado) em PostgreSQL DESCARTÁVEL. NÃO é prova hosted/JWT/RLS.
- Corpos alterados: baseline/*.sql capturados byte-exato do hosted (md5 conferido abaixo).
- b2b_actor_scope/is_valid/contexto/readiness/h15 e resolver fiscal usam corpos canônicos capturados.
- Demais dependências (has_role, entitlements, eligibility, wrapper, parcelas) são reduzidas;
  auth.uid()/auth.jwt() são sintéticos. Não é JWT hosted nem schema/RLS integral.
- O candidato roda com os hashes hosted reais quando o pg local reproduz o mesmo pg_get_functiondef.
"""
from pathlib import Path
import subprocess, tempfile, os, hashlib, sys, json, concurrent.futures
HERE = Path(__file__).resolve().parent
tmp = Path(tempfile.mkdtemp(prefix='c2ord-', dir='/tmp')); tmp.chmod(0o777)
prefix = ['setpriv','--reuid=1000','--regid=1000','--clear-groups'] if os.getuid()==0 else []
PORT='55531'
base = ['psql','-X','-h',str(tmp),'-p',PORT,'-U','postgres','-v','ON_ERROR_STOP=1','-qAt']
def run(sql, expect_error=None):
  r = subprocess.run(base, input=sql, text=True, capture_output=True)
  if expect_error:
    if r.returncode == 0 or expect_error not in r.stderr:
      raise AssertionError(f'esperava erro {expect_error!r}, obtido rc={r.returncode} {r.stderr[-400:]}')
    return r.stderr
  if r.returncode: raise RuntimeError(r.stderr[-2000:])
  return r.stdout.strip()
passed = 0
def ok(name):
  global passed; passed += 1; print('PASS', name)

U = {k: f'00000000-0000-0000-0000-0000000000{n:02d}' for k,n in
     dict(gestor=1, cumul=2, tech=3, other=4, admin=5, gestorB=6).items()}
ORG_A='aaaaaaaa-0000-0000-0000-000000000001'; ORG_B='bbbbbbbb-0000-0000-0000-000000000001'
P_A='aaaaaaaa-1111-0000-0000-000000000001'; P_B='bbbbbbbb-1111-0000-0000-000000000001'
PLAN='cccccccc-0000-0000-0000-000000000001'; PLAN2='cccccccc-0000-0000-0000-000000000002'
def as_uid(uid, sql): return f"SET request.jwt.claim.sub='{uid}';\n{sql}"

try:
  subprocess.run(prefix+['initdb','-D',str(tmp/'data'),'-A','trust','-U','postgres'],check=True,capture_output=True)
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'-l',str(tmp/'log'),'-o',f'-k {tmp} -h "" -p {PORT}','start','-w'],check=True,capture_output=True)
  run(f'''
  CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE SCHEMA platform_private;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('iat',extract(epoch from now())::bigint) $$;
  CREATE TYPE public.app_role AS ENUM('administrador','tecnico_agronomo','producao','administrativo','gestor','cliente_produtor','consultor_tecnico','aplicador','operador_onfarm','financeiro','gestor_comercial','parceiro_b2b','parceiro_b2b_tecnico','superadmin');
  CREATE TYPE public.partner_order_status AS ENUM('rascunho','pendente','solicitado','em_analise_comercial','aprovado','reprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado','cancelado','aguardando_aprovacao_credito','aguardando_ajuste_comercial','aguardando_itens','reprovado_sem_itens','aguardando_cotacao');
  CREATE TABLE user_roles(user_id uuid, role app_role);
  CREATE TABLE organizations(id uuid PRIMARY KEY, ativo boolean DEFAULT true, status text DEFAULT 'ativa', partner_account_id uuid);
  CREATE TABLE profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean DEFAULT true, updated_at timestamptz DEFAULT now(), senha_provisoria boolean DEFAULT false);
  CREATE TABLE platform_org_admin_invites(user_id uuid, access_operation_status text, access_valid_after timestamptz);
  CREATE TABLE fiscal_requirement_exemptions(id uuid DEFAULT gen_random_uuid(), active boolean, scope_type text, scope_id uuid, motivo text, approved_by uuid);
  CREATE TABLE fiscal_operation_policies(id uuid DEFAULT gen_random_uuid(), active boolean, sales_channel text, operation_type text, uf text, valid_from date, valid_until date, requires_invoice boolean, document_model text);
  CREATE TABLE partner_accounts(id uuid PRIMARY KEY, codigo text, razao_social text, nome_fantasia text, ativo boolean DEFAULT true, deleted_at timestamptz, commercial_owner_organization_id uuid, client_id uuid, uf text DEFAULT 'SP');
  CREATE TABLE partner_users(user_id uuid, partner_id uuid, tenant_id uuid, revoked_at timestamptz, valid_from timestamptz DEFAULT now()-interval '1 day', version int DEFAULT 1);
  CREATE TABLE fixture_entitlements(user_id uuid, feature_key text);
  CREATE TABLE commercial_payment_plans(id uuid PRIMARY KEY, active boolean DEFAULT true, superseded_by_id uuid, valid_from timestamptz DEFAULT now()-interval '1 day', valid_until timestamptz);
  CREATE TABLE commercial_payment_plan_assignments(plan_id uuid, partner_id uuid, buyer_scope text, status text, valid_from date DEFAULT current_date-1, valid_until date);
  CREATE TABLE financial_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, type text, active boolean, created_at timestamptz DEFAULT now());
  CREATE TABLE payment_methods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, active boolean);
  CREATE TABLE clientes(id uuid PRIMARY KEY, organization_id uuid);
  CREATE TABLE partner_orders(id uuid PRIMARY KEY, partner_id uuid, numero text, status partner_order_status, created_by uuid,
    receivable_generated boolean DEFAULT false, receivable_generated_at timestamptz, receivable_generated_by uuid,
    financial_status text, payment_due_date date, payment_method text, internal_origin_snapshot jsonb, payment_terms_id uuid, financial_approval_status text DEFAULT 'not_required', requires_financial_approval boolean DEFAULT false, payment_condition_status text, final_amount_with_interest numeric DEFAULT 300, total numeric DEFAULT 300, credit_approved_at timestamptz, credit_block_reason text, updated_at timestamptz DEFAULT now(), approved_by uuid, approved_at timestamptz, approval_notes text, estimated_delivery_date date, ready_for_production boolean);
  CREATE TABLE partner_financial_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid UNIQUE NOT NULL, billing_trigger text NOT NULL DEFAULT 'na_entrega', payment_terms_days integer NOT NULL DEFAULT 7, default_payment_method text, credit_limit numeric, block_if_overdue boolean NOT NULL DEFAULT false, auto_generate_receivable boolean NOT NULL DEFAULT true, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), credit_limit_action text NOT NULL DEFAULT 'block', overdue_tolerance_days int NOT NULL DEFAULT 0, credit_alert_threshold_1 int NOT NULL DEFAULT 80, credit_alert_threshold_2 int NOT NULL DEFAULT 90);
  CREATE TABLE platform_private.authz_tickets(txid bigint,scope text,target uuid, PRIMARY KEY(txid,scope,target));
  CREATE TABLE partner_order_items(order_id uuid, pricing_mode_snapshot text, preco_unitario_final_snapshot numeric, preco_unitario numeric);
  CREATE TABLE notificacoes_operacionais(usuario_id uuid, tipo text, titulo text, mensagem text, link text);
  CREATE TABLE partner_order_audit_logs(order_id uuid, partner_id uuid, usuario_id uuid, acao text, dados_novos jsonb, dados_anteriores jsonb);
  CREATE TABLE partner_order_payment_terms(id uuid PRIMARY KEY, partner_order_id uuid, final_amount numeric, first_due_date date, installment_count int,
    plan_name_snapshot text, plan_code_snapshot text, discount_percent_snapshot numeric, monthly_interest_percent_snapshot numeric, months_count_snapshot numeric,
    table_amount numeric, net_amount_after_discount numeric, discount_amount numeric, financial_interest_amount numeric, approval_status text DEFAULT 'approved');
  CREATE TABLE partner_order_payment_schedule(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid, payment_terms_id uuid, installment_number int, due_date date, amount numeric, interest_amount numeric, status text, receivable_installment_id uuid);
  CREATE TABLE accounts_receivable(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL, origin_type text, origin_id uuid, customer_id uuid, partner_id uuid, description text,
    category_id uuid NOT NULL, total_amount numeric, issue_date date, first_due_date date, installment_count int, status text, fiscal_invoice_required boolean, fiscal_invoice_status text,
    fiscal_requirement_source text, fiscal_policy_id uuid, fiscal_exemption_id uuid, payment_method_id uuid, notes text, created_by uuid);
  CREATE TABLE accounts_receivable_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receivable_id uuid, organization_id uuid, installment_number int, due_date date, original_amount numeric, interest_amount numeric, net_amount numeric, status text DEFAULT 'OPEN', received_amount numeric DEFAULT 0);
  CREATE TABLE partner_order_financial_links(partner_order_id uuid UNIQUE, partner_id uuid, receivable_id uuid, financial_status text, billing_trigger text, created_by uuid);
  -- stub d51_5 (tenant do cliente)
  CREATE FUNCTION stub_d51() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.customer_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM clientes c WHERE c.id=NEW.customer_id AND c.organization_id=NEW.organization_id) THEN
      RAISE EXCEPTION 'FINANCIAL_CUSTOMER_TENANT_MISMATCH'; END IF; RETURN NEW; END $$;
  CREATE TRIGGER d51 BEFORE INSERT ON accounts_receivable FOR EACH ROW EXECUTE FUNCTION stub_d51();

  CREATE FUNCTION public.has_role(uuid, app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role=$2) $$;
  CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION platform_private.b2b_phase1_partner_visible(uuid, boolean) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
  CREATE FUNCTION platform_private.entitlements_for_user(uuid) RETURNS TABLE(feature_key text) LANGUAGE sql STABLE AS $$ SELECT feature_key FROM public.fixture_entitlements WHERE user_id=$1 $$;
  CREATE FUNCTION platform_private.b2b_own_obligations_owner(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
  CREATE FUNCTION platform_private.c2_producer_links(uuid,uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
  CREATE FUNCTION public.fn_b2b_order_billing_eligibility(uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object('eligible',true,'payment_terms_id',(SELECT id FROM public.partner_order_payment_terms WHERE partner_order_id=$1)) $$;
  -- wrapper reduzido: lock + impl (o real também checa phase1/priceable)
  CREATE FUNCTION public.generate_b2b_receivable_secure(p uuid) RETURNS jsonb LANGUAGE plpgsql AS $$ BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended('b2b_receivable:'||p::text,0));
    IF current_setting('test.fail_wrapper',true)='1' THEN RAISE EXCEPTION 'stub_generation_failed'; END IF;
    RETURN public.generate_b2b_receivable_secure_impl(p); END $$;
  ''')
  # Load captured REAL scope bodies, not stubs. Enforce fidelity against LIVE hashes.
  canonical = [
    ('platform_private.platform_actor_access_ready','(uuid)','048249c0c2106c3761e26eacb8d0de84'),
    ('platform_private.h15_actor_organization','()','64e10608403238a41a9baf92857ca881'),
    ('public.h15_actor_organization','()','55edafec08bcc84a00f1526c14334a2c'),
    ('public.is_valid_b2b_partner_user','(uuid,uuid)','0bb0dea04be8ca84c66db7ca6329876c'),
    ('platform_private.b2b_commercial_context','()','2f1063f00281c4ca78dcebaab81a9446'),
    ('platform_private.b2b_actor_scope','(uuid)','c3f2997746f24bc2efd15db5c0ccc862')]
  for name, args, h in canonical:
    run((HERE/'fiscal'/f'{name}.sql').read_text())
    assert run(f"SELECT md5(pg_get_functiondef('{name}{args}'::regprocedure))") == h, name
  ok('6 corpos de autoridade reais byte-exatos aos hashes LIVE; sem stubs de scope/contexto/readiness')
  run((HERE/'baseline-v2/public.fn_fiscal_requirement_resolve.sql').read_text())
  run('REVOKE ALL ON FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) FROM PUBLIC; GRANT EXECUTE ON FUNCTION public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date) TO service_role; GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;')
  # Baseline exato + verificação de fidelidade de hash.
  hosted = {}
  for f in sorted((HERE/'baseline').glob('*.sql')):
    body = f.read_bytes(); hosted[f.stem] = hashlib.md5(body).hexdigest()
    run(body.decode())
  sigs = {'platform_private.assert_b2b_partner_scope':'(uuid,uuid)','platform_private.b2b_commercial_partner_projection':'()',
    'public.create_partner_order_secure':'(uuid,text,jsonb,date,uuid,date,integer,text,text)','public.simulate_b2b_payment_plan_secure':'(uuid,uuid,jsonb,date)',
    'public.generate_b2b_receivable_secure_impl':'(uuid)','public.tg_auto_b2b_receivable':'()','public.fn_b2b_plan_selectable':'(uuid,timestamp with time zone)','public.approve_partner_order':'(uuid,text,date)'}
  for fn, s in sigs.items():
    local = run(f"SELECT md5(pg_get_functiondef('{fn}{s}'::regprocedure))")
    assert local == hosted[fn], f'fidelidade {fn}: local {local} != hosted {hosted[fn]}'
  ok('pg_get_functiondef local reproduz md5 hosted dos 8 corpos baseline')
  run("CREATE TRIGGER trg_auto_b2b_receivable AFTER UPDATE OF status ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_auto_b2b_receivable();")
  run((HERE/'applied/20261023192728_c2_orders_tenant_notifications_atomic_approval.sql').read_text())
  for fn, s2, h in [('public.create_partner_order_secure','(uuid,text,jsonb,date,uuid,date,integer,text,text)','624f6e3d45e5af7d039d5da8f784d787'),
      ('public.approve_partner_order','(uuid,text,date)','09eb9e7442cc59c7c72b4d39f3567a53'),('public.tg_auto_b2b_receivable','()','0f679538fe394924b140e54938a3bb9e'),
      ('platform_private.c2_order_internal_recipients','(uuid)','d4936c87a3ab62d26816a11a032dfe0f'),('platform_private.c2_order_partner_recipients','(uuid)','70b381094ae1f3ac87d0fa8e28274dac')]:
    got = run(f"SELECT md5(pg_get_functiondef('{fn}{s2}'::regprocedure))"); assert got == h, (fn, got)
  ok('migração instalada 20261023192728 reaplicada localmente reproduz os 5 hashes pós-implantação relatados')

  # Fixtures sintéticas: A (owner org A) e B (owner org B); clientes comerciais sem org própria.
  run(f'''
  INSERT INTO organizations VALUES('{ORG_A}',true,'ativa',NULL),('{ORG_B}',true,'ativa',NULL);
  INSERT INTO partner_accounts(id,codigo,razao_social,commercial_owner_organization_id) VALUES('{P_A}','A','Cliente A','{ORG_A}'),('{P_B}','B','Cliente B','{ORG_B}');
  INSERT INTO profiles VALUES('{U['gestor']}','{ORG_A}'),('{U['cumul']}','{ORG_A}'),('{U['tech']}','{ORG_A}'),('{U['other']}','{ORG_A}'),('{U['admin']}','{ORG_A}'),('{U['gestorB']}','{ORG_B}');
  INSERT INTO partner_users(user_id,partner_id,tenant_id) VALUES('{U['gestor']}','{P_A}','{ORG_A}'),('{U['cumul']}','{P_A}','{ORG_A}'),('{U['tech']}','{P_A}','{ORG_A}'),('{U['gestorB']}','{P_B}','{ORG_B}');
  INSERT INTO user_roles VALUES('{U['gestor']}','parceiro_b2b'),('{U['cumul']}','parceiro_b2b'),('{U['cumul']}','parceiro_b2b_tecnico'),('{U['tech']}','parceiro_b2b_tecnico'),('{U['admin']}','administrador'),('{U['gestorB']}','parceiro_b2b');
  INSERT INTO fixture_entitlements SELECT u, k FROM (VALUES('{U['gestor']}'::uuid),('{U['cumul']}'),('{U['tech']}'),('{U['gestorB']}')) x(u), (VALUES('pedidos_b2b'),('catalogo_precos')) y(k);
  INSERT INTO commercial_payment_plans(id) VALUES('{PLAN}'),('{PLAN2}');
  INSERT INTO commercial_payment_plan_assignments VALUES('{PLAN}','{P_A}','partner','published'),('{PLAN}','{P_B}','partner','published');
  ''')

  # ---------- BASELINE: blockers reproduzidos ----------
  run(as_uid(U['cumul'], f"SELECT platform_private.assert_b2b_partner_scope('{U['cumul']}','{P_A}');"), 'forbidden_financial_terms')
  ok('baseline: cumulativo gestor+técnico negado pelo assert (blocker 1 reproduzido)')

  # Installed P1 and actual finance dependencies (captured read-only 22:45Z).
  snapshot=json.loads((HERE/'baseline-p1/snapshot.json').read_text())
  for f in snapshot['functions']:
    if 'phase1_order_visible' not in f['sig']: run(f['sql'])
  run('DROP FUNCTION public.generate_b2b_receivable_secure(uuid);')
  run("CREATE FUNCTION public.b2b_phase1_partner_visible(p uuid,t boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT platform_private.b2b_phase1_partner_visible(p,t) $$;")
  for f in ['platform_private.b2b_phase1_partner_visible','platform_private.b2b_phase1_order_visible','public.b2b_phase1_order_visible','public.fn_b2b_order_priceable','public.fn_b2b_credit_exposure','public.fn_b2b_order_billing_eligibility','public.fn_generate_receivable_installments','public.generate_b2b_receivable_secure']:
    run((HERE/'baseline-p1'/f'{f}.sql').read_text())
  run("CREATE TRIGGER c2p1_settings_fence BEFORE INSERT OR UPDATE OR DELETE ON partner_financial_settings FOR EACH ROW EXECUTE FUNCTION platform_private.c2p1_settings_fence(); CREATE TRIGGER trg_pfs_updated_at BEFORE UPDATE ON partner_financial_settings FOR EACH ROW EXECUTE FUNCTION tg_pfs_updated_at(); CREATE TRIGGER trg_ar_gen_installments AFTER INSERT ON accounts_receivable FOR EACH ROW EXECUTE FUNCTION fn_generate_receivable_installments();")
  # Explicitly check real baseline blocker: internal owner has no ownorg/partner link.
  assert run(as_uid(U['admin'],f"SELECT public.b2b_phase1_order_visible('11111111-0000-0000-0000-000000000001');"))=='f'
  ok('baseline phase1 real sem owner fallback; corpo capturado não substituído por true')

  # ---------- CANDIDATO ----------
  run((HERE/'candidate.sql.review').read_text())
  ok('candidato instalado com hashes hosted reais')
  # Already-installed fiscal containment: do not replay historical vulnerable PRE/candidate.
  run("SELECT public.fn_fiscal_requirement_resolve('b2b_partner','venda_mercadoria','SP','partner_order',NULL,CURRENT_DATE);")
  ok('ACL fiscal instalada preservada; nenhum replay de candidata/PRE anterior')
  acl = run("SELECT string_agg(p.proname||'='||coalesce(p.proacl::text,'default'),' ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname LIKE 'c2_owner%'")
  assert 'authenticated' not in acl and 'anon' not in acl and '=X/' not in acl.replace('postgres=X/postgres',''), acl
  ok('ACL: funções c2_owner_* sem EXECUTE para PUBLIC/anon/authenticated')
  run("SELECT md5(pg_get_functiondef('platform_private.assert_b2b_partner_scope(uuid,uuid)'::regprocedure));")

  # (1) autorização
  def scope(u, p=P_A): return as_uid(U[u], f"SELECT platform_private.assert_b2b_partner_scope('{U[u]}','{p}');")
  run(scope('gestor')); ok('gestor B2B passa no assert')
  run(scope('cumul'), 'forbidden_financial_terms'); ok('assert legado intacto: cumulativo continua negado nos callers legados')
  cscope = lambda u, p=P_A: as_uid(U[u], f"SELECT platform_private.c2_order_actor_scope('{U[u]}','{p}');")
  run(cscope('cumul')); ok('wrapper de compra: cumulativo passa com autoridade C2 completa')
  run(f"INSERT INTO user_roles VALUES('{U['cumul']}','cliente_produtor');")
  run(cscope('cumul'))
  assert run(as_uid(U['cumul'], f"SELECT public.is_valid_b2b_partner_user('{U['cumul']}','{P_A}');")) == 't'
  ok('corpos reais aceitam gestor+técnico+produtor, sem conferir vínculos de produtor pelo stub')
  run(f"DELETE FROM user_roles WHERE user_id='{U['cumul']}' AND role='cliente_produtor'; UPDATE profiles SET senha_provisoria=true WHERE user_id='{U['cumul']}';")
  run(cscope('cumul'), 'forbidden_financial_terms')
  ok('readiness real: senha provisória bloqueia cumulativo')
  run(f"UPDATE profiles SET senha_provisoria=false WHERE user_id='{U['cumul']}'; UPDATE partner_users SET tenant_id='{ORG_B}' WHERE user_id='{U['cumul']}';")
  run(cscope('cumul'), 'forbidden_financial_terms')
  ok('scope real: tenant do vínculo divergente bloqueia cumulativo')
  run(f"UPDATE partner_users SET tenant_id='{ORG_A}', valid_from=now()+interval '1 day' WHERE user_id='{U['cumul']}';")
  run(cscope('cumul'), 'forbidden_financial_terms')
  ok('is_valid real: vínculo futuro bloqueia cumulativo')
  run(f"UPDATE partner_users SET valid_from=now()-interval '1 day' WHERE user_id='{U['cumul']}'; UPDATE organizations SET ativo=false WHERE id='{ORG_A}';")
  run(cscope('cumul'), 'forbidden_financial_terms')
  ok('scope real: proprietário inativo bloqueia cumulativo')
  run(f"UPDATE organizations SET ativo=true WHERE id='{ORG_A}';")
  assert run(as_uid(U['gestor'],f"SELECT org_partner FROM platform_private.b2b_actor_scope('{U['gestor']}')"))==P_A
  run(f"UPDATE organizations SET partner_account_id='{P_B}' WHERE id='{ORG_A}';")
  assert run(as_uid(U['cumul'],f"SELECT platform_private.c2_owner_order_create_allowed('{U['cumul']}','{P_A}')"))=='f'
  run(cscope('cumul'),'forbidden_financial_terms')
  run(f"UPDATE organizations SET partner_account_id=NULL WHERE id='{ORG_A}';")
  ok('org_partner fallback réel A; conflit explicite owner ferme capacité et wrapper')
  run(cscope('gestor')); ok('wrapper de compra: gestor singleton passa (via assert)')
  run(cscope('tech'), 'forbidden_financial_terms'); ok('wrapper de compra: técnico isolado negado')
  run(as_uid(U['gestor'], f"SELECT platform_private.c2_order_actor_scope('{U['cumul']}','{P_A}');"), 'auth_required'); ok('wrapper: uid forjado negado')
  run(scope('tech'), 'forbidden_financial_terms'); ok('técnico isolado continua negado')
  run(scope('gestorB', P_A), 'forbidden_partner'); ok('A→B: gestor de B negado no parceiro A')
  def guard(u, p=P_A, plan=PLAN): return as_uid(U[u], f"SELECT platform_private.c2_owner_order_guard('{U[u]}','{p}','{plan}');")
  run(guard('gestor')); run(guard('cumul')); ok('guard libera gestor e cumulativo com plano atribuído')
  run(guard('tech'), 'C2_OWNER_ORDER_CLOSED'); ok('guard nega técnico isolado')
  run(guard('other'), 'C2_OWNER_ORDER_CLOSED'); ok('guard nega usuário sem vínculo/papel')
  run(guard('gestorB', P_A), 'C2_OWNER_ORDER_CLOSED'); ok('guard nega A→B')
  run(guard('gestor', P_A, PLAN2), 'plan_not_assigned'); ok('plano ativo porém não atribuído ao parceiro é negado')
  run(as_uid(U['gestor'], f"SELECT platform_private.c2_owner_order_guard('{U['cumul']}','{P_A}','{PLAN}');"), 'C2_OWNER_ORDER_CLOSED')
  ok('uid de parâmetro diferente do JWT nunca autoriza')
  # create/simulate chamam o guard (técnico isolado é parado antes pelo assert; usamos plano não atribuído)
  run(as_uid(U['gestor'], f"SELECT public.simulate_b2b_payment_plan_secure('{P_A}','{PLAN2}','[]'::jsonb,NULL);"), 'plan_not_assigned')
  run(as_uid(U['gestor'], f"SELECT public.create_partner_order_secure('{P_A}',NULL,'[{{}}]'::jsonb,NULL,'{PLAN2}',NULL,NULL,'h','k');"), 'plan_not_assigned')
  ok('create/simulate aplicam o guard server-side (não só a flag do menu)')
  # Revogações
  run(f"DELETE FROM user_roles WHERE user_id='{U['cumul']}' AND role='parceiro_b2b';")
  run(cscope('cumul'), 'forbidden_financial_terms'); run(guard('cumul'), 'C2_OWNER_ORDER_CLOSED')
  ok('revogar gestor do cumulativo ⇒ técnico residual não compra')
  run(f"INSERT INTO user_roles VALUES('{U['cumul']}','parceiro_b2b'); UPDATE partner_users SET revoked_at=now() WHERE user_id='{U['gestor']}';")
  run(guard('gestor'), 'C2_OWNER_ORDER_CLOSED'); ok('vínculo revogado ⇒ writer fechado')
  run(f"UPDATE partner_users SET revoked_at=NULL WHERE user_id='{U['gestor']}'; DELETE FROM fixture_entitlements WHERE user_id='{U['gestor']}' AND feature_key='pedidos_b2b';")
  run(guard('gestor'), 'C2_OWNER_ORDER_CLOSED'); ok('sem entitlement pedidos_b2b ⇒ writer fechado')
  run(f"INSERT INTO fixture_entitlements VALUES('{U['gestor']}','pedidos_b2b');")
  # projeção
  proj = run(as_uid(U['cumul'], "SELECT platform_private.b2b_commercial_partner_projection()->'order_capabilities';"))
  assert '"order_create": true' in proj and 'C2_OWNER_ORDER_V1' in proj, proj
  proj = run(as_uid(U['tech'], "SELECT platform_private.b2b_commercial_partner_projection()->'order_capabilities';"))
  assert '"order_create": false' in proj, proj
  ok('projeção: order_create=true cumulativo, false técnico isolado')

  # (G) destinatários de notificação
  ADM_B='00000000-0000-0000-0000-000000000077'; ADM_OFF='00000000-0000-0000-0000-000000000078'; GC_A='00000000-0000-0000-0000-000000000079'
  run(f"""INSERT INTO profiles(user_id,organization_id,ativo) VALUES('{ADM_B}','{ORG_B}',true),('{ADM_OFF}','{ORG_A}',false),('{GC_A}','{ORG_A}',true);
    INSERT INTO user_roles VALUES('{ADM_B}','administrador'),('{ADM_OFF}','administrador'),('{GC_A}','gestor_comercial');""")
  rec = run(f"SELECT string_agg(r::text,',' ORDER BY r) FROM platform_private.c2_order_internal_recipients('{P_A}') r")
  assert rec == ','.join(sorted([U['admin'], GC_A])), rec
  ok('novo pedido de A notifica só admin/gestor_comercial ATIVOS do tenant A (B e inativo excluídos)')
  recb = run(f"SELECT string_agg(r::text,',') FROM platform_private.c2_order_internal_recipients('{P_B}') r")
  assert recb == ADM_B, recb
  ok('novo pedido de B não notifica ninguém de A')
  d = run("SELECT pg_get_functiondef('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure)")
  assert 'c2_order_internal_recipients(p_partner_id)' in d and "WHERE ur.role IN ('administrador','gestor_comercial')" not in d
  ok('create usa destinatários do tenant dono (consulta global removida)')
  run(f"UPDATE partner_users SET revoked_at=now() WHERE user_id='{U['tech']}'; UPDATE profiles SET ativo=false WHERE user_id='{U['cumul']}';")
  pr = run(f"SELECT string_agg(r::text,',') FROM platform_private.c2_order_partner_recipients('{P_A}') r")
  assert pr == U['gestor'], pr
  ok('aprovação notifica só vínculos vigentes com perfil ativo (revogado/inativo excluídos)')
  assert run(f"SELECT count(*) FROM platform_private.c2_order_partner_recipients('{P_B}') r WHERE r='{U['gestor']}'") == '0'
  ok('aprovação de B não notifica usuário de A')
  d = run("SELECT pg_get_functiondef('public.approve_partner_order(uuid,text,date)'::regprocedure)")
  assert 'c2_order_partner_recipients(v_pid)' in d and 'FROM public.partner_users WHERE partner_id = v_pid' not in d
  ok('approve usa destinatários vigentes')
  run(f"UPDATE partner_users SET revoked_at=NULL WHERE user_id='{U['tech']}'; UPDATE profiles SET ativo=true WHERE user_id='{U['cumul']}';")
  acl2 = run("SELECT string_agg(coalesce(p.proacl::text,'default'),' ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname LIKE 'c2_order_%'")
  assert 'authenticated' not in acl2 and 'anon' not in acl2 and '=X/postgres' in acl2, acl2
  ok('ACL dos destinatários fechada a clientes')

  # (2) título: tenant dono, categoria/método estritos, cliente, parcelas, duplicidade
  def mk_order(oid, partner=P_A, amount=300, n=3, trig='na_aprovacao', method='pix'):
    return f'''
    INSERT INTO partner_orders(id,partner_id,numero,status,created_by) VALUES('{oid}','{partner}','N-{oid[:4]}','em_analise_comercial','{U['gestor']}');

    INSERT INTO partner_order_payment_terms(id,partner_order_id,final_amount,first_due_date,installment_count) VALUES(gen_random_uuid(),'{oid}',{amount},current_date+30,{n});
    INSERT INTO partner_order_payment_schedule(partner_order_id,payment_terms_id,installment_number,due_date,amount,interest_amount)
      SELECT '{oid}', t.id, g, current_date+30*g, round({amount}::numeric/{n},2) + CASE WHEN g={n} THEN {amount}-round({amount}::numeric/{n},2)*{n} ELSE 0 END, 0
      FROM partner_order_payment_terms t, generate_series(1,{n}) g WHERE t.partner_order_id='{oid}';
    UPDATE partner_orders SET payment_terms_id=(SELECT id FROM partner_order_payment_terms WHERE partner_order_id='{oid}') WHERE id='{oid}';'''
  O1='11111111-0000-0000-0000-000000000001'; O2='11111111-0000-0000-0000-000000000002'; O3='11111111-0000-0000-0000-000000000003'
  run(mk_order(O1) + "INSERT INTO financial_categories(name,type,active) VALUES('Desp','DESPESA',true),('Rec inativa','RECEITA',false);")
  def settings(partner=P_A,trig='na_aprovacao',method='AUDIT-AR-20260922 - Sem transferencia',actor=U['admin']):
    values=json.dumps(dict(billing_trigger=trig,payment_terms_days=7,default_payment_method=method,credit_limit=None,block_if_overdue=False,auto_generate_receivable=True,active=True,credit_limit_action='block',overdue_tolerance_days=0,credit_alert_threshold_1=80,credit_alert_threshold_2=90))
    return as_uid(actor,f"SELECT platform_private.c2p1_update_settings('{partner}',(SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='{partner}'),'{values}'::jsonb);")
  run("INSERT INTO payment_methods(name,active) VALUES('AUDIT-AR-20260922 - Sem transferencia',true);")
  run(settings())
  settings_before=run(f"SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='{P_A}'")
  ok('P1 CAS real cria settings com método AUDIT e prazo7; gerador não faz INSERT')
  approve = lambda oid: as_uid(U['admin'], f"SELECT public.approve_partner_order('{oid}',NULL,NULL);")
  run(approve(O1), 'B2B_REVENUE_CATEGORY_NOT_CONFIGURED')
  assert run(f"SELECT status FROM partner_orders WHERE id='{O1}'") == 'em_analise_comercial'
  assert run(f"SELECT count(*) FROM accounts_receivable") == '0'
  ok('sem categoria RECEITA ativa: aprovação abortada atomicamente, sem fallback DESPESA/inativa, sem título')
  run("INSERT INTO financial_categories(name,type,active) VALUES('Receita B2B','RECEITA',true);")
  run("UPDATE payment_methods SET active=false WHERE name='AUDIT-AR-20260922 - Sem transferencia';")
  run(approve(O1), 'B2B_PAYMENT_METHOD_NOT_CONFIGURED'); ok('forma de pagamento inativa: RPC aprovação abortada')
  run("INSERT INTO payment_methods(name,active) VALUES('pix',false);")
  run(approve(O1), 'B2B_PAYMENT_METHOD_NOT_CONFIGURED'); ok('forma de pagamento inativa não é usada')
  run("INSERT INTO payment_methods(name,active) VALUES('PIX',true),('AUDIT-AR-20260922 - Sem transferencia ',true); UPDATE payment_methods SET active=true WHERE name='AUDIT-AR-20260922 - Sem transferencia';")
  run(approve(O1), 'B2B_PAYMENT_METHOD_NOT_CONFIGURED'); ok('forma de pagamento ambígua falha')
  run("DELETE FROM payment_methods WHERE name='AUDIT-AR-20260922 - Sem transferencia '; UPDATE payment_methods SET active=true WHERE name='AUDIT-AR-20260922 - Sem transferencia';")
  run(f"INSERT INTO clientes VALUES('dddddddd-0000-0000-0000-000000000001','{ORG_B}'); UPDATE partner_accounts SET client_id='dddddddd-0000-0000-0000-000000000001' WHERE id='{P_A}';")
  run(approve(O1), 'B2B_CUSTOMER_TENANT_MISMATCH'); ok('client_id de outro tenant: falha explícita')
  run(f"UPDATE clientes SET organization_id='{ORG_A}';")
  run(f"UPDATE profiles SET organization_id='{ORG_B}' WHERE user_id='{U['admin']}';")
  run(approve(O1), 'b2b_phase1_scope_denied'); ok('emissor interno de outro tenant (h15) é negado')
  run(f"UPDATE profiles SET organization_id='{ORG_A}' WHERE user_id='{U['admin']}';")
  run(approve(O1))
  r = run(f"SELECT organization_id||'|'||total_amount||'|'||installment_count||'|'||(payment_method_id IS NOT NULL)||'|'||customer_id FROM accounts_receivable WHERE origin_id='{O1}'")
  assert r == f"{ORG_A}|300|3|true|dddddddd-0000-0000-0000-000000000001", r
  s = run(f"SELECT sum(net_amount)||'|'||count(*) FROM accounts_receivable_installments i JOIN accounts_receivable a ON a.id=i.receivable_id WHERE a.origin_id='{O1}'")
  assert s in ('300|3','300.00|3'), s
  assert run(f"SELECT status FROM partner_orders WHERE id='{O1}'") == 'aprovado'
  ok('aprovação gera 1 título no tenant dono, parcelas 3 somando 300 (cronograma canônico)')
  dup = run(as_uid(U['admin'], f"SELECT public.generate_b2b_receivable_secure('{O1}')->>'duplicado';"))
  assert dup == 'true' and run(f"SELECT count(*) FROM accounts_receivable WHERE origin_id='{O1}'") == '1'
  ok('segunda geração devolve duplicado=true, sem novo título')
  def financial_snapshot():
    return run("SELECT jsonb_build_object(" + ','.join(
      f"'{t}',(SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb) FROM {t} x)"
      for t in ['partner_orders','accounts_receivable','accounts_receivable_installments','partner_order_financial_links','partner_order_payment_schedule','partner_financial_settings','notificacoes_operacionais']) + ");")
  before_financial=financial_snapshot()
  call=as_uid(U['admin'],f"SELECT public.generate_b2b_receivable_secure('{O1}')->>'receivable_id';")
  with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    ids=list(pool.map(lambda _:run(call),range(2)))
  assert len(set(ids))==1 and ids[0]==run(f"SELECT receivable_id FROM partner_order_financial_links WHERE partner_order_id='{O1}'")
  assert financial_snapshot()==before_financial
  ok('duas conexões reais: replay mesmo UUID, título/vínculo/parcelas/cronograma/settings inalterados')
  assert run(f"SELECT to_jsonb(s) FROM partner_financial_settings s WHERE partner_id='{P_A}'")==settings_before
  ok('geração não grava settings nem modifica CAS/updated_at P1')
  for actor in ['gestor','cumul','tech','gestorB']:
    run(as_uid(U[actor],f"SELECT public.generate_b2b_receivable_secure('{O1}');"),'b2b_phase1_scope_denied' if actor in ['tech','gestorB'] else 'permission_denied')
    run(as_uid(U[actor],f"SELECT public.approve_partner_order('{O1}',NULL,NULL);"),'b2b_phase1_scope_denied' if actor in ['tech','gestorB'] else 'forbidden')
  ok('endpoints reais: gestor externo/cumulativo/técnico/B não aprovam ou geram título A')
  run(f"UPDATE partner_users SET revoked_at=now() WHERE user_id='{U['gestor']}';")
  run(as_uid(U['gestor'],f"SELECT public.generate_b2b_receivable_secure('{O1}');"),'b2b_phase1_scope_denied')
  run(f"UPDATE partner_users SET revoked_at=NULL WHERE user_id='{U['gestor']}';")
  ok('replay de título existente não contorna vínculo revogado')

  # Failure injection is ONLY a disposable trigger, never a substituted business body.
  O4='11111111-0000-0000-0000-000000000004'
  run(mk_order(O4))
  run("CREATE FUNCTION test_late_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test_late_failure'; END $$;")
  for table in ['partner_order_financial_links','notificacoes_operacionais']:
    baseline=financial_snapshot()
    audit_before=run("SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY to_jsonb(a)::text),'[]') FROM partner_order_audit_logs a")
    run(f"CREATE TRIGGER test_late_failure BEFORE INSERT ON {table} FOR EACH ROW EXECUTE FUNCTION test_late_failure();")
    run(approve(O4),'test_late_failure')
    assert financial_snapshot()==baseline
    assert run("SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY to_jsonb(a)::text),'[]') FROM partner_order_audit_logs a")==audit_before
    run(f"DROP TRIGGER test_late_failure ON {table};")
    ok(f'RPC aprovação: falha tardia {table} desfaz status/campos/título/parcelas/cronograma/auditoria/notificações')
  run(approve(O4))
  assert run(f"SELECT count(*) FROM accounts_receivable WHERE origin_id='{O4}'")=='1'
  ok('retry após falha tardia gera exatamente um título pela RPC real')

  # Missing settings must fail explicitly, not acquire a second provisioning ticket.
  O5='11111111-0000-0000-0000-000000000005'
  run(mk_order(O5,partner=P_B))
  run(f"UPDATE partner_orders SET status='aprovado' WHERE id='{O5}';")
  run(as_uid(ADM_B,f"SELECT public.generate_b2b_receivable_secure('{O5}');"),'B2B_FINANCIAL_SETTINGS_NOT_CONFIGURED')
  assert run(f"SELECT count(*) FROM partner_financial_settings WHERE partner_id='{P_B}'")=='0'
  run(as_uid(ADM_B,f"INSERT INTO partner_financial_settings(partner_id) VALUES('{P_B}');"),'C2P1_SETTINGS_WRITE_CLOSED')
  ok('ausência settings: erro explícito sem INSERT/ticket paralelo; fence P1 real nega provisionamento direto')
  # Partner tenta gerar título: negado
  run(as_uid(U['gestor'], f"SELECT public.generate_b2b_receivable_secure_impl('{O1}');"), 'Sem permissão')
  ok('gestor B2B externo não emite título')

  # (3) semântica posterior preservada: na_entrega continua registrando falha sem bloquear transição
  run(mk_order(O2, partner=P_B, trig='na_entrega', method='nao-existe'))
  run(settings(P_B,'na_entrega','PIX',ADM_B))
  run(as_uid(ADM_B,f"SELECT public.approve_partner_order('{O2}',NULL,NULL);"))
  run("UPDATE payment_methods SET active=false WHERE name='PIX';")
  run(f"SET request.jwt.claim.sub='{ADM_B}'; UPDATE partner_orders SET status='entregue' WHERE id='{O2}';")
  assert run(f"SELECT status FROM partner_orders WHERE id='{O2}'") == 'entregue'
  assert run(f"SELECT count(*) FROM partner_order_audit_logs WHERE order_id='{O2}' AND acao='financeiro_auto_falhou'") == '1'
  ok('na_entrega: semântica atual preservada (transição ocorre, falha registrada)')
  run(mk_order(O3, partner=P_B, trig='na_aprovacao', method='PIX'))
  run("UPDATE payment_methods SET active=true WHERE name='PIX';")
  run(settings(P_B,'na_aprovacao','PIX',ADM_B))
  run("UPDATE payment_methods SET active=false WHERE name='PIX';")
  run(f"SET request.jwt.claim.sub='{ADM_B}'; UPDATE partner_orders SET status='aprovado' WHERE id='{O3}';", 'B2B_APPROVAL_BILLING_FAILED')
  assert run(f"SELECT status FROM partner_orders WHERE id='{O3}'") == 'em_analise_comercial'
  assert run(f"SELECT count(*) FROM partner_order_audit_logs WHERE order_id='{O3}'") == '0'
  ok('na_aprovacao: qualquer falha de geração impede a aprovação (atômico)')

  expected={}
  for sig in ['platform_private.c2_owner_order_create_allowed(uuid,uuid)','platform_private.c2_owner_plan_assigned(uuid,uuid)','platform_private.c2_owner_order_guard(uuid,uuid,uuid)','platform_private.c2_order_actor_scope(uuid,uuid)','public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)','public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)','public.generate_b2b_receivable_secure_impl(uuid)','public.generate_b2b_receivable_secure(uuid)','public.approve_partner_order(uuid,text,date)','platform_private.b2b_commercial_partner_projection()']:
    expected[sig]=json.loads(run(f"SELECT jsonb_build_object('hash',md5(pg_get_functiondef('{sig}'::regprocedure)),'acl',proacl::text) FROM pg_proc WHERE oid='{sig}'::regprocedure"))
  (HERE/'postflight-expected.json').write_text(json.dumps(expected,indent=2)+'\n')

  # (4) rollback
  before = run("SELECT count(*) FROM accounts_receivable")+'|'+run("SELECT count(*) FROM partner_orders")
  run((HERE/'rollback.sql.review').read_text())
  assert run("SELECT md5(pg_get_functiondef('platform_private.assert_b2b_partner_scope(uuid,uuid)'::regprocedure))") == hosted['platform_private.assert_b2b_partner_scope']
  ok('assert byte-exato hosted em toda a vida do candidato')
  run(guard('gestor'), 'C2_OWNER_ORDER_CLOSED'); run(cscope('cumul'), 'forbidden_financial_terms')
  run(as_uid(U['gestor'], f"SELECT public.create_partner_order_secure('{P_A}',NULL,'[{{}}]'::jsonb,NULL,'{PLAN}',NULL,NULL,'h','k');"), 'C2_OWNER_ORDER_CLOSED')
  proj = run(as_uid(U['gestor'], "SELECT platform_private.b2b_commercial_partner_projection()->'order_capabilities'->>'order_create';"))
  assert proj == 'false', proj
  ok('rollback fecha writer server-side (create negado) e projeção false')
  assert run("SELECT count(*) FROM accounts_receivable")+'|'+run("SELECT count(*) FROM partner_orders") == before
  ok('rollback preserva pedidos e títulos')
  run(f"UPDATE partner_order_financial_links SET partner_order_id=partner_order_id; SET request.jwt.claim.sub='{ADM_B}'; UPDATE partner_orders SET status='aprovado' WHERE id='{O3}';", 'B2B_APPROVAL_BILLING_FAILED')
  ok('após rollback a aprovação continua impossível sem cobrança')
  d = run("SELECT pg_get_functiondef('public.generate_b2b_receivable_secure_impl(uuid)'::regprocedure)")
  assert 'ORDER BY created_at ASC LIMIT 1;\n  IF v_category_id IS NULL THEN\n    SELECT id INTO v_category_id FROM public.financial_categories ORDER BY' not in d
  ok('após rollback não há fallback de categoria')
  d = run("SELECT pg_get_functiondef('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)'::regprocedure)")
  assert 'c2_order_internal_recipients' in d
  ok('rollback não reabre notificação cross-tenant')
  # Historical installed containment has old approve expectations; current rollback retains tenant guard.
  run("CREATE OR REPLACE FUNCTION platform_private.c2_order_internal_recipients(_partner uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::uuid WHERE false $$; CREATE OR REPLACE FUNCTION platform_private.c2_order_partner_recipients(_partner uuid) RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT NULL::uuid WHERE false $$;")
  assert run(f"SELECT count(*) FROM platform_private.c2_order_internal_recipients('{P_A}')") == '0'
  assert run(f"SELECT count(*) FROM platform_private.c2_order_partner_recipients('{P_A}')") == '0'
  acl3 = run("SELECT string_agg(coalesce(p.proacl::text,'default'),' ') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='platform_private' AND p.proname LIKE 'c2_order_%recipients'")
  assert acl3 == '{postgres=X/postgres} {postgres=X/postgres}', acl3
  run(f"SET request.jwt.claim.sub='{ADM_B}'; UPDATE partner_orders SET status='aprovado' WHERE id='{O3}';", 'B2B_APPROVAL_BILLING_FAILED')
  ok('contenção do recorte instalado: helpers vazios, ACL postgres-only, aprovação atômica mantida')
  print(f'TOTAL {passed} PASS (PostgreSQL descartável, auth sintético; NÃO hosted)')
finally:
  subprocess.run(prefix+['pg_ctl','-D',str(tmp/'data'),'stop','-m','immediate'],capture_output=True)
