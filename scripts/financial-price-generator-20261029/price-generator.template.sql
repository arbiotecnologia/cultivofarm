-- INACTIVE OFFLINE CANDIDATE — generated pins are substituted by build-candidate.py.
-- Never apply hosted. Never place under supabase/migrations. Disposable PostgreSQL only.
-- Reuses the existing private transaction context (platform_private.financial_initial_installments)
-- through the captured rpc_create_financial_title and the reviewed generator; no parallel finance.
-- Installment original_amount = Price payment (principal+interest); interest_amount stays 0 so
-- additive readers never double-count (P0 10300->10600). Breakdown lives only in the immutable snapshot.
BEGIN;
SET LOCAL lock_timeout = '3s';

CREATE TABLE platform_private.holiday_calendars (
  version text PRIMARY KEY,
  locality text NOT NULL,
  coverage_start date NOT NULL,
  coverage_end date NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  sealed_canonical text NOT NULL,
  holidays date[] NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coverage_end >= coverage_start)
);

CREATE TABLE platform_private.price_schedule_snapshots (
  receivable_id uuid PRIMARY KEY REFERENCES public.accounts_receivable(id),
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  transaction_id bigint NOT NULL,
  policy_version text NOT NULL,
  calendar_version text NOT NULL REFERENCES platform_private.holiday_calendars(version),
  calendar_sha256 text NOT NULL,
  nf_reference uuid NOT NULL,
  nf_issue_date date NOT NULL,
  table_amount numeric(14,2) NOT NULL CHECK (table_amount > 0),
  discount_percent numeric(5,2) NOT NULL CHECK (discount_percent = 40),
  principal numeric(14,2) NOT NULL CHECK (principal > 0),
  monthly_rate_percent numeric(6,3) NOT NULL,
  installment_count int NOT NULL CHECK (installment_count BETWEEN 1 AND 3),
  financed_total numeric(14,2) NOT NULL,
  credit_limit numeric(14,2) NOT NULL,
  exposure_before numeric(14,2) NOT NULL,
  rows jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE platform_private.price_generation_receipts (
  actor_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  request_sha256 text NOT NULL,
  receivable_id uuid NOT NULL REFERENCES platform_private.price_schedule_snapshots(receivable_id),
  result jsonb NOT NULL,
  PRIMARY KEY (actor_id, organization_id, idempotency_key)
);

-- Private, transaction-scoped partner context: written only by the Price RPC from the server-validated
-- link, consumed exactly once by the AR BEFORE INSERT trigger. Never derived from the payload.
CREATE TABLE platform_private.price_title_partner_context (
  transaction_id bigint NOT NULL,
  actor_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  partner_id uuid NOT NULL,
  PRIMARY KEY (transaction_id, organization_id, customer_id)
);
REVOKE ALL ON platform_private.price_title_partner_context FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE platform_private.price_title_partner_context ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON platform_private.holiday_calendars, platform_private.price_schedule_snapshots,
  platform_private.price_generation_receipts FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE platform_private.holiday_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.price_schedule_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_private.price_generation_receipts ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION platform_private.price_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'PRICE_RECORD_IMMUTABLE' USING ERRCODE = '42501';
END $$;
CREATE TRIGGER price_calendar_immutable BEFORE UPDATE OR DELETE ON platform_private.holiday_calendars
  FOR EACH ROW EXECUTE FUNCTION platform_private.price_immutable();
CREATE TRIGGER price_calendar_no_truncate BEFORE TRUNCATE ON platform_private.holiday_calendars
  FOR EACH STATEMENT EXECUTE FUNCTION platform_private.price_immutable();
CREATE TRIGGER price_snapshot_immutable BEFORE UPDATE OR DELETE ON platform_private.price_schedule_snapshots
  FOR EACH ROW EXECUTE FUNCTION platform_private.price_immutable();
CREATE TRIGGER price_snapshot_no_truncate BEFORE TRUNCATE ON platform_private.price_schedule_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION platform_private.price_immutable();
CREATE TRIGGER price_receipt_immutable BEFORE UPDATE OR DELETE ON platform_private.price_generation_receipts
  FOR EACH ROW EXECUTE FUNCTION platform_private.price_immutable();
CREATE TRIGGER price_receipt_no_truncate BEFORE TRUNCATE ON platform_private.price_generation_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION platform_private.price_immutable();

-- Owner-only loader: sealed canonical text must hash to the declared digest; fields derive from it.
CREATE FUNCTION platform_private.price_calendar_load(p_canonical text, p_sha256 text) RETURNS text
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE d jsonb; v_h date[]; cs date; ce date;
BEGIN
  IF encode(sha256(convert_to(p_canonical, 'UTF8')), 'hex') IS DISTINCT FROM p_sha256 THEN
    RAISE EXCEPTION 'CALENDAR_INTEGRITY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  d := p_canonical::jsonb;
  IF d->>'schema' IS DISTINCT FROM 'cultivofarm.holiday-calendar.v1' OR d->>'kind' IS DISTINCT FROM 'REAL_OFFICIAL_SOURCES'
     OR coalesce(jsonb_array_length(d->'sources'), 0) = 0 THEN
    RAISE EXCEPTION 'CALENDAR_METADATA_REQUIRED' USING ERRCODE = '23514';
  END IF;
  cs := (d->>'coverage_start')::date; ce := (d->>'coverage_end')::date;
  SELECT array_agg((x->>'date')::date ORDER BY (x->>'date')::date) INTO v_h
    FROM jsonb_array_elements(d->'data'->'holidays') x WHERE x->>'classification' = 'FERIADO';
  IF v_h IS NULL OR cardinality(v_h) <> jsonb_array_length(d->'data'->'holidays')
     OR EXISTS (SELECT 1 FROM unnest(v_h) h WHERE h < cs OR h > ce)
     OR (SELECT count(DISTINCT h) FROM unnest(v_h) h) <> cardinality(v_h)
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(d->'data'->'excluded_optional_points') o WHERE (o->>'date')::date = ANY (v_h)) THEN
    RAISE EXCEPTION 'CALENDAR_HOLIDAYS_INVALID' USING ERRCODE = '23514';
  END IF;
  INSERT INTO platform_private.holiday_calendars(version, locality, coverage_start, coverage_end, sha256, sealed_canonical, holidays)
    VALUES (d->>'version', d->>'locality', cs, ce, p_sha256, p_canonical, v_h);
  RETURN d->>'version';
