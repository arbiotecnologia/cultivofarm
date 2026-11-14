-- Synthetic minimal schema; not hosted JWT evidence.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE SCHEMA platform_private; CREATE SCHEMA auth; CREATE SCHEMA cf_user_guards_v1;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
CREATE TABLE cf_user_guards_v1.state(singleton boolean PRIMARY KEY); INSERT INTO cf_user_guards_v1.state VALUES(true);
CREATE TABLE public.produtos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_organization_id uuid NOT NULL,nome text);
CREATE TABLE public.product_fiscal_profiles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),product_id uuid NOT NULL REFERENCES public.produtos(id),
is_active boolean NOT NULL DEFAULT true,profile_status text NOT NULL DEFAULT 'DRAFT',ncm text,accounting_validated_at timestamptz,
accounting_validated_by uuid,created_by uuid,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now(),ibs_cbs_configuration jsonb NOT NULL DEFAULT '{}');
CREATE UNIQUE INDEX ux_product_fiscal_profiles_active ON public.product_fiscal_profiles(product_id) WHERE is_active=true;
CREATE FUNCTION platform_private.global_product_fiscal_before_write() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END $$;
CREATE TRIGGER a10_global_product_fiscal_authorize BEFORE INSERT OR UPDATE ON public.product_fiscal_profiles FOR EACH ROW EXECUTE FUNCTION platform_private.global_product_fiscal_before_write();
INSERT INTO public.produtos VALUES('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000010','Existing');
-- Load exact candidate minus only hosted metadata pin, against explicitly synthetic guard.
\i /tmp/product-profile-foundation-test.sql
DO $$ DECLARE n integer; BEGIN
 SELECT count(*) INTO n FROM public.product_fiscal_profiles; IF n<>1 THEN RAISE EXCEPTION 'backfill failed'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_fiscal_profiles WHERE profile_status<>'DRAFT' OR ncm IS NOT NULL OR accounting_validated_at IS NOT NULL OR ibs_cbs_configuration<>'{}') THEN RAISE EXCEPTION 'invented fiscal values'; END IF;
 RAISE NOTICE 'PASS backfill blank DRAFT';
 PERFORM platform_private.ensure_product_fiscal_draft('00000000-0000-4000-8000-000000000001');
 IF (SELECT count(*) FROM public.product_fiscal_profiles)<>1 THEN RAISE EXCEPTION 'duplicate backfill'; END IF;
 RAISE NOTICE 'PASS idempotent backfill';
 INSERT INTO public.produtos VALUES('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000020','Other tenant');
 IF (SELECT count(*) FROM public.product_fiscal_profiles WHERE product_id='00000000-0000-4000-8000-000000000002')<>1 THEN RAISE EXCEPTION 'insert profile missing'; END IF;
 RAISE NOTICE 'PASS insert another owner creates exactly one profile';
 BEGIN
  INSERT INTO public.product_fiscal_profiles(product_id,ncm) VALUES('00000000-0000-4000-8000-000000000002','12345678');
  RAISE EXCEPTION 'direct fiscal write allowed';
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS direct write still denied'; END;
 BEGIN
  INSERT INTO public.produtos VALUES('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000020','Rollback');
  RAISE EXCEPTION 'force rollback' USING ERRCODE='P0002';
 EXCEPTION WHEN no_data_found THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.produtos WHERE id='00000000-0000-4000-8000-000000000003') OR EXISTS(SELECT 1 FROM public.product_fiscal_profiles WHERE product_id='00000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'atomicity failed'; END IF;
 RAISE NOTICE 'PASS product/profile rollback together';
 IF EXISTS(SELECT 1 FROM platform_private.product_fiscal_bootstrap_permits) THEN RAISE EXCEPTION 'permit leaked'; END IF;
 RAISE NOTICE 'PASS no residual permits';
 IF has_function_privilege('authenticated','platform_private.ensure_product_fiscal_draft(uuid)','EXECUTE') OR has_table_privilege('authenticated','platform_private.product_fiscal_bootstrap_permits','INSERT') THEN RAISE EXCEPTION 'public bootstrap'; END IF;
 RAISE NOTICE 'PASS client cannot bootstrap';
END $$;
CREATE FUNCTION public.fail_profile_test() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'test failure' USING ERRCODE='23514'; END$$;
CREATE TRIGGER z_test_failure BEFORE INSERT ON public.product_fiscal_profiles FOR EACH ROW EXECUTE FUNCTION public.fail_profile_test();
DO $$BEGIN
 BEGIN INSERT INTO public.produtos VALUES('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000020','Failure');
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.produtos WHERE id='00000000-0000-4000-8000-000000000004') THEN RAISE EXCEPTION 'profile failure left product'; END IF;
 RAISE NOTICE 'PASS profile failure rolls back product';
END$$;