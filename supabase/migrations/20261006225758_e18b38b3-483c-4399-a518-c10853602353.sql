-- Substituição segura de versão comercial publicada (v1 -> v2).
-- Rollback (forward-fix): restaurar as definições anteriores de
-- platform_private.issue_saas_plan_version_ticket, public.saas_plan_version_no_mutation
-- e public.platform_publish_plan_version_draft (migrations 20261006* anteriores).
-- Nenhum dado é alterado por esta migração.

CREATE OR REPLACE FUNCTION platform_private.issue_saas_plan_version_ticket(_scope text, _target uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE = '42501';
  END IF;
  IF _scope NOT IN ('saas_plan_version_create','saas_plan_version_write','saas_plan_version_audit',
                    'saas_plan_version_archive','saas_plan_version_supersede') THEN
    RAISE EXCEPTION 'platform_invalid: escopo de autorização inválido' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.saas_plans p WHERE p.id = _target) THEN
    RAISE EXCEPTION 'platform_invalid: plano inexistente' USING ERRCODE = '22023';
  END IF;
  INSERT INTO platform_private.authz_tickets(txid, scope, target)
  VALUES (txid_current(), _scope, _target) ON CONFLICT DO NOTHING;
END; $$;

CREATE OR REPLACE FUNCTION public.saas_plan_version_no_mutation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED','ARCHIVED') THEN
    IF OLD.status='PUBLISHED' AND NEW.status='ARCHIVED'
       AND platform_private.has_ticket('saas_plan_version_archive',OLD.plan_id) THEN RETURN NEW; END IF;
    -- Única alteração permitida em versão publicada: encerrar a vigência aberta
    -- pela publicação da sucessora, sem tocar em nenhum outro campo.
    IF OLD.status='PUBLISHED' AND NEW.status='PUBLISHED'
       AND OLD.effective_to IS NULL AND NEW.effective_to IS NOT NULL
       AND NEW.effective_to > OLD.effective_from
       AND (to_jsonb(NEW) - 'effective_to' - 'updated_at') = (to_jsonb(OLD) - 'effective_to' - 'updated_at')
       AND platform_private.has_ticket('saas_plan_version_supersede',OLD.plan_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'saas_version_immutable: versão publicada não pode ser alterada';
  END IF;
  IF OLD.status='DRAFT' AND NOT platform_private.has_ticket('saas_plan_version_write',OLD.plan_id) THEN
    RAISE EXCEPTION 'platform_forbidden: rascunho alterado fora do fluxo autorizado' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.platform_publish_plan_version_draft(
  _draft_id uuid, _reason text, _idempotency_key uuid, _confirmation text)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v public.saas_plan_versions%ROWTYPE;
  prev public.saas_plan_versions%ROWTYPE;
  v_check jsonb; v_reason text; v_open int; v_prev_new jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501';
  END IF;
  IF _confirmation IS DISTINCT FROM 'PUBLICAR' THEN
    RAISE EXCEPTION 'platform_invalid: confirmação inválida' USING ERRCODE='22023';
  END IF;
  IF _idempotency_key IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: chave idempotente obrigatória' USING ERRCODE='22023';
  END IF;
  v_reason := platform_private.normalize_commercial_reason(_reason);

  SELECT * INTO v FROM public.saas_plan_versions WHERE id=_draft_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: rascunho inexistente' USING ERRCODE='22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('saas_plan_version:' || v.plan_id::text,0));
  SELECT * INTO v FROM public.saas_plan_versions WHERE id=_draft_id FOR UPDATE;

  IF v.status='PUBLISHED' AND v.publish_key=_idempotency_key THEN RETURN v.id; END IF;
  IF EXISTS (SELECT 1 FROM public.saas_plan_versions x WHERE x.publish_key=_idempotency_key AND x.id<>v.id) THEN
    RAISE EXCEPTION 'platform_conflict: chave idempotente já usada em outra publicação' USING ERRCODE='40001';
  END IF;
  IF v.status <> 'DRAFT' THEN RAISE EXCEPTION 'platform_conflict: versão não está em rascunho' USING ERRCODE='40001'; END IF;

  v_check := public.platform_validate_plan_version_draft(v.id);
  IF NOT coalesce((v_check->>'complete')::boolean,false) OR NOT coalesce((v_check->>'valid')::boolean,false) THEN
    RAISE EXCEPTION 'platform_invalid: rascunho incompleto ou inválido' USING ERRCODE='22023';
  END IF;

  SELECT count(*) INTO v_open FROM public.saas_plan_versions
   WHERE plan_id=v.plan_id AND status='PUBLISHED' AND effective_to IS NULL;
  IF v_open > 1 THEN
    RAISE EXCEPTION 'platform_conflict: mais de uma versão vigente para o plano' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.saas_plan_versions x WHERE x.plan_id=v.plan_id AND x.status='PUBLISHED'
              AND x.effective_from >= v.effective_from) THEN
    RAISE EXCEPTION 'platform_conflict: início da vigência deve ser posterior ao da versão publicada anterior' USING ERRCODE='40001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.saas_plan_versions x WHERE x.plan_id=v.plan_id AND x.status='PUBLISHED'
              AND x.effective_to IS NOT NULL AND x.effective_to > v.effective_from) THEN
    RAISE EXCEPTION 'platform_conflict: vigência sobreposta' USING ERRCODE='40001';
  END IF;

  SELECT * INTO prev FROM public.saas_plan_versions
   WHERE plan_id=v.plan_id AND status='PUBLISHED' AND effective_to IS NULL FOR UPDATE;
  IF FOUND THEN
    PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_supersede',v.plan_id);
    UPDATE public.saas_plan_versions SET effective_to = v.effective_from WHERE id = prev.id;
    SELECT to_jsonb(x) INTO v_prev_new FROM public.saas_plan_versions x WHERE x.id=prev.id;
    PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_audit',v.plan_id);
    INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key)
    VALUES(prev.id,'superseded',to_jsonb(prev),v_prev_new || jsonb_build_object('superseded_by',v.id),
           v_reason,'platform_rpc',auth.uid(),_idempotency_key);
  END IF;

  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_write',v.plan_id);
  UPDATE public.saas_plan_versions SET status='PUBLISHED',published_at=now(),publication_reason=v_reason,
    publish_key=_idempotency_key WHERE id=v.id;
  PERFORM platform_private.issue_saas_plan_version_ticket('saas_plan_version_audit',v.plan_id);
  INSERT INTO public.saas_plan_version_audit(plan_version_id,action,old_values,new_values,reason,origin,actor_user_id,idempotency_key)
  VALUES(v.id,'published',to_jsonb(v),
         (SELECT to_jsonb(x) FROM public.saas_plan_versions x WHERE x.id=v.id) || jsonb_build_object('supersedes',prev.id),
         v_reason,'platform_rpc',auth.uid(),_idempotency_key);
  RETURN v.id;
END; $$;

REVOKE ALL ON FUNCTION public.platform_publish_plan_version_draft(uuid,text,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_publish_plan_version_draft(uuid,text,uuid,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION platform_private.issue_saas_plan_version_ticket(text,uuid) FROM PUBLIC, anon;