END $$;

-- Pinned calendar resolution: locality + version + digest + re-hash of stored text.
CREATE FUNCTION platform_private.price_pinned_calendar() RETURNS platform_private.holiday_calendars
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE c platform_private.holiday_calendars;
BEGIN
  SELECT * INTO c FROM platform_private.holiday_calendars WHERE version = '@@CAL_VERSION@@';
  IF NOT FOUND THEN RAISE EXCEPTION 'CALENDAR_SOURCE_REQUIRED' USING ERRCODE = '23514'; END IF;
  IF c.locality IS DISTINCT FROM '@@CAL_LOCALITY@@' THEN RAISE EXCEPTION 'CALENDAR_LOCALITY_MISMATCH' USING ERRCODE = '23514'; END IF;
  IF c.sha256 IS DISTINCT FROM '@@CAL_SHA256@@'
     OR encode(sha256(convert_to(c.sealed_canonical, 'UTF8')), 'hex') IS DISTINCT FROM c.sha256 THEN
    RAISE EXCEPTION 'CALENDAR_INTEGRITY_MISMATCH' USING ERRCODE = '23514';
  END IF;
  RETURN c;
END $$;

CREATE FUNCTION platform_private.price_adjusted_due(p_nominal date, p_cal platform_private.holiday_calendars) RETURNS date
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE d date := p_nominal;
BEGIN
  FOR k IN 1..60 LOOP
    IF d < p_cal.coverage_start OR d > p_cal.coverage_end THEN
      RAISE EXCEPTION 'CALENDAR_COVERAGE_EXCEEDED' USING ERRCODE = '23514';
    END IF;
    IF extract(isodow FROM d) < 6 AND NOT (d = ANY (p_cal.holidays)) THEN RETURN d; END IF;
    d := d + 1;
  END LOOP;
  RAISE EXCEPTION 'CALENDAR_NO_BUSINESS_DAY' USING ERRCODE = '23514';
END $$;

-- Pure server schedule: discount once, Price on outstanding balance, last row closes balance.
CREATE FUNCTION platform_private.price_compute(p_table_amount numeric, p_n int, p_nf date, p_cal platform_private.holiday_calendars)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE p numeric(14,2); i numeric; pmt numeric(14,2); bal numeric(14,2); it numeric(14,2); am numeric(14,2);
        first date; nom date; rows jsonb := '[]'::jsonb; total numeric(14,2) := 0;
