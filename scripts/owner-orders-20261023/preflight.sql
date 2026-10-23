-- READ ONLY, assertivo. Abortar se o ref != swzpzcwiasxmjutrmvkm. Qualquer RAISE = NO-GO.
BEGIN READ ONLY;
DO $$
DECLARE r record; n int;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('platform_private.assert_b2b_partner_scope(uuid,uuid)','f86f43f9d9ad3ed97b840fcc02c79476','{postgres=X/postgres,service_role=X/postgres}'),
    ('platform_private.b2b_commercial_partner_projection()','136b4d59f794d5ff379a7c2ca19455e2','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
    ('public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)','624f6e3d45e5af7d039d5da8f784d787','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)','f9882718027ac4a09810e6e0bf133c61','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('public.generate_b2b_receivable_secure_impl(uuid)','60be0fb336ca1537c063a001a213f7af','{postgres=X/postgres,service_role=X/postgres}'),
    ('public.tg_auto_b2b_receivable()','0f679538fe394924b140e54938a3bb9e','{postgres=X/postgres,service_role=X/postgres}'),
    ('public.generate_b2b_receivable_secure(uuid)','c08432be20b610b424c45b73ec9610ae','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('public.approve_partner_order(uuid,text,date)','09eb9e7442cc59c7c72b4d39f3567a53','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('public.cancel_b2b_receivable_secure(uuid,text)','9935ddb807b0b3da89dfb7d18fea267e','{postgres=X/postgres,service_role=X/postgres}'),
    ('platform_private.b2b_actor_scope(uuid)','c3f2997746f24bc2efd15db5c0ccc862','{postgres=X/postgres,service_role=X/postgres}'),
    ('public.is_valid_b2b_partner_user(uuid,uuid)','0bb0dea04be8ca84c66db7ca6329876c','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('platform_private.b2b_commercial_context()','2f1063f00281c4ca78dcebaab81a9446','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
    ('platform_private.c2_order_internal_recipients(uuid)','d4936c87a3ab62d26816a11a032dfe0f','{postgres=X/postgres}'),
    ('platform_private.c2_order_partner_recipients(uuid)','70b381094ae1f3ac87d0fa8e28274dac','{postgres=X/postgres}'),
    ('public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date)','8bb99a3c335b5f9876d99d988dcf94b0',NULL),
    ('public.fn_b2b_plan_selectable(uuid,timestamp with time zone)','4cb833a3eae76cbebce920f34cd5d5ce',NULL)
  ) v(sig,h,acl) LOOP
    IF md5(pg_get_functiondef(r.sig::regprocedure)) <> r.h THEN RAISE EXCEPTION 'drift %', r.sig; END IF;
    IF r.acl IS NOT NULL AND (SELECT proacl::text FROM pg_proc WHERE oid = r.sig::regprocedure) <> r.acl THEN
      RAISE EXCEPTION 'acl_drift % %', r.sig, (SELECT proacl::text FROM pg_proc WHERE oid = r.sig::regprocedure);
    END IF;
  END LOOP;
  -- Fiscal containment is installed: never accept the vulnerable historical ACL.
  IF (SELECT proacl::text FROM pg_proc WHERE oid='public.fn_fiscal_requirement_resolve(text,text,text,text,uuid,date)'::regprocedure)
     IS DISTINCT FROM '{postgres=X/postgres,service_role=X/postgres}' THEN RAISE EXCEPTION 'fiscal_acl_drift'; END IF;
  IF to_regprocedure('platform_private.c2_owner_order_create_allowed(uuid,uuid)') IS NOT NULL
     OR to_regprocedure('platform_private.c2_order_actor_scope(uuid,uuid)') IS NOT NULL THEN RAISE EXCEPTION 'already_installed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261023192728') THEN RAISE EXCEPTION 'installed_slice_missing'; END IF;
  -- Gatilho continua AFTER UPDATE OF status (atomicidade depende disso).
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.partner_orders'::regclass AND tgname='trg_auto_b2b_receivable'
                 AND pg_get_triggerdef(oid) LIKE '%AFTER UPDATE OF status ON public.partner_orders FOR EACH ROW EXECUTE FUNCTION tg_auto_b2b_receivable()%') THEN
    RAISE EXCEPTION 'trigger_drift';
  END IF;
  -- Schema global confirmado (sem organization_id): se mudar, a resolução estrita precisa ser revista.
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
             AND table_name IN ('financial_categories','payment_methods') AND column_name='organization_id') THEN
    RAISE NOTICE 'refs_schema_changed_review_required';
  END IF;
  -- Parceiro com org própria E dono comercial ⇒ ambiguidade a revisar antes.
  SELECT count(*) INTO n FROM public.partner_accounts pa
   WHERE pa.commercial_owner_organization_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.partner_account_id = pa.id);
  IF n > 0 THEN RAISE EXCEPTION 'owner_and_own_org_conflict:%', n; END IF;
END $$;
-- Current P1 composition: exact functions, policies, settings columns and triggers.
-- This companion is embedded in candidate.sql.review before any persistent DDL.
-- Informativos (não bloqueiam, mas devem ser lidos pelo revisor):
SELECT 'revenue_categories_active' k, count(*)::text v FROM public.financial_categories WHERE upper(btrim(type))='RECEITA' AND active
UNION ALL SELECT 'payment_methods_active', string_agg(name, ' | ') FROM public.payment_methods WHERE active
UNION ALL SELECT 'settings_by_trigger', string_agg(billing_trigger||'/'||COALESCE(default_payment_method,'NULL')||'/auto='||auto_generate_receivable, ', ') FROM public.partner_financial_settings WHERE active
UNION ALL SELECT 'settings_method_unresolved', count(*)::text FROM public.partner_financial_settings s WHERE s.active
   AND (SELECT count(*) FROM public.payment_methods pm WHERE pm.active AND lower(btrim(pm.name))=lower(btrim(COALESCE(s.default_payment_method,''))))<>1
UNION ALL SELECT 'owner_partners_without_assignment', count(*)::text FROM public.partner_accounts pa
   WHERE pa.commercial_owner_organization_id IS NOT NULL AND pa.ativo AND pa.deleted_at IS NULL
     AND NOT EXISTS (SELECT 1 FROM public.commercial_payment_plan_assignments a WHERE a.partner_id=pa.id AND a.status='published')
UNION ALL SELECT 'owner_orders_open_last90d', count(*)::text FROM public.partner_orders po JOIN public.partner_accounts pa ON pa.id=po.partner_id
   WHERE pa.commercial_owner_organization_id IS NOT NULL AND po.created_at > now()-interval '90 days'
UNION ALL SELECT 'auto_billing_failures_history', count(*)::text FROM public.partner_order_audit_logs WHERE acao='financeiro_auto_falhou'
UNION ALL SELECT 'approved_without_link', count(*)::text FROM public.partner_orders po
   WHERE po.status='aprovado' AND NOT EXISTS (SELECT 1 FROM public.partner_order_financial_links l WHERE l.partner_order_id=po.id);
ROLLBACK;
