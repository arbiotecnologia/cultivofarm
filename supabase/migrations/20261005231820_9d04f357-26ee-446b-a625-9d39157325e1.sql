BEGIN;

ALTER TABLE public.saas_plan_versions
  ADD COLUMN publication_reason text NULL,
  ADD COLUMN correlation_id uuid NULL;
ALTER TABLE public.saas_plan_versions
  ADD CONSTRAINT saas_plan_versions_publication_reason_length CHECK (publication_reason IS NULL OR length(publication_reason) BETWEEN 5 AND 500);
CREATE UNIQUE INDEX uq_saas_plan_versions_correlation ON public.saas_plan_versions(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.platform_publish_plan_version(
  _plan_key text,_price_amount numeric,_currency text,_billing_cycle text,
  _limits jsonb,_effective_from timestamptz,_reason text,_correlation_id uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path TO '' AS $$
DECLARE v_plan public.saas_plans%ROWTYPE; v_id uuid; v_version integer; v_features jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  IF _reason IS NULL OR length(btrim(_reason))<5 OR _correlation_id IS NULL THEN RAISE EXCEPTION 'platform_invalid: motivo e correlação obrigatórios' USING ERRCODE='22023'; END IF;
  IF _price_amount IS NULL OR _price_amount<0 OR upper(btrim(coalesce(_currency,'')))!~'^[A-Z]{3}$'
     OR _billing_cycle NOT IN ('monthly','quarterly','semiannual','annual','custom')
     OR _limits IS NULL OR jsonb_typeof(_limits)<>'object' OR _effective_from IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: versão comercial incompleta' USING ERRCODE='22023';
  END IF;
  SELECT v.id INTO v_id FROM public.saas_plan_versions v WHERE v.correlation_id=_correlation_id;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  SELECT p.* INTO v_plan FROM public.saas_plans p WHERE p.key=_plan_key AND p.active FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: plano inexistente ou inativo' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.saas_plan_versions v WHERE v.plan_id=v_plan.id AND v.effective_from<=_effective_from AND (v.effective_to IS NULL OR v.effective_to>_effective_from)) THEN
    RAISE EXCEPTION 'platform_conflict: versão vigente não pode ser substituída' USING ERRCODE='40001';
  END IF;
  SELECT coalesce(max(v.version_number),0)+1 INTO v_version FROM public.saas_plan_versions v WHERE v.plan_id=v_plan.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('feature_id',pf.feature_id,'enabled',pf.enabled,'limit_value',pf.limit_value,'config',pf.config) ORDER BY pf.feature_id::text),'[]'::jsonb)
    INTO v_features FROM public.saas_plan_features pf WHERE pf.plan_id=v_plan.id;
  PERFORM platform_private.issue_ticket('saas_plan_version_create',v_plan.id);
  INSERT INTO public.saas_plan_versions(plan_id,version_number,name_snapshot,description_snapshot,price_amount,currency,billing_cycle,limits_snapshot,features_snapshot,effective_from,created_by,publication_reason,correlation_id)
  VALUES(v_plan.id,v_version,v_plan.name,v_plan.description,_price_amount,upper(btrim(_currency)),_billing_cycle,_limits,v_features,_effective_from,auth.uid(),btrim(_reason),_correlation_id) RETURNING id INTO v_id;
  INSERT INTO public.saas_plan_version_features(plan_version_id,feature_id,enabled,limit_value,config)
  SELECT v_id,pf.feature_id,pf.enabled,pf.limit_value,pf.config FROM public.saas_plan_features pf WHERE pf.plan_id=v_plan.id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_publish_plan_version(text,numeric,text,text,jsonb,timestamptz,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_publish_plan_version(text,numeric,text,text,jsonb,timestamptz,text,uuid) TO authenticated;

COMMIT;