BEGIN
  IF p_table_amount IS NULL OR p_table_amount::text IN ('NaN','Infinity','-Infinity') OR p_table_amount <= 0
     OR p_table_amount <> round(p_table_amount, 2) OR p_table_amount > 999999999999.99 THEN  -- numeric(14,2) ceiling, checked unconstrained
    RAISE EXCEPTION 'TABLE_AMOUNT_INVALID' USING ERRCODE = '23514';
  END IF;
  IF p_n IS NULL OR p_n NOT BETWEEN 1 AND 3 THEN RAISE EXCEPTION 'INSTALLMENTS_OUT_OF_RANGE' USING ERRCODE = '23514'; END IF;
  IF p_nf IS NULL OR NOT isfinite(p_nf) THEN RAISE EXCEPTION 'NF_ISSUE_DATE_REQUIRED' USING ERRCODE = '23514'; END IF;
  p := round(p_table_amount * 0.60, 2);
  i := CASE WHEN p_n = 1 THEN 0 ELSE 0.018 END;
  pmt := CASE WHEN i = 0 THEN round(p / p_n, 2) ELSE round(p * i / (1 - power(1 + i, -p_n)), 2) END;
  bal := p; first := p_nf + 30;
  FOR k IN 1..p_n LOOP
    it := round(bal * i, 2);
    am := CASE WHEN k < p_n THEN pmt - it ELSE bal END;
    bal := bal - am;
    IF am <= 0 OR it + am <= 0 THEN RAISE EXCEPTION 'PLAN_NOT_REPRESENTABLE_IN_CENTS' USING ERRCODE = '23514'; END IF;
    nom := (first + make_interval(months => k - 1))::date;  -- clamp from FIRST nominal, no drift
    rows := rows || jsonb_build_object('installment_number', k, 'nominal_due', nom,
              'due_date', platform_private.price_adjusted_due(nom, p_cal),
              'interest', it, 'principal', am, 'amount', it + am, 'balance', bal);
    total := total + it + am;
  END LOOP;
  IF bal <> 0 THEN RAISE EXCEPTION 'PLAN_NOT_REPRESENTABLE_IN_CENTS' USING ERRCODE = '23514'; END IF;
  RETURN jsonb_build_object('principal', p, 'rate', i * 100, 'financed_total', total, 'rows', rows);
END $$;

-- Dependencies NOT proven: deny-only in the candidate. Disposable tests may replace them with
-- explicitly SYNTHETIC stubs; they never become runtime authority.
CREATE FUNCTION platform_private.price_payment_settings(p_org uuid, p_customer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'PAYMENT_SETTINGS_OFFICIAL_ABSENT' USING ERRCODE = '42501'; END $$;
-- Debtor -> partner: exactly one ACTIVE partner whose client is the debtor under this commercial owner.
CREATE FUNCTION platform_private.price_credit_partner(p_org uuid, p_customer uuid) RETURNS uuid
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE v uuid[];
BEGIN
  SELECT array_agg(pa.id ORDER BY pa.id) INTO v FROM public.partner_accounts pa
   WHERE pa.client_id = p_customer AND pa.commercial_owner_organization_id = p_org AND pa.ativo IS TRUE;
  IF v IS NULL THEN RAISE EXCEPTION 'CREDIT_PARTNER_LINK_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF cardinality(v) > 1 THEN RAISE EXCEPTION 'CREDIT_PARTNER_LINK_AMBIGUOUS' USING ERRCODE = '42501'; END IF;
  RETURN v[1];
END $$;
-- Canonical exposure: captured public.fn_b2b_credit_exposure (open titles original-received by partner,
-- committed + pending orders without generated receivable/link) PLUS open Price titles of this
-- tenant+debtor that the canonical function cannot see (partner_id not carried), counted once.
CREATE FUNCTION platform_private.price_credit_exposure(p_org uuid, p_customer uuid, p_partner uuid) RETURNS numeric
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE v jsonb; v_price numeric(14,2);
BEGIN
  v := public.fn_b2b_credit_exposure(p_partner, 0, NULL);
  IF v->>'reason_code' IN ('OVERDUE_BLOCK', 'NO_LIMIT_DEFINED') THEN
    RAISE EXCEPTION 'CREDIT_%', v->>'reason_code' USING ERRCODE = 'PT409';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.partner_financial_settings WHERE partner_id = p_partner AND active IS TRUE) THEN
    RAISE EXCEPTION 'CREDIT_SETTINGS_INACTIVE' USING ERRCODE = 'PT409';
  END IF;
  IF (v->>'credit_limit')::numeric IS DISTINCT FROM 100000.00 THEN
    RAISE EXCEPTION 'CREDIT_LIMIT_CONTRADICTION' USING ERRCODE = '23514';
  END IF;
  SELECT coalesce(sum(i.original_amount - i.received_amount), 0) INTO v_price
    FROM platform_private.price_schedule_snapshots s
    JOIN public.accounts_receivable ar ON ar.id = s.receivable_id AND ar.organization_id = p_org AND ar.customer_id = p_customer
    JOIN public.accounts_receivable_installments i ON i.receivable_id = ar.id
   WHERE s.organization_id = p_org AND s.customer_id = p_customer
     AND ar.partner_id IS DISTINCT FROM p_partner AND ar.status <> 'CANCELED'
     AND i.status IN ('OPEN', 'PARTIAL', 'OVERDUE');
  RETURN round((v->>'exposicao_atual')::numeric + v_price, 2);
