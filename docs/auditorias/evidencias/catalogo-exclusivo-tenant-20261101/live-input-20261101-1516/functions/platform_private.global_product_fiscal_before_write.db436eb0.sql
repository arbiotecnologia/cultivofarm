CREATE OR REPLACE FUNCTION platform_private.global_product_fiscal_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NOT platform_private.global_product_fiscal_write_ready() THEN RAISE EXCEPTION 'FISCAL_FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.is_active IS NOT TRUE THEN RAISE EXCEPTION 'FISCAL_HISTORY_IMMUTABLE' USING ERRCODE='42501'; END IF;
  IF NEW.product_id IS DISTINCT FROM OLD.product_id OR NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'FISCAL_IDENTITY_IMMUTABLE'; END IF;
  -- Server-owned CAS token for ALL direct editor and IBS/CBS updates.
  -- Strictly newer even inside one transaction; caller timestamps are ignored.
  -- The existing AFTER fiscal audit observes this token in the same transaction.
  NEW.updated_at:=greatest(clock_timestamp(),OLD.updated_at+interval '1 microsecond');
 ELSE NEW.updated_at:=clock_timestamp(); END IF;
 RETURN NEW;
END $function$
