-- Executed only against the canonical project after metadata preflight.
BEGIN;
DO $$ BEGIN
 IF md5(pg_get_functiondef('platform_private.global_product_fiscal_before_write()'::regprocedure)) <> 'b9394683f173bbb4df1f0c1a03678289' THEN
  RAISE EXCEPTION 'FISCAL_GUARD_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM public.produtos WHERE owner_organization_id IS NULL) THEN RAISE EXCEPTION 'PRODUCT_OWNER_REQUIRED'; END IF;
END $$;
-- Not a caller ticket: no ACL, one transaction and exact product, consumed by the row guard.
CREATE TABLE IF NOT EXISTS platform_private.product_fiscal_bootstrap_permits (
 transaction_id bigint NOT NULL, product_id uuid NOT NULL, owner_id uuid NOT NULL,
 PRIMARY KEY(transaction_id, product_id)
);
REVOKE ALL ON platform_private.product_fiscal_bootstrap_permits FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION platform_private.ensure_product_fiscal_draft(p_product_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_owner uuid;
BEGIN
 SELECT owner_organization_id INTO v_owner FROM public.produtos WHERE id=p_product_id FOR UPDATE;
 IF v_owner IS NULL THEN RAISE EXCEPTION 'PRODUCT_OWNER_REQUIRED' USING ERRCODE='23514'; END IF;
 IF EXISTS(SELECT 1 FROM public.product_fiscal_profiles WHERE product_id=p_product_id AND is_active) THEN RETURN; END IF;
 INSERT INTO platform_private.product_fiscal_bootstrap_permits VALUES(txid_current(),p_product_id,v_owner);
 INSERT INTO public.product_fiscal_profiles(product_id,is_active,profile_status)
 VALUES(p_product_id,true,'DRAFT') ON CONFLICT(product_id) WHERE is_active=true DO NOTHING;
 DELETE FROM platform_private.product_fiscal_bootstrap_permits WHERE transaction_id=txid_current() AND product_id=p_product_id;
END $$;
REVOKE ALL ON FUNCTION platform_private.ensure_product_fiscal_draft(uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION platform_private.product_insert_fiscal_draft()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' OR TG_LEVEL<>'ROW' OR TG_WHEN<>'AFTER' OR TG_RELID<>'public.produtos'::regclass THEN
  RAISE EXCEPTION 'INVALID_PRODUCT_BOOTSTRAP_CONTEXT' USING ERRCODE='42501'; END IF;
 PERFORM platform_private.ensure_product_fiscal_draft(NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION platform_private.product_insert_fiscal_draft() FROM PUBLIC,anon,authenticated,service_role;
-- Preserve the existing fiscal guard verbatim, adding only a blank INSERT branch.
DO $delta$
DECLARE v text;
BEGIN
 v:=pg_get_functiondef('platform_private.global_product_fiscal_before_write()'::regprocedure);
 v:=replace(v,'BEGIN'||chr(10),$branch$BEGIN
  IF TG_OP='INSERT' AND NEW.is_active IS TRUE AND NEW.profile_status='DRAFT'
     AND NEW.ibs_cbs_configuration='{}'::jsonb
     AND jsonb_strip_nulls(to_jsonb(NEW) - ARRAY['id','product_id','is_active','profile_status','ibs_cbs_configuration','created_at','updated_at'])='{}'::jsonb
     AND EXISTS(SELECT 1 FROM platform_private.product_fiscal_bootstrap_permits b
       JOIN public.produtos z ON z.id=b.product_id AND z.owner_organization_id=b.owner_id
       WHERE b.transaction_id=txid_current() AND b.product_id=NEW.product_id) THEN
    DELETE FROM platform_private.product_fiscal_bootstrap_permits WHERE transaction_id=txid_current() AND product_id=NEW.product_id;
    NEW.updated_at:=clock_timestamp();
    RETURN NEW;
  END IF;
$branch$);
 EXECUTE v;
END $delta$;
CREATE TRIGGER product_insert_fiscal_draft AFTER INSERT ON public.produtos
FOR EACH ROW EXECUTE FUNCTION platform_private.product_insert_fiscal_draft();
-- Acquire the canonical guard before product locks, matching the fiscal writer.
DO $$ DECLARE p uuid; BEGIN
 PERFORM 1 FROM cf_user_guards_v1.state WHERE singleton FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'FISCAL_GATE_UNAVAILABLE'; END IF;
 LOCK TABLE public.produtos IN SHARE ROW EXCLUSIVE MODE;
 FOR p IN SELECT id FROM public.produtos ORDER BY id LOOP
  PERFORM platform_private.ensure_product_fiscal_draft(p);
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.produtos p WHERE NOT EXISTS(SELECT 1 FROM public.product_fiscal_profiles f WHERE f.product_id=p.id AND f.is_active)) THEN
  RAISE EXCEPTION 'FISCAL_BOOTSTRAP_INCOMPLETE'; END IF;
END $$;
COMMIT;