END $$;
CREATE FUNCTION platform_private.price_nf_origin(p_nf uuid, p_org uuid, p_customer uuid) RETURNS date
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'FISCAL_ORIGIN_UNPROVEN' USING ERRCODE = '42501'; END $$;
CREATE FUNCTION platform_private.price_accounting_gate(p_org uuid, p_customer uuid) RETURNS void
LANGUAGE plpgsql STABLE SET search_path = '' AS $$
BEGIN RAISE EXCEPTION 'C2_ACCOUNTING_PENDING' USING ERRCODE = '42501'; END $$;

CREATE FUNCTION platform_private.price_ar_partner_from_context() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE c platform_private.price_title_partner_context;
BEGIN
  SELECT * INTO c FROM platform_private.price_title_partner_context
   WHERE transaction_id = txid_current() AND organization_id = NEW.organization_id AND customer_id = NEW.customer_id;
  IF NOT FOUND THEN RETURN NEW; END IF;  -- every other writer is untouched
  IF NEW.partner_id IS NOT NULL AND NEW.partner_id IS DISTINCT FROM c.partner_id THEN
    RAISE EXCEPTION 'PRICE_PARTNER_CONTEXT_CONFLICT' USING ERRCODE = '23514';
  END IF;
  IF NEW.created_by IS DISTINCT FROM c.actor_id
     OR platform_private.price_credit_partner(NEW.organization_id, NEW.customer_id) IS DISTINCT FROM c.partner_id THEN
    RAISE EXCEPTION 'PRICE_PARTNER_CONTEXT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  NEW.partner_id := c.partner_id;
  DELETE FROM platform_private.price_title_partner_context
   WHERE transaction_id = c.transaction_id AND organization_id = c.organization_id AND customer_id = c.customer_id;
  RETURN NEW;
END $$;
CREATE TRIGGER price_ar_partner_context BEFORE INSERT ON public.accounts_receivable
  FOR EACH ROW EXECUTE FUNCTION platform_private.price_ar_partner_from_context();

