#!/usr/bin/env python3
"""Bateria descartável de 04/05/06a/06/07 com os 38 corpos REAIS de gatilho capturados no HML (C11, literais) e o legado de
crédito real. Esquema de colunas e ligações de gatilho são aproximações; helpers não-gatilho são stubs que negam tudo."""
import json, os, re, shutil, subprocess, tempfile
from pathlib import Path
D = Path(__file__).resolve().parent; TMP = Path(tempfile.mkdtemp(prefix="qaseed-", dir="/tmp")); TMP.chmod(0o777)
os.environ["PATH"] = str(Path(shutil.which("initdb")).resolve().parent) + os.pathsep + os.environ["PATH"]
PRIV = ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []
PORT = "55691"; R = []
def psql(sql, user="postgres", err=None):
    c = subprocess.run(["psql", "-X", "-h", str(TMP), "-p", PORT, "-U", user, "-qAt", "-v", "ON_ERROR_STOP=1", "-d", "postgres"], input=sql, text=True, capture_output=True)
    if err is not None:
        assert c.returncode != 0 and err in c.stderr, (err, c.stdout[-2000:], c.stderr[-2000:]); return c.stderr
    assert c.returncode == 0, c.stderr[-3000:]; return c.stdout.strip()
def ok(n): R.append({"name": n, "status": "PASS"}); print("PASS", n)
A, C, BIZ = "525fea87-e27e-43f7-af7b-a30064188332", "85ba8b71-8514-4ec9-90d3-bfc7ab3ed214", "00000000-0000-0000-0000-0000000000ff"
PA, PB, PC, PX = "cdb78993-89e4-48db-956e-f40b014a8146", "9d53f280-f828-4af8-a08c-3574263dc466", "6100c3ac-ff5b-4596-a0e3-92665a5dcaab", "00000000-0000-0000-0000-00000000abcd"
U = ["7d15eddb-38b6-43dd-bbf5-43936155321d", "5db79a8e-82af-419d-ae66-87a98c02fbec", "c3ed723f-1017-478e-99b2-25b48b3ab77e", "1d0ea582-1d46-4152-8fbe-f425c74942c1", "51652ab6-da23-4a3d-8f29-417af15cc761"]
REAL = "30000000-0000-0000-0000-000000000009"
OV = ["019fe16e-4a05-4ca1-8480-c2727b92dfa2", "d69bf60a-faa2-4cc0-80df-fd8dc913e9e9", "1aca4276-7043-4616-8dd5-839d2e4e86de", "1eac8c31-6b09-43fd-bbec-e523a812e6ba"]
SU = ["fcb4c72d-2040-4bbc-98fd-145f1463ec04", "2624ff4a-c4dd-4885-af23-beb8463d2209"]
SCHEMA = f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE qa_other LOGIN;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE SCHEMA platform_private; GRANT USAGE ON SCHEMA platform_private, public, auth TO qa_other;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor_comercial','financeiro');
CREATE TYPE public.partner_order_status AS ENUM ('rascunho','solicitado','pendente','em_analise_comercial','aguardando_cotacao','aguardando_aprovacao_credito','aguardando_ajuste_comercial','aguardando_itens','aprovado','reprovado','cancelado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, nome text, ativo boolean DEFAULT true);
CREATE TABLE public.clientes(id uuid PRIMARY KEY, organization_id uuid);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, razao_social text NOT NULL, deleted_at timestamptz, commercial_owner_organization_id uuid REFERENCES public.organizations, client_id uuid);
CREATE TABLE public.partner_users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, partner_id uuid REFERENCES public.partner_accounts, papel text, tenant_id uuid);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, nome text, ativo boolean DEFAULT true);
CREATE TABLE public.financial_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, type text, active boolean DEFAULT true, created_at timestamptz DEFAULT now());
CREATE TABLE public.payment_methods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text, active boolean DEFAULT true);
CREATE TABLE public.company_fiscal_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid, is_active boolean, configuration_status text, accounting_validated_at timestamptz, legal_name text, cnpj text, configuration_version int);
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY, numero text, partner_id uuid NOT NULL REFERENCES public.partner_accounts, cliente_id uuid, status public.partner_order_status NOT NULL DEFAULT 'rascunho',
 subtotal numeric, desconto_total numeric DEFAULT 0, total numeric, final_amount_with_interest numeric, observacoes text, payment_terms_id uuid, payment_plan_id uuid, payment_condition_status text,
 internal_origin_snapshot jsonb, internal_economic_snapshot jsonb, c2_external_origin_snapshot jsonb, ready_for_production boolean DEFAULT false, receivable_generated boolean DEFAULT false,
 credit_approved_at timestamptz, credit_approved_by uuid, credit_approval_notes text, credit_block_reason text, approved_at timestamptz, approved_by uuid, priority text,
 requires_financial_approval boolean DEFAULT false, financial_approval_status text DEFAULT 'not_required', financial_status text, requested_delivery_date date,
 created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.partner_order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid REFERENCES public.partner_orders, quantidade numeric, preco_unitario numeric, desconto_percentual numeric, subtotal numeric, created_at timestamptz DEFAULT now());
