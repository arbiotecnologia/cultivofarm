#!/usr/bin/env python3
"""PG DESCARTÁVEL — B2B_PARTNER_PACKAGING_ORDER_V1.

Executa 01/02/03/04 EXATAMENTE como gerados sobre um cluster local em /tmp (sem rede, sem sessão real, sem writes remotos).
CORPOS REAIS (byte a byte, md5 conferido) carregados de ./captured: create_partner_order_secure, simulate_b2b_payment_plan_secure,
respond_b2b_order_quote_secure, fn_resolve_b2b_cart, fn_b2b_cart_hash, fn_resolve_commercial_price, recorte_a_legacy_solid,
b2b_partner_catalog_reader, solid_pack_presentation_link, partner_order_items_catalog_tenant_guard, fn_b2b_guard_order_items_immutable.
COSTURAS SINTÉTICAS (declaradas): auth.uid por GUC local; has_role/get_user_partner_id/is_platform_superadmin/b2b_actor_scope/
b2b_internal_commercial_actor/c2_internal_order_target_reason/_saas_user_has_feature sobre tabelas mínimas; c2_order_actor_scope,
c2_owner_order_guard, c2_attempt_dispatch_guard, c2_partner_order_attempt_authz, c2_owner_order_create_allowed, issue_ticket,
c2_order_internal_recipients, b2b_internal_assert_origin, b2b_phase1_order_visible, fn_b2b_credit_exposure (sem limite),
fn_b2b_apply_interest (juros 0), fn_b2b_plan_selectable, fn_catalogo_preco_canonico, fn_b2b_status_is_approved_or_later e
get_partner_catalog_secure (chama o leitor REAL e lista itens ativos/b2b/não ocultos do vendedor); esquema mínimo; demais
gatilhos de partner_orders omitidos; exclusão GiST de catalogo_precos_embalagem omitida. NÃO é prova JWT/RLS/Storage hospedada.
Escopo: vendedor sintético "AR Bio" e um segundo tenant sintético; nenhum dado real, nenhuma FSF.
"""
import hashlib, json, os, pathlib, shutil, subprocess, sys, tempfile, threading, time
REAL = os.environ.get("B2BPACK_REAL_TRIGGERS") == "1"
if REAL:
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent)); import real_triggers as RT

HERE = pathlib.Path(__file__).resolve().parent
CAP = HERE / "captured"
PORT = "55447"
SOCK = [""]


def u(n):
    return f"00000000-0000-0000-0000-{n:012d}"


A, F = u(1), u(2)                       # tenants vendedores sintéticos (A = AR Bio)
P, PO, PF = u(11), u(12), u(13)         # parceiro do comprador (A), outro parceiro (A), parceiro de F
UB, UT, UB2, UADM, UADMF, UINACT, UCONS, USUP = (u(21), u(22), u(23), u(24), u(25), u(26), u(27), u(28))
LIQ, SOL, SOLH, FSOL, MICRO = u(31), u(32), u(33), u(34), u(35)
VLIQ = u(41)
PK25, PK40, PKIN, PKNP, PKH, PKF = u(51), u(52), u(53), u(54), u(55), u(56)
PR25, PR40, PRH, PRF = u(61), u(62), u(63), u(64)
PLD, PLQ, PLX = u(71), u(72), u(73)


def su():
    return ["setpriv", "--reuid=1000", "--regid=1000", "--clear-groups"] if os.getuid() == 0 else []


