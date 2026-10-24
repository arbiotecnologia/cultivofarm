CREATE OR REPLACE FUNCTION platform_private.b2b_internal_child_snapshot_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE old_parent uuid; new_parent uuid; parent uuid; o public.partner_orders; before_value jsonb; after_value jsonb;
BEGIN
 IF TG_TABLE_NAME='partner_order_items' THEN
  IF TG_OP<>'INSERT' THEN old_parent:=OLD.order_id; END IF;
  IF TG_OP<>'DELETE' THEN new_parent:=NEW.order_id; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN old_parent:=OLD.partner_order_id; END IF;
  IF TG_OP<>'DELETE' THEN new_parent:=NEW.partner_order_id; END IF;
 END IF;
 FOR parent IN SELECT DISTINCT x FROM unnest(ARRAY[old_parent,new_parent]) x WHERE x IS NOT NULL ORDER BY x LOOP
  SELECT * INTO o FROM public.partner_orders WHERE id=parent FOR UPDATE;
  IF o.internal_origin_snapshot IS NOT NULL THEN
   PERFORM platform_private.b2b_internal_assert_origin(o.internal_origin_snapshot,o.partner_id,o.cliente_id);
   IF o.status IN ('cancelado','reprovado') THEN RAISE EXCEPTION 'B2B_INTERNAL_TERMINAL_STATUS' USING ERRCODE='42501'; END IF;
   IF o.internal_economic_snapshot IS NOT NULL THEN
    IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
    before_value:=to_jsonb(OLD); after_value:=to_jsonb(NEW);
    IF TG_TABLE_NAME='partner_order_payment_terms' THEN before_value:=before_value-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes']; after_value:=after_value-ARRAY['updated_at','approval_status','approved_by','approved_at','approval_notes'];
    ELSIF TG_TABLE_NAME='partner_order_payment_schedule' THEN before_value:=before_value-ARRAY['status','receivable_installment_id']; after_value:=after_value-ARRAY['status','receivable_installment_id']; END IF;
    IF before_value IS DISTINCT FROM after_value THEN RAISE EXCEPTION 'B2B_INTERNAL_ECONOMICS_IMMUTABLE' USING ERRCODE='42501'; END IF;
   END IF;
  END IF;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $function$