CREATE TABLE public.accounts_receivable(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), origin_type text NOT NULL, origin_id uuid, description text NOT NULL, category_id uuid NOT NULL REFERENCES public.financial_categories,
 total_amount numeric NOT NULL, issue_date date DEFAULT current_date, first_due_date date NOT NULL, installment_count int NOT NULL DEFAULT 1, partner_id uuid, organization_id uuid, customer_id uuid, notes text,
 fiscal_invoice_required boolean, payment_method_id uuid, status text NOT NULL DEFAULT 'OPEN', created_by uuid, created_at timestamptz DEFAULT now());
CREATE TABLE public.accounts_receivable_installments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), receivable_id uuid NOT NULL REFERENCES public.accounts_receivable, installment_number int NOT NULL, due_date date NOT NULL,
 original_amount numeric NOT NULL, received_amount numeric DEFAULT 0, discount_amount numeric DEFAULT 0, interest_amount numeric DEFAULT 0, penalty_amount numeric DEFAULT 0, net_amount numeric NOT NULL, status text NOT NULL DEFAULT 'OPEN', organization_id uuid);
CREATE TABLE public.partner_order_payment_terms(id uuid PRIMARY KEY, partner_order_id uuid NOT NULL REFERENCES public.partner_orders ON DELETE CASCADE, plan_name_snapshot text NOT NULL, plan_code_snapshot text NOT NULL,
 discount_percent_snapshot numeric NOT NULL, monthly_interest_percent_snapshot numeric NOT NULL, months_count_snapshot numeric NOT NULL, installment_count int, first_due_date date NOT NULL, table_amount numeric,
 discount_amount numeric, net_amount_after_discount numeric, financial_interest_amount numeric, final_amount numeric, approval_status text, approved_by uuid, approved_at timestamptz, approval_notes text, updated_at timestamptz DEFAULT now());
