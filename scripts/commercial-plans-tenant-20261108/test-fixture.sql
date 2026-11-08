SET check_function_bodies=off;
CREATE ROLE authenticated;
CREATE ROLE anon;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE SCHEMA platform_private;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TYPE public.app_role AS ENUM('administrador','financeiro','gestor_comercial','gestor','administrativo','parceiro_b2b','parceiro_b2b_tecnico','cliente_produtor','superadmin');
CREATE TYPE public.partner_order_status AS ENUM('rascunho','pendente','solicitado','em_analise_comercial','aprovado','reprovado','aguardando_aprovacao_credito','aguardando_ajuste_comercial','cancelado');
CREATE TABLE public.organizations(id uuid PRIMARY KEY,partner_account_id uuid,ativo boolean NOT NULL DEFAULT true,status text NOT NULL DEFAULT 'ativa');
CREATE TABLE public.profiles(user_id uuid PRIMARY KEY,organization_id uuid,ativo boolean NOT NULL DEFAULT true,senha_provisoria boolean NOT NULL DEFAULT false);
CREATE TABLE public.user_roles(user_id uuid NOT NULL,role public.app_role NOT NULL);
CREATE TABLE public.partner_accounts(id uuid PRIMARY KEY,commercial_owner_organization_id uuid,ativo boolean NOT NULL DEFAULT true,deleted_at timestamptz,client_id uuid);
CREATE TABLE public.clientes(id uuid PRIMARY KEY,organization_id uuid,status_cliente text NOT NULL DEFAULT 'ativo');
CREATE TABLE public.partner_users(id uuid DEFAULT gen_random_uuid() PRIMARY KEY,partner_id uuid NOT NULL,user_id uuid NOT NULL,created_at timestamptz DEFAULT now(),papel text,valid_from timestamptz,revoked_at timestamptz,revoked_by uuid,revoke_reason text,tenant_id uuid,version integer DEFAULT 1);
CREATE TABLE public.commercial_payment_plans(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,code text NOT NULL UNIQUE,description text,plan_type text NOT NULL,
 max_days integer NOT NULL,months_count numeric NOT NULL,installment_count integer NOT NULL,discount_percent numeric NOT NULL,
 monthly_interest_percent numeric NOT NULL,interest_type text NOT NULL,requires_credit_approval boolean NOT NULL,
 requires_guarantee boolean NOT NULL,requires_financial_approval boolean NOT NULL,minimum_order_amount numeric,
 active boolean NOT NULL,sort_order integer NOT NULL,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 pricing_mode text NOT NULL,version integer NOT NULL,root_plan_id uuid,superseded_by_id uuid,valid_from timestamptz NOT NULL,
 valid_until timestamptz,is_default boolean NOT NULL DEFAULT false,version_reason text,updated_by uuid
);
CREATE UNIQUE INDEX uq_cpp_single_default ON public.commercial_payment_plans((true)) WHERE is_default;
CREATE TABLE public.commercial_payment_plan_assignments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),plan_id uuid NOT NULL,buyer_scope text NOT NULL,partner_id uuid,customer_id uuid,
 status text NOT NULL DEFAULT 'draft',valid_from date NOT NULL DEFAULT CURRENT_DATE,valid_until date,motivo text,submitted_by uuid,submitted_at timestamptz,
 published_by uuid,published_at timestamptz,archived_by uuid,archived_at timestamptz,created_by uuid,updated_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.commercial_condition_item_prices(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),assignment_id uuid,plan_id uuid NOT NULL,buyer_scope text NOT NULL,partner_id uuid,customer_id uuid,
 product_id uuid,microrganismo_id uuid,unit_type text NOT NULL,volume_ml numeric,min_quantity numeric NOT NULL DEFAULT 0,pricing_mode text NOT NULL,
 condition_price numeric,discount_percent numeric,currency text NOT NULL DEFAULT 'BRL',valid_from date NOT NULL DEFAULT CURRENT_DATE,valid_until date,
 status text NOT NULL DEFAULT 'draft',motivo text,is_exception boolean NOT NULL DEFAULT false,published_rule_id uuid,published_by uuid,published_at timestamptz,
 created_by uuid,updated_by uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.commercial_price_rules(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),buyer_scope text NOT NULL,partner_id uuid,customer_id uuid,plan_id uuid,product_id uuid,microrganismo_id uuid,
 unit_type text NOT NULL,volume_ml numeric,pricing_mode text NOT NULL,condition_price numeric,currency text NOT NULL DEFAULT 'BRL',valid_from date NOT NULL DEFAULT CURRENT_DATE,
 valid_until date,active boolean NOT NULL DEFAULT true,motivo text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),created_by uuid,updated_by uuid,
 discount_percent numeric,min_quantity numeric NOT NULL DEFAULT 0
);
CREATE TABLE public.payment_methods(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.financial_categories(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,type text NOT NULL,active boolean NOT NULL DEFAULT true);
CREATE TABLE public.produtos(id uuid PRIMARY KEY,nome text NOT NULL,ativo boolean NOT NULL DEFAULT true);
CREATE TABLE public.microrganismos(id uuid PRIMARY KEY,nome text NOT NULL,ativo boolean NOT NULL DEFAULT true);
CREATE TABLE public.partner_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_plan_id uuid);
CREATE TABLE public.partner_order_payment_terms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),payment_plan_id uuid);
CREATE TABLE public.commercial_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),usuario_id uuid,partner_id uuid,order_id uuid,acao text NOT NULL,dados_anteriores jsonb,dados_novos jsonb,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.commercial_condition_audit_log(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entity text NOT NULL,entity_id uuid,action text NOT NULL,actor_id uuid,before_data jsonb,after_data jsonb,motivo text,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_private.b2b_condition_versions(
 organization_id uuid NOT NULL,plan_id uuid NOT NULL,version integer NOT NULL,method text NOT NULL,deadline_days integer NOT NULL,installment_count integer NOT NULL,
 monthly_rate numeric NOT NULL,approved_by uuid NOT NULL,approved_at timestamptz NOT NULL,configuration_approved boolean NOT NULL,calendar_version text,
 category_id uuid NOT NULL,payment_method_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,plan_id,version,method)
);
CREATE TABLE platform_private.b2b_condition_assignments(organization_id uuid NOT NULL,partner_id uuid NOT NULL,plan_id uuid NOT NULL,version integer NOT NULL,method text NOT NULL,assigned_by uuid,assigned_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,partner_id,plan_id,version,method));
CREATE TABLE platform_private.b2b_condition_assignment_revocations(organization_id uuid NOT NULL,partner_id uuid NOT NULL,plan_id uuid NOT NULL,version integer NOT NULL,method text NOT NULL,revoked_by uuid NOT NULL,revoked_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,partner_id,plan_id,version,method));
CREATE TABLE platform_private.b2b_condition_retirements(organization_id uuid NOT NULL,plan_id uuid NOT NULL,version integer NOT NULL,method text NOT NULL,retired_by uuid,retired_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(organization_id,plan_id,version,method));
CREATE TABLE platform_private.b2b_condition_activation(organization_id uuid PRIMARY KEY,mode text NOT NULL,pilot_partner_ids uuid[] NOT NULL DEFAULT '{}',version integer NOT NULL,updated_by uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE platform_private.b2b_order_condition_snapshots(order_id uuid PRIMARY KEY);

CREATE FUNCTION public.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
CREATE FUNCTION platform_private.has_role(u uuid,r public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.has_role(u,r) $$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id WHERE p.user_id=auth.uid() AND p.ativo IS TRUE AND o.ativo IS TRUE AND o.status='ativa' $$;
CREATE FUNCTION public.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT platform_private.h15_actor_organization() $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=u AND p.ativo IS TRUE AND p.senha_provisoria IS FALSE) $$;
CREATE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.has_role(u,'superadmin'::public.app_role) $$;
CREATE FUNCTION public.get_user_partner_id() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id=auth.uid() AND pu.revoked_at IS NULL ORDER BY pu.created_at DESC LIMIT 1 $$;
CREATE FUNCTION public.fn_cc_can_prepare(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro','gestor_comercial']::public.app_role[]) IS NOT NULL $$;
CREATE FUNCTION public.fn_cc_can_publish(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT public.fn_cc_can_prepare(u) $$;
CREATE FUNCTION public._saas_user_has_feature(u uuid,f text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT true $$;
CREATE FUNCTION public.fn_cc_validate_item_input(p uuid,m text,c numeric,d numeric) RETURNS void LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.fn_cc_audit(e text,i uuid,a text,b jsonb,n jsonb,m text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN INSERT INTO public.commercial_condition_audit_log(entity,entity_id,action,actor_id,before_data,after_data,motivo) VALUES(e,i,a,auth.uid(),b,n,m); END $$;
CREATE FUNCTION public.fn_resolve_commercial_price(text,uuid,uuid,uuid,uuid,uuid,text,numeric,date,numeric) RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;
CREATE FUNCTION platform_private.c2_order_actor_scope(u uuid,p uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE user_id=u AND ativo IS TRUE) THEN RAISE EXCEPTION 'C2_SCOPE'; END IF; END $$;
CREATE FUNCTION platform_private.c2_owner_order_guard(u uuid,p uuid,pl uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.partner_users pu WHERE pu.user_id=u AND pu.partner_id=p AND pu.revoked_at IS NULL) AND NOT public.has_role(u,'administrador'::public.app_role) THEN RAISE EXCEPTION 'C2_GUARD'; END IF; END $$;
CREATE FUNCTION platform_private.b2b_partner_catalog_reader(p uuid) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$ DECLARE o uuid; BEGIN SELECT pa.commercial_owner_organization_id INTO o FROM public.partner_accounts pa JOIN public.partner_users pu ON pu.partner_id=pa.id AND pu.tenant_id=pa.commercial_owner_organization_id WHERE pa.id=p AND pu.user_id=auth.uid() AND pu.revoked_at IS NULL AND pa.ativo IS TRUE AND public.has_role(auth.uid(),'parceiro_b2b'::public.app_role) IS TRUE; IF o IS NULL THEN RAISE EXCEPTION 'forbidden_partner' USING ERRCODE='42501'; END IF; RETURN o; END $$;

ALTER TABLE public.commercial_payment_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_payment_plan_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_condition_item_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_price_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.commercial_payment_plans,public.commercial_payment_plan_assignments,public.commercial_condition_item_prices,public.commercial_price_rules TO authenticated;
GRANT USAGE ON SCHEMA auth,platform_private TO authenticated,anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform_private TO authenticated;