CREATE FUNCTION public.rpc_create_price_receivable_candidate(p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid := platform_private.h15_actor_organization();
  v_key text; v_hash text; v_rcpt platform_private.price_generation_receipts;
  v_customer uuid; v_n int; v_nf_ref uuid; v_nf date; v_amount numeric;
  v_cal platform_private.holiday_calendars; v_s jsonb; v_set jsonb; v_exp numeric(14,2); v_lim numeric(14,2);
  v_title jsonb; v_tid uuid; v_partner uuid; v_got jsonb; v_res jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
  -- Fresh per-statement snapshots after the debtor lock are required; RR/SERIALIZABLE would
  -- read exposure from a snapshot taken before the wait.
  IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
    RAISE EXCEPTION 'PRICE_ISOLATION_READ_COMMITTED_REQUIRED' USING ERRCODE = '0A000';
  END IF;
  IF public.is_financial_staff(v_uid) IS NOT TRUE THEN  -- same captured helper, checked before any gate
    RAISE EXCEPTION 'Sem permissão para criar títulos financeiros.' USING ERRCODE = '42501';
  END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PRICE_PAYLOAD_INVALID' USING ERRCODE = '23514'; END IF;
  IF p_payload ?| ARRAY['installments','total_amount','rate','first_due_date','interest','organization_id','tenant_id','partner_id','partner'] THEN
    RAISE EXCEPTION 'PRICE_CLIENT_SCHEDULE_REJECTED' USING ERRCODE = '23514';
  END IF;
  IF coalesce(p_payload->>'generation', '') <> 'manual_authorized' THEN
    RAISE EXCEPTION 'AUTO_GENERATION_BLOCKED' USING ERRCODE = '23514';
  END IF;
  v_key := p_payload->>'idempotency_key';
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 8 AND 200 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED' USING ERRCODE = '23514'; END IF;
  v_hash := encode(sha256(convert_to((p_payload - 'idempotency_key')::text, 'UTF8')), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended(v_uid::text || '|' || v_org::text || '|' || v_key, 7));
  -- Re-authorize after the KEY wait, before any receipt read/replay: a revoked actor never sees old results.
  IF auth.uid() IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
  IF public.is_financial_staff(v_uid) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sem permissão para criar títulos financeiros.' USING ERRCODE = '42501';
  END IF;
  IF platform_private.h15_actor_organization() IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_rcpt FROM platform_private.price_generation_receipts
    WHERE actor_id = v_uid AND organization_id = v_org AND idempotency_key = v_key;
  IF FOUND THEN
    IF v_rcpt.request_sha256 IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED' USING ERRCODE = 'PT409';
    END IF;
    RETURN v_rcpt.result || jsonb_build_object('replayed', true);
  END IF;
  BEGIN
    v_customer := (p_payload->>'customer_id')::uuid;
    v_nf_ref := (p_payload->>'nf_reference')::uuid;
    v_amount := (p_payload->>'table_amount')::numeric;
    IF jsonb_typeof(p_payload->'installment_count') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'x'; END IF;
    v_n := (p_payload->>'installment_count')::int;
    IF (p_payload->>'installment_count')::numeric <> v_n THEN RAISE EXCEPTION 'x'; END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'PRICE_PAYLOAD_INVALID' USING ERRCODE = '23514';
  END;
  IF v_customer IS NULL OR v_nf_ref IS NULL THEN RAISE EXCEPTION 'PRICE_PAYLOAD_INVALID' USING ERRCODE = '23514'; END IF;
  IF jsonb_typeof(p_payload->'table_amount') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'TABLE_AMOUNT_INVALID' USING ERRCODE = '23514'; END IF;

  -- Serialize every generation for the same tenant+debtor (any actor, any key). Fixed order for
  -- all callers: key lock, then debtor lock — never the reverse, so no lock-order deadlock.
  PERFORM pg_advisory_xact_lock(hashtextextended('price-debtor|' || v_org::text || '|' || v_customer::text, 11));
  -- Re-authorize after the wait: session, staff and tenant must still hold.
  IF auth.uid() IS DISTINCT FROM v_uid THEN RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501'; END IF;
  IF public.is_financial_staff(v_uid) IS NOT TRUE THEN
    RAISE EXCEPTION 'Sem permissão para criar títulos financeiros.' USING ERRCODE = '42501';
  END IF;
  IF platform_private.h15_actor_organization() IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'FINANCIAL_TENANT_REQUIRED' USING ERRCODE = '42501';
  END IF;

  v_set := platform_private.price_payment_settings(v_org, v_customer);
  IF v_set IS NULL THEN RAISE EXCEPTION 'PAYMENT_SETTINGS_OFFICIAL_ABSENT' USING ERRCODE = '42501'; END IF;
  v_lim := (v_set->>'credit_limit')::numeric;
  IF v_lim IS DISTINCT FROM 100000.00 THEN RAISE EXCEPTION 'CREDIT_LIMIT_CONTRADICTION' USING ERRCODE = '23514'; END IF;
  IF (v_set->>'payment_method_id') IS NULL OR (v_set->>'category_id') IS NULL THEN
    RAISE EXCEPTION 'PAYMENT_SETTINGS_INCOMPLETE' USING ERRCODE = '23514';
  END IF;
  v_nf := platform_private.price_nf_origin(v_nf_ref, v_org, v_customer);
  PERFORM platform_private.price_accounting_gate(v_org, v_customer);

  v_cal := platform_private.price_pinned_calendar();
  v_s := platform_private.price_compute(v_amount, v_n, v_nf, v_cal);  -- whole plan or exception
  v_partner := platform_private.price_credit_partner(v_org, v_customer);
  -- Canonical B2B credit key shared with create/approve/quote/order-credit-guard writers (taken last).
  PERFORM pg_advisory_xact_lock(hashtextextended('b2b_credit:' || v_partner::text, 0));
  IF auth.uid() IS DISTINCT FROM v_uid OR public.is_financial_staff(v_uid) IS NOT TRUE
     OR platform_private.h15_actor_organization() IS DISTINCT FROM v_org THEN
    RAISE EXCEPTION 'Sem permissão para criar títulos financeiros.' USING ERRCODE = '42501';
  END IF;
  v_exp := platform_private.price_credit_exposure(v_org, v_customer, v_partner);  -- fresh RC statement snapshot, after locks
  IF v_exp IS NULL OR v_exp < 0 THEN RAISE EXCEPTION 'EXPOSURE_INVALID' USING ERRCODE = '23514'; END IF;
  IF v_exp + (v_s->>'financed_total')::numeric > v_lim THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED_BLOCK' USING ERRCODE = 'PT409';
  END IF;

  -- Partner context from the validated link (never the payload), consumed by the AR insert trigger.
  INSERT INTO platform_private.price_title_partner_context VALUES (txid_current(), v_uid, v_org, v_customer, v_partner);
  -- Reuse captured title RPC: its auth/staff/tenant/category guards and the private context path.
  v_title := public.rpc_create_financial_title('receivable', jsonb_build_object(
    'customer_id', v_customer, 'description', coalesce(nullif(btrim(p_payload->>'description'), ''), 'Price manual'),
    'category_id', v_set->>'category_id', 'payment_method_id', v_set->>'payment_method_id',
    'total_amount', v_s->'financed_total', 'issue_date', v_nf, 'first_due_date', v_s->'rows'->0->>'due_date',
    'installment_count', v_n,
    'installments', (SELECT jsonb_agg(jsonb_build_object('installment_number', r->'installment_number', 'due_date', r->'due_date', 'amount', r->'amount') ORDER BY (r->>'installment_number')::int)
                     FROM jsonb_array_elements(v_s->'rows') r)));
  v_tid := (v_title->>'title_id')::uuid;
  SELECT jsonb_agg(jsonb_build_object('n', installment_number, 'due', due_date, 'amt', original_amount, 'int', interest_amount) ORDER BY installment_number)
    INTO v_got FROM public.accounts_receivable_installments WHERE receivable_id = v_tid;
  IF v_got IS DISTINCT FROM (SELECT jsonb_agg(jsonb_build_object('n', (r->>'installment_number')::int, 'due', (r->>'due_date')::date,
        'amt', (r->>'amount')::numeric(14,2), 'int', 0::numeric(14,2)) ORDER BY (r->>'installment_number')::int) FROM jsonb_array_elements(v_s->'rows') r)
     OR EXISTS (SELECT 1 FROM platform_private.financial_initial_installments WHERE transaction_id = txid_current() AND title_id = v_tid)
     OR EXISTS (SELECT 1 FROM platform_private.price_title_partner_context WHERE transaction_id = txid_current())
     OR (SELECT partner_id FROM public.accounts_receivable WHERE id = v_tid) IS DISTINCT FROM v_partner THEN
    RAISE EXCEPTION 'PRICE_WRITER_MISMATCH' USING ERRCODE = '23514';
  END IF;
  INSERT INTO platform_private.price_schedule_snapshots VALUES (v_tid, v_org, v_customer, v_uid, txid_current(),
    'arbio-fsf-active-candidate', v_cal.version, v_cal.sha256, v_nf_ref, v_nf, v_amount, 40, (v_s->>'principal')::numeric,
    (v_s->>'rate')::numeric, v_n, (v_s->>'financed_total')::numeric, v_lim, v_exp, v_s->'rows', now());
  v_res := jsonb_build_object('success', true, 'receivable_id', v_tid, 'financed_total', v_s->'financed_total',
    'calendar_version', v_cal.version, 'rows', v_s->'rows');
  INSERT INTO platform_private.price_generation_receipts VALUES (v_uid, v_org, v_key, v_hash, v_tid, v_res);
  RETURN v_res || jsonb_build_object('replayed', false);
END $$;

REVOKE ALL ON FUNCTION platform_private.price_immutable(), platform_private.price_calendar_load(text,text),
  platform_private.price_pinned_calendar(), platform_private.price_adjusted_due(date, platform_private.holiday_calendars),
  platform_private.price_compute(numeric,int,date,platform_private.holiday_calendars),
  platform_private.price_payment_settings(uuid,uuid), platform_private.price_credit_partner(uuid,uuid), platform_private.price_ar_partner_from_context(), platform_private.price_credit_exposure(uuid,uuid,uuid),
  platform_private.price_nf_origin(uuid,uuid,uuid), platform_private.price_accounting_gate(uuid,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rpc_create_price_receivable_candidate(jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_create_price_receivable_candidate(jsonb) TO authenticated;
COMMIT;