def psql(sql, db="t", check=True):
    r = subprocess.run(su() + ["psql", "-X", "-q", "-t", "-A", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", db,
                               "-v", "ON_ERROR_STOP=1"], input=sql, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(r.stderr)
    return r


SEAM_PINS = ["public.get_partner_catalog_secure(uuid)", "public.get_partner_catalog_secure(uuid,boolean)",
             "public.get_partner_catalog_volumes_secure(uuid)", "public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text)",
             "public.solid_pack_offers_admin_v1(uuid)"]
LOCAL_FILES = {}


def localize(p):
    """Cópia local do arquivo com SOMENTE os pins das funções-costura trocados pelo md5 local (declarado).
    Pins dos corpos REAIS ficam com o md5 LIVE e precisam bater."""
    import importlib.util
    spec = importlib.util.spec_from_file_location("gen", HERE / "generate.py"); g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
    text = p.read_text()
    for sig in SEAM_PINS:
        live = g.PINS[sig]; loc = psql(f"SELECT md5(pg_get_functiondef('{sig}'::regprocedure))").stdout.strip()
        text = text.replace(f"'{sig}'::regprocedure)) <> '{live}'", f"'{sig}'::regprocedure)) <> '{loc}'")
    out = pathlib.Path(SOCK[0]) / ("local-" + p.name); out.write_text(text); out.chmod(0o644)
    return out


def runfile(p):
    if p.name != "04-rollback-deny.sql.review":
        p = localize(p)
    return subprocess.run(su() + ["psql", "-X", "-q", "-t", "-A", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t",
                                  "-v", "ON_ERROR_STOP=1", "-f", str(p)], capture_output=True, text=True)


def as_user(uid, sql, role="authenticated"):
    pre = f"SET ROLE {role};\n" + (f"SELECT set_config('request.jwt.claim.sub','{uid}',false) \\g /dev/null\n" if uid else "")
    return psql(pre + sql, check=False)


def j(r):
    if r.returncode != 0:
        return None
    return json.loads(r.stdout.strip().splitlines()[-1])


def cap(prefix):
    [p] = [x for x in CAP.iterdir() if x.name.startswith(prefix + ".")]
    b = p.read_bytes(); assert hashlib.md5(b).hexdigest()[:8] == p.name.split(".")[-3], p.name
    return b.decode().rstrip("\n") + ";\n"


SCHEMA = r"""
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role; GRANT USAGE ON SCHEMA platform_private TO authenticated, service_role;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor_comercial','financeiro','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor','consultor_tecnico','superadmin');
CREATE TYPE public.partner_order_status AS ENUM ('rascunho','pendente','solicitado','em_analise_comercial','aprovado','reprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado','cancelado','aguardando_aprovacao_credito','aguardando_ajuste_comercial','aguardando_itens','reprovado_sem_itens','aguardando_cotacao');
CREATE TABLE public.organizations(id uuid PRIMARY KEY, ativo boolean, status text, nome_fantasia text);
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean);
CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
CREATE TABLE public.superadmins(user_id uuid);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY, ativo boolean, deleted_at timestamptz, commercial_owner_organization_id uuid);
CREATE TABLE public.partner_users(user_id uuid, partner_id uuid);
CREATE TABLE public.produtos(id uuid PRIMARY KEY, nome text, codigo text, ativo boolean, b2b_enabled boolean, owner_organization_id uuid,
  valor_ha_brl numeric, dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric, oculto boolean DEFAULT false);
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY, nome text, codigo text, ativo boolean, b2b_enabled boolean, owner_organization_id uuid,
  dose_ml_ha numeric, valor_dose_brl numeric, valor_litro_brl numeric);
CREATE TABLE public.catalogo_volumes(id uuid PRIMARY KEY, item_tipo text, produto_id uuid, microrganismo_id uuid, volume_ml numeric, rotulo text,
  preco_brl numeric NOT NULL DEFAULT 0, ativo boolean NOT NULL, owner_organization_id uuid NOT NULL, medida text NOT NULL);
CREATE TABLE public.product_sale_units(product_id uuid PRIMARY KEY REFERENCES public.produtos(id), owner_organization_id uuid NOT NULL,
  unidade_conteudo text NOT NULL CHECK (unidade_conteudo = ANY (ARRAY['kg','g','ml','l'])), forma_fisica text, version integer NOT NULL DEFAULT 1);
CREATE TABLE public.product_packagings(id uuid PRIMARY KEY REFERENCES public.catalogo_volumes(id) ON DELETE RESTRICT, product_id uuid NOT NULL REFERENCES public.produtos(id),
  owner_organization_id uuid NOT NULL, codigo text NOT NULL CHECK (btrim(codigo) <> ''), descricao text, peso_liquido_kg numeric NOT NULL CHECK (peso_liquido_kg > 0),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1), ativo boolean NOT NULL DEFAULT true, valid_from timestamptz NOT NULL DEFAULT now(), valid_to timestamptz,
  created_by uuid, CONSTRAINT pp_codigo_version UNIQUE (product_id, codigo, version), CONSTRAINT pp_window CHECK (valid_to IS NULL OR valid_to >= valid_from));
CREATE TABLE public.catalogo_precos_embalagem(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), produto_id uuid NOT NULL REFERENCES public.produtos(id), owner_organization_id uuid NOT NULL,
  packaging_id uuid NOT NULL REFERENCES public.product_packagings(id), preco_brl numeric NOT NULL CHECK (preco_brl > 0), ativo boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT CURRENT_DATE, valid_until date, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cpe_window CHECK (valid_until IS NULL OR valid_until >= valid_from));
CREATE TABLE public.commercial_payment_plans(id uuid PRIMARY KEY, active boolean, pricing_mode text, discount_percent numeric, monthly_interest_percent numeric,
  months_count integer, interest_type text, installment_count integer, max_days integer, minimum_order_amount numeric, requires_financial_approval boolean,
  requires_guarantee boolean, requires_credit_approval boolean, name text, code text);
CREATE TABLE public.commercial_price_rules(id uuid PRIMARY KEY, active boolean, pricing_mode text, unit_type text, volume_ml numeric, product_id uuid, microrganismo_id uuid,
  valid_from date, valid_until date, buyer_scope text, partner_id uuid, customer_id uuid, plan_id uuid, min_quantity numeric, condition_price numeric, discount_percent numeric);
CREATE TABLE public.commercial_condition_item_prices(published_rule_id uuid);
CREATE TABLE public.commercial_payment_plan_assignments(status text, plan_id uuid, buyer_scope text, partner_id uuid, customer_id uuid, valid_from date, valid_until date);
CREATE TABLE public.partner_product_prices(partner_id uuid, ativo boolean, product_id uuid, microrganismo_id uuid, valid_from date, valid_until date, is_current boolean, preco_tabela numeric);
CREATE SEQUENCE public.po_num;
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), numero text DEFAULT 'PB-' || nextval('public.po_num'), partner_id uuid, cliente_id uuid,
  status public.partner_order_status, subtotal numeric, desconto_total numeric, total numeric, observacoes text, created_by uuid, requested_delivery_date date,
  ready_for_production boolean, payment_plan_id uuid, payment_condition_status text, credit_block_reason text, payment_terms_id uuid, table_amount numeric,
  commercial_discount_amount numeric, net_amount_after_discount numeric, financial_interest_amount numeric, final_amount_with_interest numeric,
  requires_financial_approval boolean, financial_approval_status text, internal_origin_snapshot jsonb);
CREATE TABLE public.partner_order_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES public.partner_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.produtos(id), quantidade numeric NOT NULL CHECK (quantidade > 0), preco_unitario numeric NOT NULL DEFAULT 0,
  desconto_percentual numeric NOT NULL DEFAULT 0, subtotal numeric NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), produto_nome_snapshot text,
  produto_codigo_snapshot text, preco_tabela_snapshot numeric, desconto_percentual_snapshot numeric, preco_unitario_final_snapshot numeric,
  unidade_medida text NOT NULL DEFAULT 'unidade', microrganismo_id uuid REFERENCES public.microrganismos(id), volume_ml numeric, pricing_mode_snapshot text,
  price_source_snapshot text, base_price_snapshot numeric, condition_price_snapshot numeric, plan_discount_percent_snapshot numeric, unit_type_snapshot text,
  volume_ml_snapshot numeric, price_rule_id_snapshot uuid,
  CONSTRAINT partner_order_items_unidade_check CHECK (unidade_medida = ANY (ARRAY['ml'::text, 'litro'::text, 'hectare'::text, 'dose'::text, 'unidade'::text])),
  CONSTRAINT poi_item_xor CHECK (((product_id IS NOT NULL) AND (microrganismo_id IS NULL)) OR ((product_id IS NULL) AND (microrganismo_id IS NOT NULL))));
CREATE TABLE public.partner_order_payment_terms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), partner_order_id uuid, payment_plan_id uuid, plan_name_snapshot text,
  plan_code_snapshot text, discount_percent_snapshot numeric, monthly_interest_percent_snapshot numeric, months_count_snapshot integer, installment_count integer,
  first_due_date date, interest_type_snapshot text, table_amount numeric, discount_amount numeric, net_amount_after_discount numeric, financial_interest_amount numeric,
  final_amount numeric, approval_status text, created_by uuid, pricing_mode_snapshot text, credit_decision_snapshot jsonb);
CREATE TABLE public.partner_order_payment_schedule(partner_order_id uuid, payment_terms_id uuid, installment_number integer, due_date date, amount numeric,
  principal_amount numeric, interest_amount numeric);
CREATE TABLE public.partner_order_audit_logs(order_id uuid, partner_id uuid, usuario_id uuid, acao text, dados_anteriores jsonb, dados_novos jsonb);
CREATE TABLE public.partner_order_idempotency(partner_id uuid, idempotency_key text, cart_hash text, order_id uuid, result_snapshot jsonb, created_by uuid,
  request_fingerprint text, UNIQUE (partner_id, idempotency_key));
CREATE TABLE public.notificacoes_operacionais(usuario_id uuid, tipo text, titulo text, mensagem text, link text);
CREATE TABLE platform_private.partner_order_attempt_journal(actor_id uuid, organization_id uuid, partner_id uuid, idempotency_key text, UNIQUE(actor_id, partner_id, idempotency_key));
CREATE TABLE platform_private.partner_order_idempotency_closures(partner_id uuid, idempotency_key text);
CREATE TABLE platform_private.authz_tickets(txid bigint, scope text, target uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.partner_order_items TO anon, authenticated;

-- ---------------- costuras sintéticas (declaradas) ----------------
CREATE FUNCTION public.has_role(uuid, public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id = r.user_id AND p.ativo WHERE r.user_id = $1 AND r.role = $2) $$;
CREATE FUNCTION public.get_user_partner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT min(partner_id::text)::uuid FROM public.partner_users WHERE user_id = auth.uid() $$;
CREATE FUNCTION public.is_platform_superadmin(uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.superadmins s WHERE s.user_id = $1) $$;
CREATE FUNCTION platform_private.b2b_actor_scope(p uuid) RETURNS TABLE(profile_ok boolean, partner_valid boolean, user_partner_count integer, user_partner uuid, org_partner uuid, has_catalog boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT pr.ativo, EXISTS(SELECT 1 FROM public.partner_accounts a WHERE a.id = min(pu.partner_id::text)::uuid AND a.ativo), count(pu.partner_id)::int,
           min(pu.partner_id::text)::uuid, min(pu.partner_id::text)::uuid, true
      FROM public.profiles pr LEFT JOIN public.partner_users pu ON pu.user_id = pr.user_id WHERE pr.user_id = p GROUP BY pr.ativo $$;
CREATE FUNCTION platform_private.b2b_internal_commercial_actor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = auth.uid() AND p.ativo) $$;
CREATE FUNCTION platform_private.c2_internal_order_target_reason(uuid, uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT CASE WHEN EXISTS (SELECT 1 FROM public.profiles p JOIN public.partner_accounts a ON a.commercial_owner_organization_id = p.organization_id
                             WHERE p.user_id = $1 AND p.ativo AND a.id = $2) THEN NULL ELSE 'foreign' END $$;
CREATE FUNCTION public._saas_user_has_feature(uuid, text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
CREATE FUNCTION platform_private.c2_order_actor_scope(p_uid uuid, p_partner uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_uid AND p.ativo) THEN RAISE EXCEPTION 'C2_SCOPE_INACTIVE' USING ERRCODE='42501'; END IF;
  IF public.has_role(p_uid,'administrador') OR public.has_role(p_uid,'gestor_comercial') THEN
    IF platform_private.c2_internal_order_target_reason(p_uid, p_partner) IS NOT NULL THEN RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF;
  END IF;
END $$;
CREATE FUNCTION platform_private.c2_owner_order_guard(uuid, uuid, uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION platform_private.c2_attempt_dispatch_guard(p_uid uuid, p_partner uuid, p_key text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS
 $$ INSERT INTO platform_private.partner_order_attempt_journal SELECT p_uid, p.organization_id, p_partner, p_key FROM public.profiles p WHERE p.user_id = p_uid ON CONFLICT DO NOTHING $$;
CREATE FUNCTION platform_private.c2_partner_order_attempt_authz(p_uid uuid, p_partner uuid) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM platform_private.c2_order_actor_scope(p_uid, p_partner); END $$;
CREATE FUNCTION platform_private.c2_owner_order_create_allowed(uuid, uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
CREATE FUNCTION platform_private.issue_ticket(text, uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION platform_private.c2_order_internal_recipients(uuid) RETURNS SETOF uuid LANGUAGE sql AS $$ SELECT NULL::uuid WHERE false $$;
CREATE FUNCTION platform_private.b2b_internal_assert_origin(jsonb, uuid, uuid) RETURNS void LANGUAGE sql AS $$ SELECT $$;
CREATE FUNCTION public.b2b_phase1_order_visible(p_order uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS (SELECT 1 FROM public.partner_orders o JOIN public.partner_accounts a ON a.id = o.partner_id
                   JOIN public.profiles p ON p.organization_id = a.commercial_owner_organization_id AND p.ativo WHERE o.id = p_order AND p.user_id = auth.uid()) $$;
CREATE FUNCTION public.fn_b2b_credit_exposure(uuid, numeric, uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT '{"credit_limit":0,"reason_code":"NO_LIMIT"}'::jsonb $$;
CREATE FUNCTION public.fn_b2b_apply_interest(numeric, text, numeric, integer) RETURNS numeric LANGUAGE sql AS $$ SELECT round($1, 2) $$;
CREATE FUNCTION public.fn_b2b_plan_selectable(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
CREATE FUNCTION public.fn_b2b_status_is_approved_or_later(public.partner_order_status) RETURNS boolean LANGUAGE sql AS
 $$ SELECT $1 IN ('aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue','faturado') $$;
CREATE FUNCTION public.fn_catalogo_preco_canonico(p_product uuid, p_micro uuid, p_unit text, p_vol numeric) RETURNS numeric LANGUAGE sql STABLE AS
 $$ SELECT max(v.preco_brl) FROM public.catalogo_volumes v WHERE v.ativo AND v.medida = 'volume' AND p_unit = 'unidade' AND v.volume_ml = p_vol
      AND v.produto_id IS NOT DISTINCT FROM p_product AND v.microrganismo_id IS NOT DISTINCT FROM p_micro $$;
"""

CATALOG_SEAM = r"""
CREATE FUNCTION public.get_partner_catalog_secure(p_partner_id uuid) RETURNS TABLE(item_id uuid, item_tipo text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_seller uuid;
BEGIN
  v_seller := platform_private.b2b_partner_catalog_reader(p_partner_id);   -- leitor REAL
  RETURN QUERY SELECT p.id, 'produto'::text FROM public.produtos p WHERE p.owner_organization_id = v_seller AND p.ativo AND COALESCE(p.b2b_enabled, true) AND NOT p.oculto
    UNION ALL SELECT m.id, 'microrganismo' FROM public.microrganismos m WHERE m.owner_organization_id = v_seller AND m.ativo AND m.b2b_enabled;
END $$;
REVOKE ALL ON FUNCTION public.get_partner_catalog_secure(uuid) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.get_partner_catalog_secure(uuid) TO authenticated;
CREATE FUNCTION public.get_partner_catalog_secure(p uuid, b boolean) RETURNS SETOF jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb WHERE false $$;
CREATE FUNCTION public.get_partner_catalog_volumes_secure(p uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION public.solid_pack_price_set_v1(uuid,bigint,date,uuid,text) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
CREATE FUNCTION public.solid_pack_offers_admin_v1(uuid) RETURNS jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb $$;
"""

REAL_TRIGGERS = r"""
CREATE CONSTRAINT TRIGGER pp_presentation_link AFTER INSERT OR UPDATE ON public.product_packagings DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION platform_private.solid_pack_presentation_link();
CREATE TRIGGER a000_partner_order_items_catalog_tenant_guard BEFORE INSERT OR UPDATE ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION platform_private.partner_order_items_catalog_tenant_guard();
CREATE TRIGGER trg_b2b_order_items_immutable BEFORE INSERT OR DELETE OR UPDATE ON public.partner_order_items FOR EACH ROW EXECUTE FUNCTION public.fn_b2b_guard_order_items_immutable();
"""

FIXTURES = f"""
INSERT INTO public.organizations VALUES ('{A}',true,'ativa','AR Bio'),('{F}',true,'ativa','Outro vendedor sintético');
INSERT INTO public.profiles VALUES ('{UB}','{A}',true),('{UT}','{A}',true),('{UB2}','{F}',true),('{UADM}','{A}',true),('{UADMF}','{F}',true),
  ('{UINACT}','{A}',false),('{UCONS}','{A}',true),('{USUP}','{A}',true);
INSERT INTO public.user_roles VALUES ('{UB}','parceiro_b2b'),('{UT}','parceiro_b2b_tecnico'),('{UB2}','parceiro_b2b'),('{UADM}','administrador'),
  ('{UADMF}','administrador'),('{UINACT}','parceiro_b2b'),('{UCONS}','consultor_tecnico'),('{USUP}','administrador');
INSERT INTO public.superadmins VALUES ('{USUP}');
INSERT INTO public.partner_accounts VALUES ('{P}',true,NULL,'{A}'),('{PO}',true,NULL,'{A}'),('{PF}',true,NULL,'{F}');
INSERT INTO public.partner_users VALUES ('{UB}','{P}'),('{UT}','{P}'),('{UB2}','{PF}'),('{UINACT}','{P}');
INSERT INTO public.produtos VALUES
 ('{LIQ}','Biológico líquido TESTE','LIQ-1',true,true,'{A}',NULL,NULL,NULL,NULL,false),
 ('{SOL}','Fertilizante sólido TESTE','SOL-1',true,true,'{A}',NULL,NULL,NULL,NULL,false),
 ('{SOLH}','Sólido oculto TESTE','SOL-H',true,true,'{A}',NULL,NULL,NULL,NULL,true),
 ('{FSOL}','Sólido de outro vendedor','FSOL-1',true,true,'{F}',NULL,NULL,NULL,NULL,false);
INSERT INTO public.microrganismos VALUES ('{MICRO}','Micro TESTE','MIC-1',true,true,'{A}',NULL,NULL,NULL);
INSERT INTO public.product_sale_units VALUES ('{SOL}','{A}','kg','solido',1),('{SOLH}','{A}','kg','solido',1),('{FSOL}','{F}','kg','solido',1);
INSERT INTO public.catalogo_volumes VALUES
 ('{VLIQ}','produto','{LIQ}',NULL,1000,'1 L',1,true,'{A}','volume'),
 ('{PK25}','produto','{SOL}',NULL,NULL,'Saco 25 kg',0.01,true,'{A}','embalagem'),
 ('{PK40}','produto','{SOL}',NULL,NULL,'Saco 40 kg',0.01,true,'{A}','embalagem'),
 ('{PKIN}','produto','{SOL}',NULL,NULL,'Saco antigo',0.01,false,'{A}','embalagem'),
 ('{PKNP}','produto','{SOL}',NULL,NULL,'Saco sem preço',0.01,true,'{A}','embalagem'),
 ('{PKH}','produto','{SOLH}',NULL,NULL,'Saco oculto',0.01,true,'{A}','embalagem'),
 ('{PKF}','produto','{FSOL}',NULL,NULL,'Saco F',0.01,true,'{F}','embalagem');
INSERT INTO public.product_packagings(id,product_id,owner_organization_id,codigo,descricao,peso_liquido_kg,version,ativo) VALUES
 ('{PK25}','{SOL}','{A}','SC25','Saco 25 kg',25,1,true),('{PK40}','{SOL}','{A}','SC40','Saco 40 kg',40,2,true),
 ('{PKIN}','{SOL}','{A}','SCOLD',NULL,10,1,false),('{PKNP}','{SOL}','{A}','SCNP',NULL,5,1,true),
 ('{PKH}','{SOLH}','{A}','SCH',NULL,25,1,true),('{PKF}','{FSOL}','{F}','SCF',NULL,25,1,true);
INSERT INTO public.catalogo_precos_embalagem(id,produto_id,owner_organization_id,packaging_id,preco_brl,valid_from) VALUES
 ('{PR25}','{SOL}','{A}','{PK25}',180.00,current_date - 1),('{PR40}','{SOL}','{A}','{PK40}',270.00,current_date - 1),
 ('{PRH}','{SOLH}','{A}','{PKH}',100,current_date - 1),('{PRF}','{FSOL}','{F}','{PKF}',90,current_date - 1);
INSERT INTO public.catalogo_precos_embalagem(produto_id,owner_organization_id,packaging_id,preco_brl,valid_from,ativo) VALUES ('{SOL}','{A}','{PKIN}',50,current_date - 1,true);
INSERT INTO public.commercial_payment_plans VALUES
 ('{PLD}',true,'discount_from_base',10,0,1,'simple',1,30,NULL,false,false,false,'Pix à vista TESTE','PIX'),
 ('{PLQ}',true,'quote_only',0,0,1,'simple',1,30,NULL,false,false,false,'Sob consulta TESTE','COT'),
 ('{PLX}',true,'fixed_item_price',0,0,1,'simple',1,30,NULL,false,false,false,'Preço fixo TESTE','FIX');
"""


def items(*ls):
    return json.dumps(list(ls))


def L(q=3):
    return {"item_id": LIQ, "item_tipo": "produto", "quantidade": q, "unidade_medida": "unidade", "volume_ml": 1000}


def S(pk=PK25, q=2, item=SOL, **extra):
    d = {"item_id": item, "item_tipo": "produto", "packaging_id": pk, "quantidade": q}; d.update(extra); return d


def sim(uid, plan, its):
    return as_user(uid, f"SELECT public.simulate_b2b_payment_plan_secure('{P}','{plan}','{its}'::jsonb)::text;")


def create(uid, plan, its, h, key, partner=P):
    return as_user(uid, f"SELECT public.create_partner_order_secure('{partner}',NULL,'{its}'::jsonb,NULL,'{plan}',NULL,NULL,'{h}','{key}')::text;")


def err(r):
    return (r.stderr or "").strip().splitlines()[0] if r.returncode != 0 else None


def main():
    if not shutil.which("initdb"):
        print("initdb ausente"); return 2
    tmp = pathlib.Path(tempfile.mkdtemp(prefix="b2bpack-", dir="/tmp")); tmp.chmod(0o777); SOCK[0] = str(tmp)
    subprocess.run(su() + ["initdb", "-D", str(tmp / "d"), "-U", "postgres", "-A", "trust"], check=True, capture_output=True)
    subprocess.run(su() + ["pg_ctl", "-D", str(tmp / "d"), "-o", f"-p {PORT} -k {tmp} -c listen_addresses=''", "-l", str(tmp / "log"), "-w", "start"],
                   check=True, capture_output=True)
    rep = {"kind": "disposable_pg", "hosted": False, "remote_writes": False, "package": "B2B_PARTNER_PACKAGING_ORDER_V1",
           "postgres": None, "real_bodies": sorted(p.name for p in CAP.iterdir() if p.is_file()),
           "synthetic_seams": ["auth.uid por GUC", "has_role/get_user_partner_id/is_platform_superadmin/b2b_actor_scope sobre tabelas mínimas",
                               "c2_* guards e journal mínimos", "crédito sem limite, juros 0, plano selecionável",
                               "get_partner_catalog_secure chama o leitor REAL", "fn_catalogo_preco_canonico mínimo",
                               "demais gatilhos de partner_orders omitidos", "exclusão GiST omitida"]}
    ok = True; checks = {}

    def chk(name, cond, detail=None):
        if not cond and os.environ.get("B2BPACK_DEBUG"): print("DEBUG", name, detail)
        nonlocal ok
        checks[name] = {"pass": bool(cond), **({"detail": detail} if detail is not None else {})}; ok &= bool(cond)
    try:
        psql("CREATE DATABASE t", db="postgres")
        rep["postgres"] = psql("SHOW server_version").stdout.strip()
        psql(SCHEMA)
        if REAL:
            psql(RT.real_tables_sql())
        for name in ("public.fn_resolve_commercial_price", "public.recorte_a_legacy_solid", "platform_private.b2b_partner_catalog_reader",
                     "platform_private.solid_pack_presentation_link", "platform_private.partner_order_items_catalog_tenant_guard",
                     "public.fn_b2b_guard_order_items_immutable", "public.fn_resolve_b2b_cart", "public.fn_b2b_cart_hash",
                     "public.create_partner_order_secure", "public.simulate_b2b_payment_plan_secure", "public.respond_b2b_order_quote_secure"):
            psql(cap(name))
        psql(CATALOG_SEAM + REAL_TRIGGERS)
        if REAL:
            psql(RT.real_triggers_sql())
            rep["synthetic_seams"] = [x for x in rep["synthetic_seams"] if x not in ("demais gatilhos de partner_orders omitidos", "exclusão GiST omitida")] + RT.SEAMS_DECLARED
            rep["real_triggers"] = sorted(p.name for p in (CAP / "triggers").rglob("*.sql"))
        # ACL igual à LIVE para as funções substituídas/pinadas
        psql("""REVOKE ALL ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text), public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date),
                 public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text), public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date), public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric),
                 public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric), public.recorte_a_legacy_solid(uuid),
                 platform_private.b2b_partner_catalog_reader(uuid) FROM PUBLIC;
                GRANT EXECUTE ON FUNCTION public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text) TO service_role, authenticated;
                GRANT EXECUTE ON FUNCTION public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date), public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text) TO authenticated, service_role;
                GRANT EXECUTE ON FUNCTION public.fn_resolve_b2b_cart(uuid,uuid,jsonb,date), public.fn_b2b_cart_hash(uuid,uuid,jsonb,numeric) TO service_role;""")
        psql(FIXTURES)
        if REAL:
            psql(RT.fixtures_sql([UB, UT, UB2, UADM, UADMF, UINACT, UCONS, USUP]))

        # ---------- ANTES: linha líquida de referência e sólido bloqueado pelo legado
        before_liq = j(sim(UB, PLD, items(L())))
        chk("before.liquid_simulates", before_liq is not None and float(before_liq["final_amount"]) == 2.70, before_liq and before_liq["final_amount"])
        r = sim(UB, PLD, items(S()))
        chk("before.solid_packaging_unsupported", r.returncode != 0 or (j(r) and j(r)["items"][0].get("packaging_id") is None), err(r))
        r = sim(UB, PLD, items({"item_id": SOL, "item_tipo": "produto", "quantidade": 2, "unidade_medida": "unidade", "volume_ml": 25000}))
        chk("before.solid_legacy_blocked", "A_SOLID_PACKAGING_FLOW_REQUIRED" in (err(r) or ""), err(r))

        x = runfile(HERE / "01-pre.sql.readonly"); chk("pre.ok", x.returncode == 0 and "PRE_OK" in x.stdout, x.stderr.strip()[:300])
        x = runfile(HERE / "02-install.sql.review"); chk("install.ok", x.returncode == 0, x.stderr.strip()[:500])
        x = runfile(HERE / "03-post.sql.readonly"); chk("post.ok", x.returncode == 0 and "POST_OK" in x.stdout, x.stderr.strip()[:300])
        x = runfile(HERE / "02-install.sql.review"); chk("install.rerun_refused", x.returncode != 0 and "PRE_DRIFT" in x.stderr, x.stderr.strip()[:200])

        # ---------- leitor
        rd = j(as_user(UB, f"SELECT public.get_partner_packaging_offers_secure('{P}')::text;"))
        ids = sorted(o["packaging_id"] for o in (rd or {}).get("offers", []))
        chk("reader.buyer_exact_offers", rd and rd["contract"] == "B2B_PARTNER_PACKAGING_ORDER_V1" and ids == sorted([PK25, PK40]), ids)
        chk("reader.offer_fields", rd and all(set(o) == {"product_id", "unidade_conteudo", "packaging_id", "codigo", "descricao", "rotulo", "peso_liquido_kg",
                                                          "version", "preco_tabela_brl"} for o in rd["offers"]))
        for who, name in ((UT, "tech"), (UB2, "other_partner_buyer"), (UINACT, "inactive_profile"), (UADMF, "other_tenant_admin"), (UCONS, "consultant"), (USUP, "superadmin")):
            r = as_user(who, f"SELECT public.get_partner_packaging_offers_secure('{P}')::text;")
            chk(f"reader.denied.{name}", r.returncode != 0, err(r))
        r = as_user(None, f"SELECT public.get_partner_packaging_offers_secure('{P}')::text;", role="anon")
        chk("reader.denied.anon_acl", r.returncode != 0 and "permission denied" in r.stderr, err(r))
        r = as_user(UADM, f"SELECT public.get_partner_packaging_offers_secure('{P}')::text;")
        chk("reader.internal_seller_admin", r.returncode == 0, err(r))
        for fn in ("platform_private.b2b_packaging_line('%s','%s','{}'::jsonb,current_date)" % (P, PLD), "platform_private.b2b_packaging_lock('[]'::jsonb)"):
            r = as_user(UB, f"SELECT {fn};"); chk(f"acl.private_denied.{fn.split('(')[0]}", r.returncode != 0 and "permission denied" in r.stderr, err(r))

        # ---------- simulação: líquido sem regressão, sólido, misto
        after_liq = j(sim(UB, PLD, items(L())))
        chk("liquid.no_regression_hash_amount", after_liq and after_liq["cart_hash"] == before_liq["cart_hash"] and after_liq["final_amount"] == before_liq["final_amount"])
        s1 = j(sim(UB, PLD, items(S())))
        line = s1 and s1["items"][0]
        chk("solid.simulate_server_price", s1 and float(s1["table_amount"]) == 360 and float(s1["final_amount"]) == 324 and float(line["final_unit_price"]) == 162
            and line["packaging_id"] == PK25 and line["unidade_conteudo"] == "kg" and float(line["peso_liquido_kg"]) == 25 and line["volume_ml"] is None,
            s1 and {k: s1[k] for k in ("table_amount", "final_amount")})
        mx = j(sim(UB, PLD, items(L(), S(PK40, 1))))
        chk("mixed.simulate", mx and float(mx["table_amount"]) == 273 and float(mx["final_amount"]) == round(2.70 + 243, 2), mx and mx["final_amount"])

        # ---------- negativas de payload
        neg = {
            "client_price": S(preco_unitario=0.01), "client_total": S(subtotal=1), "volume_mixed": S(volume_ml=25000), "unidade_mixed": S(unidade_medida="litro"),
            "qty_fraction": S(q=1.5), "qty_zero": S(q=0), "qty_negative": S(q=-1), "qty_string": S(q="2"), "unknown_key": S(foo=1),
            "foreign_packaging": S(PKF), "foreign_product": S(PKF, item=FSOL), "inactive_packaging": S(PKIN), "unpriced": S(PKNP),
            "unpublished_product": S(PKH, item=SOLH), "packaging_other_product": S(PK25, item=LIQ),
            "micro_packaging": {"item_id": MICRO, "item_tipo": "microrganismo", "packaging_id": PK25, "quantidade": 1},
            "bad_uuid": S("not-a-uuid"),
        }
        expect = {"client_price": "CLIENT_PRICE_FORBIDDEN", "client_total": "CLIENT_PRICE_FORBIDDEN", "volume_mixed": "VOLUME_MIXED", "unidade_mixed": "VOLUME_MIXED",
                  "qty_fraction": "QTY_NOT_INTEGER", "qty_zero": "QTY_NOT_INTEGER", "qty_negative": "QTY_NOT_INTEGER", "qty_string": "QTY_NOT_INTEGER",
                  "unknown_key": "LINE_INVALID", "foreign_packaging": "B2B_PACKAGING_FOREIGN", "foreign_product": "product_unavailable",
                  "inactive_packaging": "B2B_PACKAGING_INACTIVE", "unpriced": "B2B_PACKAGING_UNPRICED", "unpublished_product": "B2B_PACKAGING_NOT_PUBLISHED",
                  "packaging_other_product": "B2B_PACKAGING_FOREIGN", "micro_packaging": "PRODUCT_ONLY", "bad_uuid": "LINE_INVALID"}
        for k, it in neg.items():
            r = sim(UB, PLD, items(it)); chk(f"neg.{k}", expect[k] in (err(r) or ""), err(r))
        r = sim(UB, PLD, items(S(), S(q=1))); chk("neg.duplicate_packaging_line", "DUPLICATE_LINE" in (err(r) or ""), err(r))
        r = sim(UB, PLX, items(S())); chk("neg.fixed_price_mode_unsupported", "PRICING_MODE_UNSUPPORTED" in (err(r) or ""), err(r))

        # ---------- criação, snapshot, replay e conflitos
        h = s1["cart_hash"]
        r1 = create(UB, PLD, items(S()), h, "TESTE-PED-20261106-K1"); c1 = j(r1)
        chk("create.solid_ok", c1 and float(c1["total"]) == 324 and c1["status"] == "em_analise_comercial", c1 or err(r1))
        row = psql(f"""SELECT row_to_json(i)::text FROM (SELECT quantidade, preco_unitario, subtotal, unidade_medida, volume_ml, packaging_id_snapshot,
                 packaging_codigo_snapshot, packaging_version_snapshot, packaging_peso_liquido_kg_snapshot, packaging_unidade_conteudo_snapshot,
                 packaging_price_id_snapshot, price_source_snapshot, base_price_snapshot FROM public.partner_order_items WHERE order_id = '{c1['id']}') i""").stdout.strip()
        rj = json.loads(row) if row else {}
        chk("create.snapshot_exact", rj.get("packaging_id_snapshot") == PK25 and rj.get("packaging_codigo_snapshot") == "SC25" and rj.get("packaging_version_snapshot") == 1
            and float(rj.get("packaging_peso_liquido_kg_snapshot", 0)) == 25 and rj.get("packaging_unidade_conteudo_snapshot") == "kg"
            and rj.get("packaging_price_id_snapshot") == PR25 and float(rj["quantidade"]) == 2 and float(rj["preco_unitario"]) == 162
            and rj["volume_ml"] is None and rj["unidade_medida"] == "unidade" and rj["price_source_snapshot"] == "packaging_price", rj)
        rp = j(create(UB, PLD, items(S()), h, "TESTE-PED-20261106-K1"))
        chk("replay.same_key_same_order", rp and rp["id"] == c1["id"])
        h40 = j(sim(UB, PLD, items(S(PK40))))["cart_hash"]
        r = create(UB, PLD, items(S(PK40)), h40, "TESTE-PED-20261106-K1"); chk("replay.other_packaging_conflict", "idempotency_conflict" in (err(r) or ""), err(r))
        r = create(UB, PLD, items(S(q=3)), h, "TESTE-PED-20261106-K1"); chk("replay.other_qty_conflict", "idempotency_conflict" in (err(r) or ""), err(r))
        r = create(UB, PLD, items(S()), "0" * 64, "TESTE-PED-20261106-K2"); chk("create.tampered_hash", "price_changed" in (err(r) or ""), err(r))
        r = create(UB, PLD, items(S(preco_unitario=1)), h, "TESTE-PED-20261106-K3"); chk("create.client_price", "CLIENT_PRICE_FORBIDDEN" in (err(r) or ""), err(r))
        r = create(UT, PLD, items(S()), h, "TESTE-PED-20261106-K4"); chk("create.tech_denied", r.returncode != 0, err(r))
        r = create(UB2, PLD, items(S()), h, "TESTE-PED-20261106-K5"); chk("create.other_partner_denied", "forbidden_partner" in (err(r) or ""), err(r))
        r = create(UINACT, PLD, items(S()), h, "TESTE-PED-20261106-K6"); chk("create.inactive_denied", r.returncode != 0, err(r))
        r = create(UADMF, PLD, items(S()), h, "TESTE-PED-20261106-K7"); chk("create.other_tenant_admin_denied", "forbidden_partner" in (err(r) or ""), err(r))
        r = as_user(None, f"SELECT public.create_partner_order_secure('{P}',NULL,'{items(S())}'::jsonb,NULL,'{PLD}',NULL,NULL,'{h}','K8');", role="anon")
        chk("create.anon_acl", r.returncode != 0 and "permission denied" in r.stderr, err(r))
        mh = mx["cart_hash"]
        cm = j(create(UB, PLD, items(L(), S(PK40, 1)), mh, "TESTE-PED-20261106-MIX"))
        cnt = psql(f"SELECT count(*) FILTER (WHERE packaging_id_snapshot IS NULL AND volume_ml = 1000)||'/'||count(*) FILTER (WHERE packaging_id_snapshot = '{PK40}') FROM public.partner_order_items WHERE order_id = '{(cm or {}).get('id', A)}'").stdout.strip()
        chk("create.mixed_lines", cm and float(cm["total"]) == 245.70 and cnt == "1/1", (cm and cm["total"], cnt))
        hl = after_liq["cart_hash"]
        cl = j(create(UB, PLD, items(L()), hl, "TESTE-PED-20261106-LIQ"))
        chk("create.liquid_no_regression", cl and float(cl["total"]) == 2.70)

        # ---------- preço alterado depois da simulação
        hs = j(sim(UB, PLD, items(S(q=1))))["cart_hash"]
        psql(f"UPDATE public.catalogo_precos_embalagem SET preco_brl = 200 WHERE id = '{PR25}'")
        r = create(UB, PLD, items(S(q=1)), hs, "TESTE-PED-20261106-PCH"); chk("price_changed_after_simulation", "price_changed" in (err(r) or ""), err(r))
        psql(f"UPDATE public.catalogo_precos_embalagem SET preco_brl = 180 WHERE id = '{PR25}'")

        # ---------- cotação: snapshot de embalagem preservado
        qs = j(sim(UB, PLQ, items(S())))
        cq = j(create(UB, PLQ, items(S()), qs["cart_hash"], "TESTE-PED-20261106-COT"))
        chk("quote.created_waiting", cq and cq["status"] == "aguardando_cotacao")
        it_id = psql(f"SELECT id FROM public.partner_order_items WHERE order_id = '{cq['id']}'").stdout.strip()
        r = as_user(UADM, f"""SELECT public.respond_b2b_order_quote_secure('{cq['id']}','[{{"item_id":"{it_id}","unit_price":170}}]'::jsonb)::text;""")
        qrow = psql(f"SELECT subtotal||'|'||packaging_id_snapshot||'|'||packaging_price_id_snapshot FROM public.partner_order_items WHERE id = '{it_id}'").stdout.strip()
        chk("quote.respond_keeps_packaging_snapshot", r.returncode == 0 and qrow == f"340.00|{PK25}|{PR25}", (err(r), qrow))
        r = as_user(UADMF, f"""SELECT public.respond_b2b_order_quote_secure('{cq['id']}','[{{"item_id":"{it_id}","unit_price":1}}]'::jsonb);""")
        chk("quote.other_tenant_denied", r.returncode != 0, err(r))

        # ---------- imutabilidade e forja de snapshot (até postgres)
        for nm, sql in (("change_packaging", f"UPDATE public.partner_order_items SET packaging_id_snapshot = '{PK40}' WHERE order_id = '{c1['id']}'"),
                        ("change_qty", f"UPDATE public.partner_order_items SET quantidade = 5 WHERE order_id = '{c1['id']}'"),
                        ("legacy_gains_packaging", f"UPDATE public.partner_order_items SET packaging_id_snapshot = '{PK25}' WHERE order_id = '{cl['id']}'")):
            r = psql(sql, check=False); chk(f"immutable.{nm}", r.returncode != 0 and ("IMMUTABLE" in r.stderr or "poi_packaging_snapshot_shape" in r.stderr), err(r))
        r = psql(f"""INSERT INTO public.partner_order_items(order_id,product_id,quantidade,unidade_medida,packaging_id_snapshot,packaging_codigo_snapshot,packaging_version_snapshot,
                 packaging_peso_liquido_kg_snapshot,packaging_unidade_conteudo_snapshot,packaging_price_id_snapshot) VALUES ('{cl['id']}','{SOL}',1,'unidade','{PK25}','SC25',1,99,'kg','{PR25}')""", check=False)
        chk("snapshot.forged_weight_rejected", r.returncode != 0 and "SNAPSHOT_MISMATCH" in r.stderr, err(r))
        r = psql(f"""INSERT INTO public.partner_order_items(order_id,product_id,quantidade,unidade_medida,packaging_id_snapshot,packaging_codigo_snapshot,packaging_version_snapshot,
                 packaging_peso_liquido_kg_snapshot,packaging_unidade_conteudo_snapshot,packaging_price_id_snapshot) VALUES ('{cl['id']}','{SOL}',1.5,'unidade','{PK25}','SC25',1,25,'kg','{PR25}')""", check=False)
        chk("snapshot.fraction_rejected", r.returncode != 0 and "poi_packaging_snapshot_shape" in r.stderr, err(r))

        # ---------- concorrência: arquivar/trocar preço espera o pedido; chaves iguais em paralelo => 1 pedido
        hc = j(sim(UB, PLD, items(S(PK40, 1))))["cart_hash"]
        holder = subprocess.Popen(su() + ["psql", "-X", "-q", "-t", "-A", "-h", SOCK[0], "-p", PORT, "-U", "postgres", "-d", "t", "-v", "ON_ERROR_STOP=1"],
                                  stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        holder_sql = (f"BEGIN; SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','{UB}',false);\n"
                      f"SELECT (public.create_partner_order_secure('{P}',NULL,'{items(S(PK40, 1))}'::jsonb,NULL,'{PLD}',NULL,NULL,'{hc}','TESTE-PED-20261106-CC'))->>'id';\n"
                      "SELECT pg_sleep(3); COMMIT;\n")
        th = threading.Thread(target=lambda: holder.communicate(holder_sql)); th.start(); time.sleep(1.2)
        r1 = psql(f"SET lock_timeout='400ms'; UPDATE public.catalogo_precos_embalagem SET valid_until = current_date WHERE id = '{PR40}'", check=False)
        r2 = psql(f"SET lock_timeout='400ms'; UPDATE public.product_packagings SET descricao = 'x' WHERE id = '{PK40}'", check=False)
        r3 = j(create(UB, PLD, items(S(PK40, 1)), hc, "TESTE-PED-20261106-CC"))   # mesma chave em paralelo: espera e devolve replay
        th.join()
        n_cc = psql("SELECT count(*) FROM public.partner_order_idempotency WHERE idempotency_key = 'TESTE-PED-20261106-CC'").stdout.strip()
        chk("concurrency.price_row_locked", r1.returncode != 0 and "lock timeout" in r1.stderr, err(r1))
        chk("concurrency.packaging_row_locked", r2.returncode != 0 and "lock timeout" in r2.stderr, err(r2))
        chk("concurrency.same_key_single_order", r3 is not None and n_cc == "1", (r3, n_cc))
        psql(f"BEGIN; UPDATE public.product_packagings SET ativo = false WHERE id = '{PK40}'; UPDATE public.catalogo_volumes SET ativo = false WHERE id = '{PK40}'; COMMIT;")
        r = create(UB, PLD, items(S(PK40, 1)), hc, "TESTE-PED-20261106-ARQ"); chk("archived_after_simulation_rejected", "B2B_PACKAGING_INACTIVE" in (err(r) or ""), err(r))

        # ---------- rollback deny-only
        hist_before = psql("SELECT count(*) FROM public.partner_order_items WHERE packaging_id_snapshot IS NOT NULL").stdout.strip()
        x = runfile(HERE / "04-rollback-deny.sql.review"); chk("rollback.ok", x.returncode == 0, x.stderr.strip()[:300])
        r = as_user(UB, f"SELECT public.get_partner_packaging_offers_secure('{P}');"); chk("rollback.reader_closed", r.returncode != 0, err(r))
        r = sim(UB, PLD, items(S())); chk("rollback.packaging_line_closed", "B2B_PACKAGING_ORDER_CLOSED" in (err(r) or ""), err(r))
        rl = j(sim(UB, PLD, items(L()))); chk("rollback.liquid_still_works", rl and rl["cart_hash"] == before_liq["cart_hash"])
        hist_after = psql("SELECT count(*) FROM public.partner_order_items WHERE packaging_id_snapshot IS NOT NULL").stdout.strip()
        chk("rollback.history_preserved", hist_before == hist_after and int(hist_after) >= 3, (hist_before, hist_after))
        r = psql(f"UPDATE public.partner_order_items SET packaging_id_snapshot = NULL WHERE order_id = '{c1['id']}'", check=False)
        chk("rollback.snapshot_still_immutable", r.returncode != 0, err(r))
    except Exception:
        for k, v in checks.items():
            if not v['pass']: print('FAIL', k, v.get('detail'))
        raise
    finally:
        subprocess.run(su() + ["pg_ctl", "-D", str(tmp / "d"), "-m", "fast", "stop"], capture_output=True)
        shutil.rmtree(tmp, ignore_errors=True)
    rep["checks"] = checks; rep["result"] = "PASS" if ok else "FAIL"
    rep["passed"] = sum(1 for c in checks.values() if c["pass"]); rep["total"] = len(checks)
    (HERE / ("evidence-local-pg-real-triggers.json" if REAL else "evidence-local-pg.json")).write_text(json.dumps(rep, indent=2, ensure_ascii=False) + "\n")
    for k, v in checks.items():
        if not v["pass"]:
            print("FAIL", k, v.get("detail"))
    print(rep["result"], f"{rep['passed']}/{rep['total']}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
