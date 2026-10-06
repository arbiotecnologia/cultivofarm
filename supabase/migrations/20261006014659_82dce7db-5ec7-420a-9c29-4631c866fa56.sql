BEGIN;

ALTER TABLE public.saas_plan_versions
  ADD COLUMN status text NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN trial_days integer NULL,
  ADD COLUMN revision integer NOT NULL DEFAULT 1,
  ADD COLUMN draft_key uuid NULL,
  ADD COLUMN publish_key uuid NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN archived_at timestamptz NULL,
  ADD COLUMN archived_by uuid NULL,
  ADD COLUMN archive_reason text NULL;

ALTER TABLE public.saas_plan_versions
  ALTER COLUMN effective_from DROP NOT NULL,
  ALTER COLUMN published_at DROP NOT NULL,
  ALTER COLUMN published_at DROP DEFAULT;

ALTER TABLE public.saas_plan_versions
  ADD CONSTRAINT saas_plan_versions_status_valid CHECK (status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  ADD CONSTRAINT saas_plan_versions_trial_days_valid CHECK (trial_days IS NULL OR trial_days BETWEEN 1 AND 365),
  ADD CONSTRAINT saas_plan_versions_revision_positive CHECK (revision > 0),
  ADD CONSTRAINT saas_plan_versions_publish_shape CHECK (
    status = 'DRAFT' OR (
      price_amount IS NOT NULL AND currency IS NOT NULL AND billing_cycle IS NOT NULL
      AND trial_days IS NOT NULL AND effective_from IS NOT NULL AND published_at IS NOT NULL
      AND jsonb_typeof(limits_snapshot) = 'object'
      AND jsonb_array_length(features_snapshot) > 0
    )
  ),
  ADD CONSTRAINT saas_plan_versions_archive_shape CHECK (
    status <> 'ARCHIVED' OR (archived_at IS NOT NULL AND archived_by IS NOT NULL AND length(btrim(archive_reason)) >= 5)
  );

CREATE UNIQUE INDEX uq_saas_plan_versions_draft_key ON public.saas_plan_versions(draft_key) WHERE draft_key IS NOT NULL;
CREATE UNIQUE INDEX uq_saas_plan_versions_publish_key ON public.saas_plan_versions(publish_key) WHERE publish_key IS NOT NULL;
CREATE UNIQUE INDEX uq_saas_plan_versions_one_draft_per_plan ON public.saas_plan_versions(plan_id) WHERE status='DRAFT';
CREATE INDEX idx_saas_plan_versions_status_effective ON public.saas_plan_versions(status,effective_from DESC);

CREATE TABLE public.saas_plan_version_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id uuid NOT NULL REFERENCES public.saas_plan_versions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  action text NOT NULL,
  old_values jsonb NULL,
  new_values jsonb NULL,
  reason text NOT NULL,
  origin text NOT NULL DEFAULT 'platform_rpc',
  actor_user_id uuid NULL,
  idempotency_key uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_plan_version_audit_action_valid CHECK (action IN ('draft_created','draft_updated','published','archived')),
  CONSTRAINT saas_plan_version_audit_reason_length CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  CONSTRAINT saas_plan_version_audit_values_object CHECK ((old_values IS NULL OR jsonb_typeof(old_values)='object') AND (new_values IS NULL OR jsonb_typeof(new_values)='object'))
);
GRANT ALL ON public.saas_plan_version_audit TO service_role;
ALTER TABLE public.saas_plan_version_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_plan_version_audit_platform_read ON public.saas_plan_version_audit FOR SELECT TO authenticated USING (public.is_platform_superadmin((SELECT auth.uid())));
GRANT SELECT ON public.saas_plan_version_audit TO authenticated;
CREATE UNIQUE INDEX uq_saas_plan_version_audit_idempotency ON public.saas_plan_version_audit(action,idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_saas_plan_version_audit_version_created ON public.saas_plan_version_audit(plan_version_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.saas_plan_version_no_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED','ARCHIVED') THEN
    IF OLD.status='PUBLISHED' AND NEW.status='ARCHIVED' AND platform_private.has_ticket('saas_plan_version_archive',OLD.plan_id) THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'saas_version_immutable: versão publicada não pode ser alterada';
  END IF;
  IF OLD.status='DRAFT' AND NOT platform_private.has_ticket('saas_plan_version_write',OLD.plan_id) THEN
    RAISE EXCEPTION 'platform_forbidden: rascunho alterado fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_plan_version_no_mutation() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.saas_plan_version_feature_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_plan uuid; v_status text;
BEGIN
  SELECT plan_id,status INTO v_plan,v_status FROM public.saas_plan_versions WHERE id=COALESCE(NEW.plan_version_id,OLD.plan_version_id);
  IF v_status <> 'DRAFT' THEN RAISE EXCEPTION 'saas_version_immutable: conteúdo publicado não pode ser alterado'; END IF;
  IF session_user='authenticator' AND NOT platform_private.has_ticket('saas_plan_version_write',v_plan) THEN
    RAISE EXCEPTION 'platform_forbidden: conteúdo alterado fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN COALESCE(NEW,OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.saas_plan_version_feature_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS saas_plan_version_feature_guard_trg ON public.saas_plan_version_features;
CREATE TRIGGER saas_plan_version_feature_guard_trg BEFORE INSERT OR UPDATE OR DELETE ON public.saas_plan_version_features FOR EACH ROW EXECUTE FUNCTION public.saas_plan_version_feature_guard();

CREATE OR REPLACE FUNCTION public.platform_validate_plan_version_draft(_draft_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v public.saas_plan_versions%ROWTYPE; v_missing text[]:=ARRAY[]::text[]; v_feature_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  SELECT * INTO v FROM public.saas_plan_versions WHERE id=_draft_id;
  IF NOT FOUND OR v.status<>'DRAFT' THEN RAISE EXCEPTION 'platform_invalid: rascunho inexistente' USING ERRCODE='22023'; END IF;
  SELECT count(*) INTO v_feature_count FROM public.saas_plan_version_features WHERE plan_version_id=v.id AND enabled;
  IF v.price_amount IS NULL THEN v_missing:=array_append(v_missing,'price_amount'); END IF;
  IF v.currency IS NULL OR v.currency !~ '^[A-Z]{3}$' THEN v_missing:=array_append(v_missing,'currency'); END IF;
  IF v.billing_cycle IS NULL THEN v_missing:=array_append(v_missing,'billing_cycle'); END IF;
  IF v.trial_days IS NULL THEN v_missing:=array_append(v_missing,'trial_days'); END IF;
  IF v.effective_from IS NULL THEN v_missing:=array_append(v_missing,'effective_from'); END IF;
  IF v.limits_snapshot IS NULL OR jsonb_typeof(v.limits_snapshot)<>'object' THEN v_missing:=array_append(v_missing,'limits'); END IF;
  IF v_feature_count=0 THEN v_missing:=array_append(v_missing,'features'); END IF;
  RETURN jsonb_build_object('complete',cardinality(v_missing)=0,'missing',to_jsonb(v_missing),'feature_count',v_feature_count,'revision',v.revision);
END;
$$;
REVOKE ALL ON FUNCTION public.platform_validate_plan_version_draft(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_validate_plan_version_draft(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_save_plan_version_draft(
  _draft_id uuid,_plan_key text,_price_amount numeric,_currency text,_billing_cycle text,
  _trial_days integer,_limits jsonb,_effective_from timestamptz,_features jsonb,_reason text,_idempotency_key uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v_plan public.saas_plans%ROWTYPE; v public.saas_plan_versions%ROWTYPE; v_id uuid; v_version integer; v_features jsonb; v_old jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  IF _reason IS NULL OR length(btrim(_reason))<5 OR _idempotency_key IS NULL THEN RAISE EXCEPTION 'platform_invalid: motivo e chave obrigatórios' USING ERRCODE='22023'; END IF;
  IF _price_amount IS NOT NULL AND _price_amount<0 THEN RAISE EXCEPTION 'platform_invalid: preço inválido'; END IF;
  IF nullif(upper(btrim(coalesce(_currency,''))),'') IS NOT NULL AND upper(btrim(_currency)) !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'platform_invalid: moeda inválida'; END IF;
  IF nullif(_billing_cycle,'') IS NOT NULL AND _billing_cycle NOT IN ('monthly','quarterly','semiannual','annual','custom') THEN RAISE EXCEPTION 'platform_invalid: ciclo inválido'; END IF;
  IF _trial_days IS NOT NULL AND (_trial_days<1 OR _trial_days>365) THEN RAISE EXCEPTION 'platform_invalid: período de teste inválido'; END IF;
  IF _limits IS NULL OR jsonb_typeof(_limits)<>'object' OR _features IS NULL OR jsonb_typeof(_features)<>'array' THEN RAISE EXCEPTION 'platform_invalid: limites ou funcionalidades inválidos'; END IF;
  SELECT a.plan_version_id INTO v_id FROM public.saas_plan_version_audit a WHERE a.action IN ('draft_created','draft_updated') AND a.idempotency_key=_idempotency_key;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT * INTO v_plan FROM public.saas_plans WHERE key=_plan_key AND active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_features) x LEFT JOIN public.saas_features f ON f.key=x->>'feature_key' WHERE f.id IS NULL OR f.active=false OR NOT EXISTS(SELECT 1 FROM public.saas_plan_features pf WHERE pf.plan_id=v_plan.id AND pf.feature_id=f.id)) THEN RAISE EXCEPTION 'platform_invalid: funcionalidade fora do plano'; END IF;
  IF _draft_id IS NULL THEN
    SELECT id INTO v_id FROM public.saas_plan_versions WHERE plan_id=v_plan.id AND status='DRAFT' FOR UPDATE;
    IF v_id IS NOT NULL THEN RAISE EXCEPTION 'platform_conflict: já existe rascunho para este plano' USING ERRCODE='40001'; END IF;
    SELECT coalesce(max(version_number),0)+1 INTO v_version FROM public.saas_plan_versions WHERE plan_id=v_plan.id;
    PERFORM platform_private.issue_ticket('saas_plan_version_create',v_plan.id);
    INSERT INTO public.saas_plan_versions(plan_id,version_number,name_snapshot,description_snapshot,price_amount,currency,billing_cycle,trial_days,limits_snapshot,features_snapshot,effective_from,published_at,created_by,publication_reason,correlation_id,status,draft_key)
    VALUES(v_plan.id,v_version,v_plan.name,v_plan.description,_price_amount,nullif(upper(btrim(coalesce(_currency,''))),''),nullif(_billing_cycle,''),_trial_days,_limits,'[]'::jsonb,_effective_from,NULL,auth.uid(),NULL,NULL,'DRAFT',_idempotency_key) RETURNING id INTO v_id;
    v_old:=NULL;
  ELSE
    SELECT * INTO v FROM public.saas_plan_versions WHERE id=_draft_id AND plan_id=v_plan.id FOR UPDATE;
    IF NOT FOUND OR v.status<>'DRAFT' THEN RAISE EXCEPTION 'platform_invalid: rascunho inexistente'; END IF;
    v_id:=v.id; v_old:=to_jsonb(v);
    PERFORM platform_private.issue_ticket('saas_plan_version_write',v_plan.id);
    UPDATE public.saas_plan_versions SET price_amount=_price_amount,currency=nullif(upper(btrim(coalesce(_currency,''))),''),billing_cycle=nullif(_billing_cycle,''),trial_days=_trial_days,limits_snapshot=_limits,effective_from=_effective_from,revision=revision+1,updated_at=now() WHERE id=v_id;
    DELETE FROM public.saas_plan_version_features WHERE plan_version_id=v_id;
  END IF;
  PERFORM platform_private.issue_ticket('saas_plan_version_write',v_plan.id);
  INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled,limit_value,config)
  SELECT v_id,f.id,coalesce((x->>'enabled')::boolean,true),nullif(x->>'limit_value','')::numeric,x->'config' FROM jsonb_array_elements(_features) x JOIN public.saas_features f ON f.key=x->>'feature_key';
  SELECT coalesce(jsonb_agg(jsonb_build_object('feature_id',vf.feature_id,'enabled',vf.enabled,'limit_value',vf.limit_value,'config',vf.config) ORDER BY vf.feature_id::text),'[]'::jsonb) INTO v_features FROM public.saas_plan_version_features vf WHERE vf.plan_version_id=v_id;
  PERFORM platform_private.issue_ticket('saas_plan_version_write',v_plan.id);
  UPDATE public.saas_plan_versions SET features_snapshot=v_features,updated_at=now() WHERE id=v_id;
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key) VALUES(v_id,CASE WHEN _draft_id IS NULL THEN 'draft_created' ELSE 'draft_updated' END,v_old,(SELECT to_jsonb(z) FROM public.saas_plan_versions z WHERE z.id=v_id),btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_save_plan_version_draft(uuid,text,numeric,text,text,integer,jsonb,timestamptz,jsonb,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_save_plan_version_draft(uuid,text,numeric,text,text,integer,jsonb,timestamptz,jsonb,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_publish_plan_version_draft(_draft_id uuid,_reason text,_idempotency_key uuid,_confirmation text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v public.saas_plan_versions%ROWTYPE; v_check jsonb; v_old jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  IF _reason IS NULL OR length(btrim(_reason))<5 OR _idempotency_key IS NULL OR _confirmation<>'PUBLICAR' THEN RAISE EXCEPTION 'platform_invalid: confirmação, motivo e chave obrigatórios'; END IF;
  SELECT * INTO v FROM public.saas_plan_versions WHERE publish_key=_idempotency_key;
  IF FOUND THEN RETURN v.id; END IF;
  SELECT * INTO v FROM public.saas_plan_versions WHERE id=_draft_id FOR UPDATE;
  IF NOT FOUND OR v.status<>'DRAFT' THEN RAISE EXCEPTION 'platform_invalid: rascunho inexistente'; END IF;
  v_check:=public.platform_validate_plan_version_draft(v.id);
  IF NOT (v_check->>'complete')::boolean THEN RAISE EXCEPTION 'platform_invalid: versão comercial incompleta'; END IF;
  IF EXISTS(SELECT 1 FROM public.saas_plan_versions x WHERE x.plan_id=v.plan_id AND x.status='PUBLISHED' AND x.effective_from<=v.effective_from AND (x.effective_to IS NULL OR x.effective_to>v.effective_from)) THEN RAISE EXCEPTION 'platform_conflict: vigência sobreposta' USING ERRCODE='40001'; END IF;
  v_old:=to_jsonb(v);
  PERFORM platform_private.issue_ticket('saas_plan_version_write',v.plan_id);
  UPDATE public.saas_plan_versions SET status='PUBLISHED',published_at=now(),publication_reason=btrim(_reason),correlation_id=_idempotency_key,publish_key=_idempotency_key,updated_at=now() WHERE id=v.id;
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key) VALUES(v.id,'published',v_old,(SELECT to_jsonb(z) FROM public.saas_plan_versions z WHERE z.id=v.id),btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v.id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_publish_plan_version_draft(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_publish_plan_version_draft(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_archive_plan_version(_version_id uuid,_reason text,_idempotency_key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v public.saas_plan_versions%ROWTYPE; v_old jsonb; v_existing uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  IF _reason IS NULL OR length(btrim(_reason))<5 OR _idempotency_key IS NULL THEN RAISE EXCEPTION 'platform_invalid: motivo e chave obrigatórios'; END IF;
  SELECT plan_version_id INTO v_existing FROM public.saas_plan_version_audit WHERE action='archived' AND idempotency_key=_idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  SELECT * INTO v FROM public.saas_plan_versions WHERE id=_version_id FOR UPDATE;
  IF NOT FOUND OR v.status<>'PUBLISHED' THEN RAISE EXCEPTION 'platform_invalid: versão publicada inexistente'; END IF;
  IF EXISTS(SELECT 1 FROM public.organization_subscriptions s WHERE s.plan_version_id=v.id AND s.status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')) THEN RAISE EXCEPTION 'platform_conflict: versão possui assinatura corrente'; END IF;
  v_old:=to_jsonb(v);
  PERFORM platform_private.issue_ticket('saas_plan_version_archive',v.plan_id);
  UPDATE public.saas_plan_versions SET status='ARCHIVED',archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(_reason),updated_at=now() WHERE id=v.id;
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key) VALUES(v.id,'archived',v_old,(SELECT to_jsonb(z) FROM public.saas_plan_versions z WHERE z.id=v.id),btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v.id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_archive_plan_version(uuid,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.platform_archive_plan_version(uuid,text,uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.platform_publish_plan_version(text,numeric,text,text,jsonb,timestamptz,text,uuid) FROM authenticated;
REVOKE INSERT,UPDATE,DELETE ON public.saas_plan_versions FROM authenticated,anon;
REVOKE INSERT,UPDATE,DELETE ON public.saas_plan_version_features FROM authenticated,anon;
REVOKE INSERT,UPDATE,DELETE ON public.organization_feature_overrides FROM authenticated,anon;
REVOKE INSERT,UPDATE,DELETE ON public.organization_subscriptions FROM authenticated,anon;

CREATE TABLE public.saas_billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'test',
  provider_customer_ref text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_billing_customers_provider CHECK (provider IN ('mercado_pago','stripe','mock')),
  CONSTRAINT saas_billing_customers_environment CHECK (environment IN ('test','live')),
  CONSTRAINT saas_billing_customers_status CHECK (status IN ('inactive','active','blocked')),
  CONSTRAINT saas_billing_customers_metadata CHECK (jsonb_typeof(metadata)='object'),
  UNIQUE(provider,environment,provider_customer_ref), UNIQUE(organization_id,provider,environment)
);
GRANT ALL ON public.saas_billing_customers TO service_role;
ALTER TABLE public.saas_billing_customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_saas_billing_customers_org ON public.saas_billing_customers(organization_id);

CREATE TABLE public.saas_billing_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  subscription_id uuid NULL REFERENCES public.organization_subscriptions(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  billing_customer_id uuid NOT NULL REFERENCES public.saas_billing_customers(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  provider_contract_ref text NULL,
  status text NOT NULL DEFAULT 'non_operational',
  amount numeric(14,2) NULL,
  currency text NULL,
  billing_cycle text NULL,
  commercial_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_billing_contracts_status CHECK (status IN ('non_operational','pending','active','past_due','suspended','cancelled')),
  CONSTRAINT saas_billing_contracts_amount CHECK (amount IS NULL OR amount>=0),
  CONSTRAINT saas_billing_contracts_currency CHECK (currency IS NULL OR currency~'^[A-Z]{3}$'),
  CONSTRAINT saas_billing_contracts_snapshot CHECK (jsonb_typeof(commercial_snapshot)='object'),
  UNIQUE(billing_customer_id,provider_contract_ref)
);
GRANT ALL ON public.saas_billing_contracts TO service_role;
ALTER TABLE public.saas_billing_contracts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_saas_billing_contracts_org_status ON public.saas_billing_contracts(organization_id,status);

CREATE TABLE public.saas_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'test',
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  signature_status text NOT NULL,
  processing_status text NOT NULL DEFAULT 'received',
  aggregate_ref text NULL,
  sequence_number bigint NULL,
  payload_hash text NOT NULL,
  payload jsonb NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  next_retry_at timestamptz NULL,
  processed_at timestamptz NULL,
  last_error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_payment_events_provider CHECK (provider IN ('mercado_pago','stripe','mock')),
  CONSTRAINT saas_payment_events_environment CHECK (environment IN ('test','live')),
  CONSTRAINT saas_payment_events_signature CHECK (signature_status IN ('valid','invalid','unverified')),
  CONSTRAINT saas_payment_events_processing CHECK (processing_status IN ('received','ignored','pending','processed','failed','dead_letter')),
  CONSTRAINT saas_payment_events_payload CHECK (jsonb_typeof(payload)='object'),
  CONSTRAINT saas_payment_events_attempt CHECK (attempt_count BETWEEN 0 AND 20),
  UNIQUE(provider,environment,provider_event_id)
);
GRANT ALL ON public.saas_payment_events TO service_role;
ALTER TABLE public.saas_payment_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_saas_payment_events_retry ON public.saas_payment_events(processing_status,next_retry_at) WHERE processing_status IN ('pending','failed');
CREATE INDEX idx_saas_payment_events_aggregate_order ON public.saas_payment_events(provider,environment,aggregate_ref,sequence_number DESC);

CREATE TABLE public.saas_payment_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.saas_payment_events(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'held',
  attempt_count integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz NULL,
  completed_at timestamptz NULL,
  last_error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_payment_outbox_status CHECK (status IN ('held','pending','processing','completed','failed','dead_letter')),
  CONSTRAINT saas_payment_outbox_payload CHECK (jsonb_typeof(payload)='object'),
  CONSTRAINT saas_payment_outbox_attempt CHECK (attempt_count BETWEEN 0 AND 20),
  UNIQUE(event_id,topic)
);
GRANT ALL ON public.saas_payment_outbox TO service_role;
ALTER TABLE public.saas_payment_outbox ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_saas_payment_outbox_claim ON public.saas_payment_outbox(status,available_at) WHERE status IN ('pending','failed');

CREATE TABLE public.saas_payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NULL REFERENCES public.saas_payment_events(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  action text NOT NULL,
  old_values jsonb NULL,
  new_values jsonb NULL,
  reason text NOT NULL,
  origin text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT saas_payment_audit_values CHECK ((old_values IS NULL OR jsonb_typeof(old_values)='object') AND (new_values IS NULL OR jsonb_typeof(new_values)='object'))
);
GRANT ALL ON public.saas_payment_audit TO service_role;
ALTER TABLE public.saas_payment_audit ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_saas_payment_audit_event_created ON public.saas_payment_audit(event_id,created_at DESC);

CREATE OR REPLACE FUNCTION public.saas_payment_append_only()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$ BEGIN RAISE EXCEPTION 'payment_history_immutable'; END; $$;
REVOKE ALL ON FUNCTION public.saas_payment_append_only() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER saas_payment_events_no_delete BEFORE DELETE ON public.saas_payment_events FOR EACH ROW EXECUTE FUNCTION public.saas_payment_append_only();
CREATE TRIGGER saas_payment_audit_no_mutation BEFORE UPDATE OR DELETE ON public.saas_payment_audit FOR EACH ROW EXECUTE FUNCTION public.saas_payment_append_only();

CREATE OR REPLACE FUNCTION public.saas_ingest_payment_event_non_operational(
  _provider text,_environment text,_provider_event_id text,_event_type text,_occurred_at timestamptz,
  _signature_status text,_aggregate_ref text,_sequence_number bigint,_payload_hash text,_payload jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_role text; v_id uuid; v_latest bigint;
BEGIN
  v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF current_user<>'postgres' AND v_role<>'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF _provider NOT IN ('mercado_pago','stripe','mock') OR _environment NOT IN ('test','live') OR _provider_event_id IS NULL OR length(_provider_event_id)>255 OR _event_type IS NULL OR _occurred_at IS NULL OR _payload_hash IS NULL OR jsonb_typeof(_payload)<>'object' THEN RAISE EXCEPTION 'payment_invalid'; END IF;
  SELECT id INTO v_id FROM public.saas_payment_events WHERE provider=_provider AND environment=_environment AND provider_event_id=_provider_event_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT max(sequence_number) INTO v_latest FROM public.saas_payment_events WHERE provider=_provider AND environment=_environment AND aggregate_ref=_aggregate_ref AND processing_status IN ('pending','processed');
  INSERT INTO public.saas_payment_events(provider,environment,provider_event_id,event_type,occurred_at,signature_status,processing_status,aggregate_ref,sequence_number,payload_hash,payload)
  VALUES(_provider,_environment,_provider_event_id,_event_type,_occurred_at,_signature_status,CASE WHEN _signature_status<>'valid' THEN 'ignored' WHEN _sequence_number IS NOT NULL AND v_latest IS NOT NULL AND _sequence_number<=v_latest THEN 'ignored' ELSE 'pending' END,_aggregate_ref,_sequence_number,_payload_hash,_payload) RETURNING id INTO v_id;
  INSERT INTO public.saas_payment_audit(event_id,action,new_values,reason,origin) VALUES(v_id,'event_ingested',jsonb_build_object('processing_status',(SELECT processing_status FROM public.saas_payment_events WHERE id=v_id),'signature_status',_signature_status),CASE WHEN _signature_status<>'valid' THEN 'assinatura inválida; evento ignorado' WHEN _sequence_number IS NOT NULL AND v_latest IS NOT NULL AND _sequence_number<=v_latest THEN 'evento fora de ordem; evento ignorado' ELSE 'evento aceito em modo não operacional' END,'internal_non_operational');
  IF _signature_status='valid' AND NOT (_sequence_number IS NOT NULL AND v_latest IS NOT NULL AND _sequence_number<=v_latest) THEN
    INSERT INTO public.saas_payment_outbox(event_id,topic,payload,status) VALUES(v_id,'payment.reconcile',jsonb_build_object('event_id',v_id),'held');
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_ingest_payment_event_non_operational(text,text,text,text,timestamptz,text,text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_ingest_payment_event_non_operational(text,text,text,text,timestamptz,text,text,bigint,text,jsonb) TO service_role;

COMMIT;