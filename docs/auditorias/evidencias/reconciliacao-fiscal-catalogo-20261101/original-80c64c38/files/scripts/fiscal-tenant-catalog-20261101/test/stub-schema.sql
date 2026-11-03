-- Esquema REDUZIDO e Auth SINTÉTICA para PostgreSQL descartável. Não é prova hosted.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth; CREATE SCHEMA platform_private;
GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.uid',true),'')::uuid $$;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, anon;
CREATE TYPE public.app_role AS ENUM ('administrador','gestor','financeiro','tecnico_agronomo','superadmin');
CREATE TABLE public.organizations (id uuid PRIMARY KEY, ativo boolean NOT NULL DEFAULT true, status text NOT NULL DEFAULT 'ativa');
CREATE TABLE public.profiles (user_id uuid PRIMARY KEY, organization_id uuid, ativo boolean NOT NULL DEFAULT true, senha_provisoria boolean NOT NULL DEFAULT false);
CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
CREATE TABLE platform_private.test_gate (enabled boolean);
INSERT INTO platform_private.test_gate VALUES (true);
CREATE FUNCTION public.is_platform_superadmin(u uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role='superadmin') $$;
CREATE FUNCTION platform_private.platform_actor_access_ready(p_user uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.user_id=p_user AND p.ativo AND NOT p.senha_provisoria) $$;
CREATE FUNCTION platform_private.has_role(_user_id uuid, _role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT EXISTS(SELECT 1 FROM public.user_roles r JOIN public.profiles p ON p.user_id=r.user_id WHERE r.user_id=_user_id AND r.role=_role AND p.ativo AND platform_private.platform_actor_access_ready(p.user_id)) $$;
CREATE FUNCTION platform_private.h15_actor_organization() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT p.organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.ativo WHERE p.user_id=auth.uid() AND p.ativo AND platform_private.platform_actor_access_ready(p.user_id) $$;
CREATE FUNCTION platform_private.catalog_ownership_enabled() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT enabled FROM platform_private.test_gate $$;
CREATE FUNCTION platform_private.catalog_reader_org() RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v uuid; BEGIN
  IF auth.uid() IS NULL OR public.is_platform_superadmin(auth.uid()) THEN RETURN NULL; END IF;
  v := platform_private.h15_actor_organization(); RETURN v; END $$;
GRANT USAGE ON SCHEMA platform_private TO authenticated;
GRANT EXECUTE ON FUNCTION platform_private.catalog_reader_org() TO authenticated;
CREATE FUNCTION platform_private.global_product_fiscal_read_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT auth.uid() IS NOT NULL AND (public.is_platform_superadmin(auth.uid()) OR platform_private.has_role(auth.uid(),'administrador') OR platform_private.has_role(auth.uid(),'gestor') OR platform_private.has_role(auth.uid(),'financeiro')) $$;
CREATE FUNCTION platform_private.global_product_fiscal_write_ready() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS
 $$ SELECT auth.uid() IS NOT NULL AND public.is_platform_superadmin(auth.uid()) $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA platform_private TO authenticated;
CREATE TABLE public.produtos (id uuid PRIMARY KEY, nome text NOT NULL, codigo text, familia_catalogo text,
  owner_organization_id uuid REFERENCES public.organizations(id));
CREATE TABLE public.product_fiscal_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_id uuid NOT NULL REFERENCES public.produtos(id),
  is_active boolean NOT NULL DEFAULT true, fiscal_description text, commercial_unit text, taxable_unit text, ncm text, cest text,
  origin_code text, cfop_in_state text, cfop_interstate text, icms_cst text, icms_csosn text, pis_cst text, cofins_cst text, ipi_cst text,
  gtin text, taxable_gtin text, tax_benefit_code text, approximate_tax_source text, profile_status text NOT NULL DEFAULT 'DRAFT',
  accounting_notes text, accounting_validated_at timestamptz, accounting_validated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), created_by uuid, updated_by uuid);
CREATE UNIQUE INDEX ON public.product_fiscal_profiles(product_id) WHERE is_active;
GRANT SELECT, INSERT, UPDATE ON public.product_fiscal_profiles TO authenticated;
GRANT SELECT ON public.produtos TO authenticated;
ALTER TABLE public.product_fiscal_profiles ENABLE ROW LEVEL SECURITY;
-- Réplica das 4 policies LIVE (lidas 01/11 read-only).
CREATE POLICY product_fiscal_profiles_delete ON public.product_fiscal_profiles FOR DELETE TO authenticated USING (false);
CREATE POLICY product_fiscal_profiles_insert ON public.product_fiscal_profiles FOR INSERT TO authenticated WITH CHECK (platform_private.global_product_fiscal_write_ready());
CREATE POLICY product_fiscal_profiles_read ON public.product_fiscal_profiles FOR SELECT TO authenticated USING (platform_private.global_product_fiscal_read_ready());
CREATE POLICY product_fiscal_profiles_update ON public.product_fiscal_profiles FOR UPDATE TO authenticated USING (platform_private.global_product_fiscal_write_ready()) WITH CHECK (platform_private.global_product_fiscal_write_ready());

-- Fixtures sintéticas: A=ARBio-like, B=FSF-like
INSERT INTO public.organizations VALUES ('a0000000-0000-0000-0000-00000000000a',true,'ativa'),('b0000000-0000-0000-0000-00000000000b',true,'ativa');
INSERT INTO public.profiles VALUES
 ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-00000000000a',true,false), -- admin A
 ('22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-00000000000a',true,false), -- gestor A
 ('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-00000000000b',true,false), -- admin B
 ('44444444-4444-4444-4444-444444444444',NULL,true,false),                                    -- superadmin
 ('55555555-5555-5555-5555-555555555555','a0000000-0000-0000-0000-00000000000a',false,false); -- admin A inativo
INSERT INTO public.user_roles VALUES ('11111111-1111-1111-1111-111111111111','administrador'),('22222222-2222-2222-2222-222222222222','gestor'),
 ('33333333-3333-3333-3333-333333333333','administrador'),('44444444-4444-4444-4444-444444444444','superadmin'),('55555555-5555-5555-5555-555555555555','administrador');
INSERT INTO public.produtos VALUES
 ('c0000000-0000-0000-0000-00000000000c','Global X','G-1','biologico',NULL),
 ('d0000000-0000-0000-0000-00000000000a','Adubo A','A-1','fertilizante_adubo','a0000000-0000-0000-0000-00000000000a'),
 ('e0000000-0000-0000-0000-00000000000b','Adubo B','B-1','fertilizante_adubo','b0000000-0000-0000-0000-00000000000b');
GRANT USAGE ON SCHEMA public TO authenticated;
