-- Fase 6 — Auditoria dedicada das alterações de redução da base de cálculo
-- Incremental, idempotente e reversível. Não altera snapshots históricos.
BEGIN;

-- 1) Validador aceita, opcionalmente, o motivo informado pelo operador (nunca valores calculados)
CREATE OR REPLACE FUNCTION public.fn_fiscal_tax_input_valid(_input jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  k text; v jsonb; ik text; pct numeric;
  allowed_kinds text[] := ARRAY['ICMS','ICMS_ST','FCP','FCP_ST','DIFAL','PIS','COFINS','IPI'];
BEGIN
  IF _input IS NULL THEN RETURN true; END IF;
  IF jsonb_typeof(_input) <> 'object' THEN RETURN false; END IF;

  FOR k, v IN SELECT * FROM jsonb_each(_input) LOOP
    IF NOT (k = ANY(allowed_kinds)) THEN RETURN false; END IF;
    IF jsonb_typeof(v) <> 'object' THEN RETURN false; END IF;
    FOR ik IN SELECT jsonb_object_keys(v) LOOP
      IF ik NOT IN ('baseReductionPct','baseReductionReason') THEN RETURN false; END IF;
    END LOOP;
    IF NOT (v ? 'baseReductionPct') THEN RETURN false; END IF;
    IF jsonb_typeof(v->'baseReductionPct') <> 'number' THEN RETURN false; END IF;
    pct := (v->>'baseReductionPct')::numeric;
    IF pct < 0 OR pct > 100 THEN RETURN false; END IF;
    IF v ? 'baseReductionReason' THEN
      IF jsonb_typeof(v->'baseReductionReason') <> 'string' THEN RETURN false; END IF;
      IF length(v->>'baseReductionReason') > 240 THEN RETURN false; END IF;
    END IF;
  END LOOP;

  RETURN true;
END $function$;

-- 2) Trilha dedicada por tributo
CREATE OR REPLACE FUNCTION public.fn_fiscal_audit_base_reduction()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_actor uuid;
  v_old jsonb := coalesce(CASE WHEN TG_OP = 'UPDATE' THEN OLD.tax_input_snapshot END, '{}'::jsonb);
  v_new jsonb := coalesce(NEW.tax_input_snapshot, '{}'::jsonb);
  v_snap jsonb := coalesce(NEW.tax_snapshot, '{}'::jsonb);
  v_kind text;
  v_oldpct jsonb;
  v_newpct jsonb;
  v_tax jsonb;
BEGIN
  IF v_old = v_new THEN RETURN NEW; END IF;
  BEGIN v_actor := auth.uid(); EXCEPTION WHEN OTHERS THEN v_actor := NULL; END;

  FOR v_kind IN
    SELECT DISTINCT k FROM (
      SELECT jsonb_object_keys(v_old) AS k
      UNION SELECT jsonb_object_keys(v_new)
    ) s
  LOOP
    v_oldpct := v_old -> v_kind -> 'baseReductionPct';
    v_newpct := v_new -> v_kind -> 'baseReductionPct';
    CONTINUE WHEN v_oldpct IS NOT DISTINCT FROM v_newpct;

    SELECT t INTO v_tax
      FROM jsonb_array_elements(coalesce(v_snap->'taxes', '[]'::jsonb)) t
     WHERE t->>'taxKind' = v_kind
     LIMIT 1;

    INSERT INTO public.fiscal_audit_log(table_name, record_id, action, changed_by, old_values, new_values)
    VALUES (
      'fiscal_invoice_items', NEW.id, 'BASE_REDUCTION_CHANGE', v_actor,
      jsonb_build_object('taxKind', v_kind, 'baseReductionPct', v_oldpct),
      jsonb_build_object(
        'taxKind', v_kind,
        'baseReductionPct', v_newpct,
        'reason', v_new -> v_kind ->> 'baseReductionReason',
        'fiscalInvoiceId', NEW.fiscal_invoice_id,
        'itemId', NEW.id,
        'ruleId', v_tax->>'ruleId',
        'ruleKey', v_tax->>'ruleKey',
        'ruleVersion', v_tax->>'ruleVersion',
        'legalBasis', v_tax->>'legalBasis',
        'legalVersion', v_tax->>'legalVersion',
        'baseReductionMode', v_tax->>'baseReductionMode'
      )
    );
  END LOOP;

  RETURN NEW;
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_fiscal_audit_base_reduction() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_fiscal_audit_base_reduction ON public.fiscal_invoice_items;
CREATE TRIGGER trg_fiscal_audit_base_reduction
AFTER INSERT OR UPDATE OF tax_input_snapshot ON public.fiscal_invoice_items
FOR EACH ROW EXECUTE FUNCTION public.fn_fiscal_audit_base_reduction();

COMMIT;

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_fiscal_audit_base_reduction ON public.fiscal_invoice_items;
--   DROP FUNCTION IF EXISTS public.fn_fiscal_audit_base_reduction();
--   (restaurar fn_fiscal_tax_input_valid da migration 20261029000000)