CREATE TABLE public.partner_order_payment_schedule(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid NOT NULL REFERENCES public.partner_orders ON DELETE CASCADE, payment_terms_id uuid NOT NULL,
 installment_number int NOT NULL, due_date date NOT NULL, amount numeric(14,2) NOT NULL, principal_amount numeric(14,2), interest_amount numeric(14,2), status text NOT NULL DEFAULT 'planned', receivable_installment_id uuid, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.partner_order_financial_links(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid NOT NULL REFERENCES public.partner_orders, partner_id uuid NOT NULL, receivable_id uuid NOT NULL REFERENCES public.accounts_receivable, financial_status text DEFAULT 'gerado', updated_at timestamptz DEFAULT now());
CREATE TABLE public.partner_financial_settings(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid NOT NULL REFERENCES public.partner_accounts, credit_limit numeric DEFAULT 0, default_payment_method text DEFAULT 'boleto',
 credit_alert_threshold_1 numeric DEFAULT 80, credit_alert_threshold_2 numeric DEFAULT 95, active boolean DEFAULT true, auto_generate_receivable boolean DEFAULT false, billing_trigger text DEFAULT 'na_aprovacao',
 overdue_tolerance_days int DEFAULT 0, block_if_overdue boolean DEFAULT false, credit_limit_action text DEFAULT 'block', created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
CREATE TABLE public.partner_order_audit_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid, partner_id uuid, usuario_id uuid, acao text, dados_anteriores jsonb, dados_novos jsonb, created_at timestamptz DEFAULT now());
CREATE TABLE public.production_timeline_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid, event_type text, event_at timestamptz DEFAULT now(), actor_id uuid, meta jsonb);
CREATE TABLE public.production_planning(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid UNIQUE, partner_id uuid, status text, created_by uuid);
CREATE TABLE public.commercial_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid, partner_id uuid, order_id uuid, acao text, dados_anteriores jsonb, dados_novos jsonb);
CREATE TABLE public.financial_governance_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid, partner_id uuid, acao text, dados_anteriores jsonb, dados_novos jsonb);
CREATE TABLE public.notificacoes_operacionais(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id uuid, tipo text, titulo text, mensagem text, link text, lido boolean);
CREATE TABLE public.partner_risk_scores(partner_id uuid PRIMARY KEY, computed_at timestamptz DEFAULT now());
CREATE TABLE public.partner_engagement_metrics(partner_id uuid PRIMARY KEY, refreshed_at timestamptz DEFAULT now());
CREATE TABLE platform_private.financial_initial_installments(transaction_id bigint, title_id uuid, kind text, actor_id uuid, organization_id uuid, installments jsonb);
CREATE TABLE platform_private.delivery_context_20261030(txid bigint);
CREATE TABLE public.saas_plans(id uuid PRIMARY KEY, key text, name text, active boolean);
CREATE TABLE public.saas_plan_versions(id uuid PRIMARY KEY, plan_id uuid REFERENCES public.saas_plans, status text);
CREATE TABLE public.organization_subscriptions(id uuid PRIMARY KEY, organization_id uuid NOT NULL REFERENCES public.organizations, plan_version_id uuid REFERENCES public.saas_plan_versions);
CREATE TABLE public.organization_subscription_history(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid REFERENCES public.organization_subscriptions, organization_id uuid, reason text);
CREATE TABLE public.organization_feature_overrides(id uuid PRIMARY KEY, organization_id uuid REFERENCES public.organizations, reason text);
CREATE TABLE public.organization_feature_override_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), override_id uuid, organization_id uuid, action text);
CREATE TABLE public.financial_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), entity_type text NOT NULL, entity_id uuid NOT NULL, action text NOT NULL, old_data jsonb, new_data jsonb, performed_by uuid);
GRANT SELECT, INSERT, DELETE ON ALL TABLES IN SCHEMA public TO qa_other;
-- Helpers NÃO-gatilho (stubs do banco descartável; fora do escopo C11). Nenhum concede passagem: tickets/permissões = false.
CREATE FUNCTION platform_private.has_ticket(text, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION platform_private.c2p1_settings_allowed(uuid, boolean) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION platform_private.c2p1_payment_method_name(text) RETURNS text LANGUAGE sql AS $$ SELECT NULL::text $$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.is_financial_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.fn_cc_can_prepare(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public._saas_user_has_feature(uuid, text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.fn_h6d_hard_delete_allowed() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.partner_order_has_production(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.fn_b2b_plan_selectable(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION public.fn_b2b_status_is_operational(public.partner_order_status) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') $$;
CREATE FUNCTION public.fn_b2b_status_is_approved_or_later(public.partner_order_status) RETURNS boolean LANGUAGE sql AS $$ SELECT $1 IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') $$;
CREATE FUNCTION public._notify_role(public.app_role, text, text, text, text) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.generate_b2b_receivable_secure(uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'NO_AUTO_RECEIVABLE_IN_TEST'; END $$;
CREATE FUNCTION public.recalc_partner_risk_score(uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.partner_risk_scores(partner_id) VALUES ($1) ON CONFLICT (partner_id) DO UPDATE SET computed_at = now() $$;
CREATE FUNCTION public.refresh_partner_engagement(uuid) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.partner_engagement_metrics(partner_id) VALUES ($1) ON CONFLICT (partner_id) DO UPDATE SET refreshed_at = now() $$;
{(D / "captured/c11-triggers.sql").read_text()}
{(D.parent / "captured/fn_b2b_credit_exposure.sql").read_text()};
CREATE FUNCTION public.saas_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$ DECLARE x int; BEGIN RAISE EXCEPTION 'SAAS_NO_DELETE'; END $$;
-- Ligações (pior caso plausível; o 05 recusa no HML qualquer gatilho fora de C11 nas tabelas tocadas):
CREATE TRIGGER a_saas BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public._saas_trg_require_feature('pedidos_b2b');
CREATE TRIGGER b2b_internal_guard BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_order_snapshot_guard();
CREATE TRIGGER c2_pending BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.c2_accounting_pending_guard();
CREATE TRIGGER c2_final BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.c2_external_final_state_guard();
CREATE TRIGGER credit_fields BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.fn_b2b_guard_credit_approval_fields();
CREATE TRIGGER credit_guard BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_partner_orders_credit_guard();
CREATE TRIGGER delivery_nd BEFORE INSERT OR UPDATE OR DELETE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.delivery_no_downstream_20261030();
CREATE TRIGGER delivery_tr BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION platform_private.delivery_order_transition_guard_20261030();
CREATE TRIGGER edit_after_op BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_block_partner_order_edit_after_op();
CREATE TRIGGER plan_sel BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_b2b_enforce_plan_selectable();
CREATE TRIGGER require_items BEFORE INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_partner_orders_require_items();
CREATE TRIGGER upd BEFORE UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER block_del BEFORE DELETE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_block_partner_order_delete();
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.partner_orders_audit_trigger();
CREATE TRIGGER z_commercial AFTER INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_audit_partner_order_commercial();
CREATE TRIGGER z_timeline AFTER INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.trg_partner_order_timeline();
CREATE TRIGGER z_engagement AFTER INSERT OR UPDATE OR DELETE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_engagement();
CREATE TRIGGER z_notify AFTER INSERT OR UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_notify_payment_terms_pending();
CREATE TRIGGER z_auto_rec AFTER UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.tg_auto_b2b_receivable();
CREATE TRIGGER z_planning AFTER UPDATE ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION public.trg_partner_order_to_planning_fn();
CREATE TRIGGER a_homolog BEFORE INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.homolog_validation_block_receivable_insert();
CREATE TRIGGER d51 BEFORE INSERT OR UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.d51_5_validate_financial_tenant_links();
CREATE TRIGGER g_tenant BEFORE INSERT OR UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_organization_id();
CREATE TRIGGER h6 BEFORE UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_h6_guard_title_snapshot();
CREATE TRIGGER h6d BEFORE DELETE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();
CREATE TRIGGER nd_delivery BEFORE INSERT OR UPDATE OR DELETE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION platform_private.delivery_no_downstream_20261030();
CREATE TRIGGER z_inst AFTER INSERT ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_generate_receivable_installments();
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
CREATE TRIGGER z_sync AFTER UPDATE ON public.accounts_receivable FOR EACH ROW EXECUTE FUNCTION public.tg_sync_b2b_financial_status();
CREATE TRIGGER d51 BEFORE INSERT OR UPDATE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION public.d51_5_validate_financial_tenant_links();
CREATE TRIGGER g_tenant BEFORE INSERT OR UPDATE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_organization_id();
CREATE TRIGGER h6d BEFORE DELETE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION public.fn_h6d_block_hard_delete();
CREATE TRIGGER z_risk AFTER INSERT OR UPDATE OR DELETE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION public.tg_recalc_risk_on_ar_change();
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE OR DELETE ON public.accounts_receivable_installments FOR EACH ROW EXECUTE FUNCTION public.fn_financial_audit();
CREATE TRIGGER child BEFORE INSERT OR UPDATE OR DELETE ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_child_snapshot_guard();
CREATE TRIGGER upd BEFORE UPDATE ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER z_h6c AFTER INSERT ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION public.fn_h6c_set_canonical_payment_terms();
CREATE TRIGGER z_audit AFTER INSERT OR UPDATE ON public.partner_order_payment_terms FOR EACH ROW EXECUTE FUNCTION public.audit_partner_order_payment_terms();
CREATE TRIGGER child BEFORE INSERT OR UPDATE OR DELETE ON public.partner_order_payment_schedule FOR EACH ROW EXECUTE FUNCTION platform_private.b2b_internal_child_snapshot_guard();
CREATE TRIGGER approved BEFORE INSERT ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION public.tg_b2b_block_receivable_before_approval();
CREATE TRIGGER upd BEFORE UPDATE ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION public.tg_pofl_updated_at();
CREATE TRIGGER no_del BEFORE DELETE ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION public.tg_block_pofl_delete();
CREATE TRIGGER z_engagement AFTER INSERT OR UPDATE OR DELETE ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION public.tg_refresh_engagement();
CREATE TRIGGER fence BEFORE INSERT OR UPDATE OR DELETE ON public.partner_financial_settings FOR EACH ROW EXECUTE FUNCTION platform_private.c2p1_settings_fence();
CREATE TRIGGER upd BEFORE UPDATE ON public.partner_financial_settings FOR EACH ROW EXECUTE FUNCTION public.tg_pfs_updated_at();
CREATE TRIGGER z_gov AFTER INSERT OR UPDATE OR DELETE ON public.partner_financial_settings FOR EACH ROW EXECUTE FUNCTION public.tg_governance_audit();
CREATE TRIGGER nd BEFORE DELETE ON public.organization_subscriptions FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.organization_subscription_history FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.organization_feature_override_audit FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.financial_audit_log FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
CREATE TRIGGER nd BEFORE DELETE ON public.saas_plan_versions FOR EACH ROW EXECUTE FUNCTION public.saas_no_delete();
INSERT INTO public.organizations VALUES ('{A}','QA A'),('{C}','QA C'),('{BIZ}','Negócio');
INSERT INTO public.financial_categories(name,type) VALUES ('Receita ref','RECEITA');
INSERT INTO public.partner_accounts VALUES ('{PA}','Parceiro QA A',NULL,'{A}'),('{PB}','Parceiro QA B',NULL,'{A}'),('{PC}','Parceiro QA C',NULL,'{C}'),('{PX}','Parceiro de negócio',NULL,'{BIZ}');
INSERT INTO auth.users SELECT u::uuid, 'qa'||n||'@x' FROM unnest('{{{",".join(U)}}}'::text[]) WITH ORDINALITY t(u,n); INSERT INTO auth.users VALUES ('{REAL}','real@cliente');
INSERT INTO public.profiles SELECT u::uuid, CASE WHEN u='{U[2]}' THEN '{C}'::uuid ELSE '{A}'::uuid END, 'QA' FROM unnest('{{{",".join(U)}}}'::text[]) u; INSERT INTO public.profiles VALUES ('{REAL}','{BIZ}','Real');
INSERT INTO public.partner_users(user_id, partner_id, papel, tenant_id) VALUES ('{U[0]}','{PA}','financeiro','{A}'),('{U[1]}','{PB}','financeiro','{A}'),('{U[2]}','{PC}','financeiro','{C}'),('{U[3]}','{PA}','gestor','{A}'),('{U[4]}','{PA}','tecnico','{A}');
INSERT INTO public.saas_plans VALUES ('7e570000-0000-4000-8000-0000000000a1','gratuito','Gratuito',true),('78000000-0000-4f00-8127-000000000001','qa_outro','QA outro',true);
INSERT INTO public.saas_plan_versions VALUES ('7e570000-0000-4000-8000-0000000000b1','7e570000-0000-4000-8000-0000000000a1','PUBLISHED');
"""
SAAS = f"""INSERT INTO public.organization_subscriptions VALUES ('{SU[0]}','{A}','7e570000-0000-4000-8000-0000000000b1'),('{SU[1]}','{C}','7e570000-0000-4000-8000-0000000000b1');
INSERT INTO public.organization_subscription_history(subscription_id, organization_id, reason) SELECT id, organization_id, 'QA-FIN-20261117: massa ficticia autorizada, somente homologacao' FROM public.organization_subscriptions;
INSERT INTO public.organization_feature_overrides VALUES ('{OV[0]}','{A}','QA-FIN-20261117: teste ficticio autorizado de isolamento'),('{OV[1]}','{C}','QA-FIN-20261117: t'),('{OV[2]}','{A}','QA-FIN-20261117: t'),('{OV[3]}','{C}','QA-FIN-20261117: t');
INSERT INTO public.organization_feature_override_audit(override_id, organization_id, action) SELECT id, organization_id, 'grant' FROM public.organization_feature_overrides;"""
BUSINESS = """ALTER TABLE public.accounts_receivable DISABLE TRIGGER a_homolog;  -- só no banco descartável: linha de negócio pré-existente
INSERT INTO public.accounts_receivable(origin_type, description, category_id, total_amount, first_due_date, installment_count, partner_id, organization_id)
 SELECT 'MANUAL','Negócio real', (SELECT id FROM public.financial_categories), 10, current_date, 1, '%s', '%s';
ALTER TABLE public.accounts_receivable ENABLE TRIGGER a_homolog;""" % (PX, BIZ)
F = {n: (D / n).read_text() for n in ["04-register-saas-hml.sql.review", "05-seed-hml.sql.review", "06a-cleanup-dryrun-hml.sql.rollback", "06-cleanup-hml.sql.review", "07-verify-clean-hml.sql.readonly"]}
REG, SEED, DRY, CLEAN, VER = F.values()
MD5 = "SELECT string_agg(md5(prosrc)||md5(pg_get_functiondef(p.oid)), ',' ORDER BY proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','platform_private') AND p.prorettype='trigger'::regtype;"
SNAP = "SELECT (SELECT count(*) FROM public.accounts_receivable)||','||(SELECT count(*) FROM public.accounts_receivable_installments)||','||(SELECT count(*) FROM public.financial_audit_log)||','||(SELECT count(*) FROM public.partner_accounts)||','||(SELECT count(*) FROM public.saas_plans)||','||(SELECT count(*) FROM public.saas_plan_versions)||','||(SELECT count(*) FROM public.organizations)||','||(SELECT count(*) FROM auth.users);"
def digest(out):
    m = re.search(r"^QA_CLEAN_DIGEST\|(\w+)\|(\d+)$", out, re.M); assert m, out[-1500:]; return m.group(1), int(m.group(2))
def refusals(out): return [l for l in out.splitlines() if l.startswith("QA_CLEAN_REFUSALS|")]
try:
    subprocess.run(PRIV + ["initdb", "-D", str(TMP/"d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(PRIV + ["pg_ctl", "-D", str(TMP/"d"), "-l", str(TMP/"log"), "-o", f"-k {TMP} -h \"\" -p {PORT}", "start", "-w"], check=True, capture_output=True)
    psql("CREATE TABLE public.organizations(id uuid);"); psql(REG, err="impressão digital HML ausente"); psql("DROP TABLE public.organizations;"); ok("recusa alvo sem impressão digital HML (produção)")
    psql(SCHEMA); psql(BUSINESS); base_md5 = psql(MD5); base_pre = psql(SNAP)
    psql("INSERT INTO public.partner_orders(id, numero, partner_id, total) VALUES (gen_random_uuid(), 'QA-FIN-repro', '%s', 1);" % PA, err="auth_required")
    ok("reproduz falha real do 05 b797 (auth_required na guarda de origem interna com gatilho real)")
    psql(SEED, err="QA_SEED_REFUSED: rodar 04"); psql(REG, err="assinaturas QA ausentes"); ok("05 exige 04; 04 exige SaaS QA existente")
    psql(SAAS); psql(REG, user="qa_other", err="session_user"); out = psql(REG); assert "QA_SAAS_REGISTERED|6" in out, out
    psql(REG, err="seed anterior existe"); ok("04 registra 2 assinaturas + 4 overrides uma única vez")
    base = psql(SNAP)
    psql("CREATE FUNCTION public.boom() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'GUARD_REAL_X'; END$$; CREATE TRIGGER boom BEFORE INSERT ON public.partner_order_financial_links FOR EACH ROW EXECUTE FUNCTION public.boom();")
    psql(SEED, err="gatilho não capturado em C11"); assert psql(SNAP) == base
    psql("DROP TRIGGER boom ON public.partner_order_financial_links; DROP FUNCTION public.boom();"); assert psql(MD5) == base_md5; ok("gatilho fora da captura C11 recusa antes de escrever")
    psql("CREATE OR REPLACE FUNCTION public.tg_pofl_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$\nBEGIN NEW.updated_at = now(); RETURN NEW; END  $function$;")
    psql(SEED, err="deriva C11 em public.tg_pofl_updated_at()"); assert psql(SNAP) == base
    psql("CREATE OR REPLACE FUNCTION public.tg_pofl_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$\nBEGIN NEW.updated_at = now(); RETURN NEW; END $function$;"); assert psql(MD5) == base_md5
    ok("deriva de corpo real (md5 C11) recusa sem efeito")
    psql("INSERT INTO platform_private.delivery_context_20261030 VALUES (0);")  # contexto de outra txid não interfere
    ok("guardas reais seguem ativas (contexto de entrega alheio ignorado)")
    out = psql(SEED); assert psql(MD5) == base_md5
    tj = json.loads([l for l in out.splitlines() if l.startswith("QA_TITLES_JSON|")][0].split("|", 1)[1])
    assert set(tj) == {"A", "B", "C"} and all(len(v) == 1 and len(v[0]["installments"]) == 2 for v in tj.values()); ok("seed cria títulos A/B/C com pedido, 2 parcelas e vínculo")
    assert psql("SELECT count(*) FROM public.partner_order_payment_terms")=="3" and psql("SELECT count(*) FROM public.partner_order_payment_schedule WHERE receivable_installment_id IS NOT NULL")=="6"
    assert psql("SELECT count(*) FROM public.financial_audit_log WHERE entity_type='accounts_receivable_installments' AND action='INSERT' AND entity_id IN (SELECT i.id FROM public.accounts_receivable_installments i JOIN public.accounts_receivable r ON r.id=i.receivable_id WHERE r.description LIKE 'QA-FIN-%')")=="6"
    assert psql("SELECT count(*) FROM public.partner_orders WHERE numero LIKE 'QA-FIN-%' AND status='aprovado' AND internal_origin_snapshot IS NULL AND c2_external_origin_snapshot IS NULL AND NOT ready_for_production")=="3"
    assert psql("SELECT count(*) FROM public.partner_financial_settings")=="3" and psql("SELECT count(*) FROM public.commercial_audit_log")=="3" and psql("SELECT count(*) FROM public.production_timeline_events")=="3"
    assert psql("SELECT count(*) FROM public.partner_risk_scores")=="3" and psql("SELECT count(*) FROM public.production_planning")=="0" and psql("SELECT count(*) FROM public.notificacoes_operacionais")=="0"
    ok("gatilhos reais executaram: parcelas geradas pelo motor real, auditorias/timeline/risco gravados, sem planejamento/notificação")
    assert psql("SELECT count(*) FROM public.partner_orders WHERE internal_economic_snapshot->>'schema_version'='1' AND internal_economic_snapshot->>'qa_fixture'='true' AND jsonb_array_length(internal_economic_snapshot->'schedule')=2")=="3"
    assert psql("SELECT to_regprocedure('qa_b2bfin.seed_legacy_origin(uuid,uuid,uuid,uuid,text)') IS NULL")=="t"; ok("origem legada fictícia completa (termos, cronograma, snapshot selado, auditoria) e função de seed removida")
    psql("INSERT INTO public.accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,installment_count) SELECT 'X','QA-FIN-intruso',id,1,current_date,1 FROM public.financial_categories;", err="HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED")
    psql("INSERT INTO public.partner_orders(id, numero, partner_id, total) VALUES (gen_random_uuid(), 'QA-FIN-intruso', '%s', 1);" % PA, err="auth_required")
    psql("INSERT INTO public.partner_financial_settings(partner_id) VALUES ('%s');" % PX, err="C2P1_SETTINGS_WRITE_CLOSED")
    psql("INSERT INTO public.accounts_receivable(origin_type,description,category_id,total_amount,first_due_date,installment_count) SELECT 'X','QA-FIN-intruso',id,1,current_date,1 FROM public.financial_categories;", user="qa_other", err="HOMOLOG_VALIDATION_RECEIVABLE_BLOCKED")
    psql("DELETE FROM public.accounts_receivable_installments;", err="nao pode ser excluido"); ok("após seed: bloqueio homolog e no-delete voltam a valer para todos")
    psql(SEED, err="seed anterior existe"); psql("SELECT * FROM qa_b2bfin.manifest", user="qa_other", err="permission denied"); ok("seed não duplica; manifesto fechado")
    seeded = psql(SNAP)
    out = psql(DRY); d, n = digest(out); assert not refusals(out) and n > 0 and psql(SNAP) == seeded and psql(MD5) == base_md5
    plan = [l for l in out.splitlines() if l.startswith("QA_CLEAN_PLAN|")]
    assert not any(x in l for l in plan for x in ("saas_plan", "organizations|", "financial_categories", "Negócio")), plan
    ok(f"dry-run lista {n} linhas (tabela/ID/hash/vínculo), sem recusas e sem alterar nada")
    psql("SET app.qa_cleanup_digest='errado';\n" + CLEAN, err="difere do aprovado"); psql(CLEAN, err="difere do aprovado"); ok("execução exige o digest do dry-run")
    for label, setup, undo, reason in [
        ("ator QA em linha de negócio", f"CREATE TABLE public.notas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), created_by uuid); INSERT INTO public.notas(created_by) VALUES ('{U[0]}');", "DROP TABLE public.notas;", "ator_qa_em_linha_de_negocio"),
        ("coincidência só textual", f"CREATE TABLE public.textos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), corpo text); INSERT INTO public.textos(corpo) VALUES ('menciona {PA}');", "DROP TABLE public.textos;", "referencia_so_textual"),
        ("linha de outro tenant", f"CREATE TABLE public.extra(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_id uuid, organization_id uuid); INSERT INTO public.extra(partner_id, organization_id) VALUES ('{PA}','{BIZ}');", "DROP TABLE public.extra;", "outro_tenant"),
        ("plano/versão protegido", f"ALTER TABLE public.saas_plan_versions ADD COLUMN ref uuid; UPDATE public.saas_plan_versions SET ref='{SU[0]}';", "ALTER TABLE public.saas_plan_versions DROP COLUMN ref;", "tabela_protegida")]:
        psql(setup); out = psql(DRY); r = refusals(out); assert any(reason in l for l in r), (label, r, [l for l in out.splitlines() if "notas" in l or "textos" in l or "extra" in l])
        d2, _ = digest(out); psql(f"SET app.qa_cleanup_digest='{d2}';\n" + CLEAN, err="QA_CLEAN_REFUSED"); assert psql(SNAP) == seeded and psql(MD5) == base_md5
        psql(undo); ok(f"limpeza recusa {label} (dry-run lista, execução aborta sem efeito)")
    out = psql(DRY); d, n = digest(out); assert not refusals(out)
    out = psql(f"SET app.qa_cleanup_digest='{d}';\n" + CLEAN); assert "QA_CLEAN_PASS|5" in out, out[-800:]
    assert psql(MD5) == base_md5 and psql("SELECT to_regnamespace('qa_b2bfin') IS NULL") == "t"
    x = base_pre.split(','); x[3] = '1'; assert psql(SNAP) == ','.join(x) == '1,1,2,1,2,1,3,6', (psql(SNAP), base_pre)  # só os 3 parceiros QA saem
    assert psql("SELECT count(*) FROM public.partner_accounts WHERE id='%s'" % PX) == "1" and psql("SELECT nome FROM public.profiles") == "Real"
    for t in ["organization_subscriptions", "organization_subscription_history", "organization_feature_overrides", "organization_feature_override_audit", "partner_users", "partner_orders", "partner_order_payment_terms", "partner_order_payment_schedule", "partner_order_financial_links", "partner_financial_settings", "partner_order_audit_logs", "production_timeline_events", "commercial_audit_log", "financial_governance_audit_log", "partner_risk_scores", "partner_engagement_metrics"]:
        assert psql(f"SELECT count(*) FROM public.{t}") == "0", t
    ok("limpeza remove toda a massa QA; plano/versão, tenants, negócio e auth intactos; corpos restaurados")
    psql("DELETE FROM public.accounts_receivable;", err="nao pode ser excluido"); ok("no-delete restaurado após limpeza")
    v = psql(VER); assert v.startswith("QA_VERIFY|t|0|0|"), v; ok("07 confirma limpo (contas Auth: remover no painel)")
finally:
    subprocess.run(PRIV + ["pg_ctl", "-D", str(TMP/"d"), "stop", "-m", "immediate"], capture_output=True)
    (D / "evidence-seed-local.json").write_text(json.dumps({"synthetic_schema": True, "real_trigger_bodies_c11": 38, "trigger_bindings_real": False, "proves_hml_acceptance": False, "results": R}, indent=1, ensure_ascii=False))
print(f"{len(R)} PASS")
