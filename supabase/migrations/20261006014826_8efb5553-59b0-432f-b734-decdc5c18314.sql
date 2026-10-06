BEGIN;

GRANT INSERT,UPDATE ON public.saas_plan_versions TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.saas_plan_version_features TO authenticated;
GRANT INSERT ON public.saas_plan_version_audit TO authenticated;

DROP POLICY IF EXISTS saas_plan_versions_platform_insert ON public.saas_plan_versions;
CREATE POLICY saas_plan_versions_platform_insert ON public.saas_plan_versions FOR INSERT TO authenticated WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())) AND created_by=(SELECT auth.uid()));
CREATE POLICY saas_plan_versions_platform_update ON public.saas_plan_versions FOR UPDATE TO authenticated USING (public.is_platform_superadmin((SELECT auth.uid()))) WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())));
DROP POLICY IF EXISTS saas_plan_version_features_platform_insert ON public.saas_plan_version_features;
CREATE POLICY saas_plan_version_features_platform_write ON public.saas_plan_version_features FOR ALL TO authenticated USING (public.is_platform_superadmin((SELECT auth.uid()))) WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())));
CREATE POLICY saas_plan_version_audit_platform_insert ON public.saas_plan_version_audit FOR INSERT TO authenticated WITH CHECK (public.is_platform_superadmin((SELECT auth.uid())) AND actor_user_id=(SELECT auth.uid()));

CREATE OR REPLACE FUNCTION public.saas_plan_version_audit_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_plan uuid;
BEGIN
  SELECT plan_id INTO v_plan FROM public.saas_plan_versions WHERE id=NEW.plan_version_id;
  IF session_user='authenticator' AND (v_plan IS NULL OR NOT platform_private.has_ticket('saas_plan_version_audit',v_plan)) THEN
    RAISE EXCEPTION 'platform_forbidden: auditoria gravada fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_plan_version_audit_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER saas_plan_version_audit_guard_trg BEFORE INSERT ON public.saas_plan_version_audit FOR EACH ROW EXECUTE FUNCTION public.saas_plan_version_audit_guard();
CREATE TRIGGER saas_plan_version_audit_no_mutation_trg BEFORE UPDATE OR DELETE ON public.saas_plan_version_audit FOR EACH ROW EXECUTE FUNCTION public.saas_payment_append_only();

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
  PERFORM platform_private.issue_ticket('saas_plan_version_audit',v_plan.id);
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key) VALUES(v_id,CASE WHEN _draft_id IS NULL THEN 'draft_created' ELSE 'draft_updated' END,v_old,(SELECT to_jsonb(z) FROM public.saas_plan_versions z WHERE z.id=v_id),btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v_id;
END;
$$;

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
  PERFORM platform_private.issue_ticket('saas_plan_version_audit',v.plan_id);
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key) VALUES(v.id,'published',v_old,(SELECT to_jsonb(z) FROM public.saas_plan_versions z WHERE z.id=v.id),btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v.id;
END;
$$;

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
  PERFORM platform_private.issue_ticket('saas_plan_version_audit',v.plan_id);
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key) VALUES(v.id,'archived',v_old,(SELECT to_jsonb(z) FROM public.saas_plan_versions z WHERE z.id=v.id),btrim(_reason),'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v.id;
END;
$$;

CREATE TABLE public.saas_payment_reconciliation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  environment text NOT NULL DEFAULT 'test',
  correlation_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'running',
  checked_count integer NOT NULL DEFAULT 0,
  mismatch_count integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  CONSTRAINT saas_payment_reconciliation_provider CHECK (provider IN ('mercado_pago','stripe','mock')),
  CONSTRAINT saas_payment_reconciliation_environment CHECK (environment IN ('test','live')),
  CONSTRAINT saas_payment_reconciliation_status CHECK (status IN ('running','completed','failed')),
  UNIQUE(provider,environment,correlation_id)
);
GRANT ALL ON public.saas_payment_reconciliation_runs TO service_role;
ALTER TABLE public.saas_payment_reconciliation_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_payment_reconciliation_runs_service_only ON public.saas_payment_reconciliation_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.saas_payment_reconciliation_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.saas_payment_reconciliation_runs(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  event_id uuid NULL REFERENCES public.saas_payment_events(id) ON UPDATE RESTRICT ON DELETE RESTRICT,
  aggregate_ref text NULL,
  local_status text NOT NULL,
  provider_status text NOT NULL,
  resolution_status text NOT NULL DEFAULT 'open',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz NULL,
  CONSTRAINT saas_payment_reconciliation_resolution CHECK (resolution_status IN ('open','accepted','corrected','ignored')),
  CONSTRAINT saas_payment_reconciliation_details CHECK (jsonb_typeof(details)='object')
);
GRANT ALL ON public.saas_payment_reconciliation_findings TO service_role;
ALTER TABLE public.saas_payment_reconciliation_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY saas_payment_reconciliation_findings_service_only ON public.saas_payment_reconciliation_findings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX idx_saas_payment_reconciliation_findings_run ON public.saas_payment_reconciliation_findings(run_id,resolution_status);

CREATE OR REPLACE FUNCTION public.saas_claim_payment_outbox_non_operational(_worker_id text,_limit integer DEFAULT 20)
RETURNS SETOF public.saas_payment_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_role text;
BEGIN
  v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF current_user<>'postgres' AND v_role<>'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF _worker_id IS NULL OR length(btrim(_worker_id))<3 OR _limit<1 OR _limit>100 THEN RAISE EXCEPTION 'payment_invalid'; END IF;
  RETURN QUERY SELECT * FROM public.saas_payment_outbox WHERE false;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_claim_payment_outbox_non_operational(text,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_claim_payment_outbox_non_operational(text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.saas_record_payment_retry_non_operational(_event_id uuid,_error_code text,_next_retry_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE v_role text; v_old jsonb; v_new jsonb;
BEGIN
  v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF current_user<>'postgres' AND v_role<>'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF _error_code IS NULL OR length(_error_code)>80 OR _next_retry_at IS NULL OR _next_retry_at<=now() THEN RAISE EXCEPTION 'payment_invalid'; END IF;
  SELECT to_jsonb(e) INTO v_old FROM public.saas_payment_events e WHERE e.id=_event_id FOR UPDATE;
  IF v_old IS NULL THEN RAISE EXCEPTION 'payment_invalid'; END IF;
  UPDATE public.saas_payment_events SET attempt_count=attempt_count+1,processing_status=CASE WHEN attempt_count+1>=20 THEN 'dead_letter' ELSE 'failed' END,next_retry_at=CASE WHEN attempt_count+1>=20 THEN NULL ELSE _next_retry_at END,last_error_code=_error_code WHERE id=_event_id RETURNING to_jsonb(saas_payment_events.*) INTO v_new;
  INSERT INTO public.saas_payment_audit(event_id,action,old_values,new_values,reason,origin) VALUES(_event_id,'retry_recorded',v_old,v_new,'falha sanitizada registrada para nova tentativa','internal_non_operational');
  RETURN _event_id;
END;
$$;
REVOKE ALL ON FUNCTION public.saas_record_payment_retry_non_operational(uuid,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.saas_record_payment_retry_non_operational(uuid,text,timestamptz) TO service_role;

COMMIT;