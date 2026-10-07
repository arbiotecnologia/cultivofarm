ALTER TABLE public.platform_org_admin_email_changes DROP CONSTRAINT IF EXISTS platform_org_admin_email_changes_status_check;
ALTER TABLE public.platform_org_admin_email_changes ADD CONSTRAINT platform_org_admin_email_changes_status_check
  CHECK (status IN ('requested','auth_updated','completed','failed','cancelled'));

CREATE OR REPLACE FUNCTION platform_private.update_org_admin_core(
  _invite_id uuid, _nome text, _telefone text, _cpf text, _motivo text, _expected_updated_at timestamptz, _idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE j public.platform_org_admin_invites%ROWTYPE; a public.platform_org_admin_audit%ROWTYPE;
  v_motivo text; v_nome text; v_tel text; v_cpf text; v_old jsonb; v_new jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  IF _idempotency_key IS NULL OR _invite_id IS NULL THEN RAISE EXCEPTION 'platform_invalid: parâmetros obrigatórios' USING ERRCODE='22023'; END IF;
  v_motivo := btrim(coalesce(_motivo,''));
  IF char_length(v_motivo) < 2 THEN RAISE EXCEPTION 'platform_invalid: motivo obrigatório (mínimo 2 caracteres)' USING ERRCODE='22023'; END IF;
  v_nome := regexp_replace(btrim(coalesce(_nome,'')), '\s+', ' ', 'g');
  v_tel := nullif(regexp_replace(coalesce(_telefone,''),'\D','','g'),'');
  v_cpf := nullif(regexp_replace(coalesce(_cpf,''),'\D','','g'),'');
  IF char_length(v_nome) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'platform_invalid: nome inválido' USING ERRCODE='22023'; END IF;
  IF v_tel IS NOT NULL AND length(v_tel) NOT IN (10,11) THEN RAISE EXCEPTION 'platform_invalid: telefone inválido' USING ERRCODE='22023'; END IF;
  IF v_cpf IS NOT NULL AND (length(v_cpf)<>11 OR v_cpf ~ '^(\d)\1{10}$') THEN RAISE EXCEPTION 'platform_invalid: CPF inválido' USING ERRCODE='22023'; END IF;

  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: administrador inexistente' USING ERRCODE='22023'; END IF;

  SELECT * INTO a FROM public.platform_org_admin_audit WHERE action='admin_profile_updated' AND idempotency_key=_idempotency_key;
  IF FOUND THEN
    IF a.invite_id=_invite_id AND a.reason=v_motivo AND a.new_values->>'nome' IS NOT DISTINCT FROM v_nome
       AND a.new_values->>'telefone' IS NOT DISTINCT FROM v_tel AND a.new_values->>'cpf_cnpj' IS NOT DISTINCT FROM v_cpf THEN
      RETURN jsonb_build_object('invite_id',_invite_id,'updated_at',j.updated_at,'idempotent',true); END IF;
    RAISE EXCEPTION 'platform_conflict: chave idempotente já usada com outro conteúdo' USING ERRCODE='40001';
  END IF;

  IF j.status='processando' OR (j.lease_expires_at IS NOT NULL AND j.lease_expires_at > clock_timestamp()) THEN
    RAISE EXCEPTION 'platform_conflict: provisionamento em andamento' USING ERRCODE='55P03'; END IF;
  IF _expected_updated_at IS NULL OR j.updated_at IS DISTINCT FROM _expected_updated_at THEN
    RAISE EXCEPTION 'platform_conflict: o administrador foi alterado por outra pessoa; recarregue antes de salvar' USING ERRCODE='40001'; END IF;
  IF j.user_id IS NOT NULL AND public.is_platform_superadmin(j.user_id) THEN
    RAISE EXCEPTION 'platform_forbidden: acesso de plataforma não é editável aqui' USING ERRCODE='42501'; END IF;
  IF v_cpf IS DISTINCT FROM j.cpf_cnpj AND j.status='ativo' AND j.cpf_cnpj IS NOT NULL THEN
    RAISE EXCEPTION 'platform_invalid: correção de CPF de administrador ativo exige fluxo específico' USING ERRCODE='22023'; END IF;
  IF (v_nome, v_tel, v_cpf) IS NOT DISTINCT FROM (j.nome, j.telefone, j.cpf_cnpj) THEN
    RAISE EXCEPTION 'platform_invalid: nenhuma alteração para salvar' USING ERRCODE='22023'; END IF;

  v_old := jsonb_build_object('nome',j.nome,'telefone',j.telefone,'cpf_cnpj',j.cpf_cnpj);
  UPDATE public.platform_org_admin_invites SET nome=v_nome, telefone=v_tel, cpf_cnpj=v_cpf,
         updated_at=greatest(clock_timestamp(), j.updated_at + interval '1 microsecond')
   WHERE id=_invite_id RETURNING * INTO j;
  IF j.user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=j.user_id AND p.organization_id IS DISTINCT FROM j.organization_id) THEN
      RAISE EXCEPTION 'platform_conflict: vínculo do perfil diverge da empresa' USING ERRCODE='40001'; END IF;
    UPDATE public.profiles SET nome=v_nome, telefone=v_tel, cpf_cnpj=v_cpf
     WHERE user_id=j.user_id AND organization_id=j.organization_id;
  END IF;
  v_new := jsonb_build_object('nome',v_nome,'telefone',v_tel,'cpf_cnpj',v_cpf);
  INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,old_values,new_values)
  VALUES (j.organization_id,j.user_id,_invite_id,auth.uid(),'admin_profile_updated','succeeded',v_motivo,'platform_rpc',_idempotency_key,v_old,v_new);
  RETURN jsonb_build_object('invite_id',_invite_id,'updated_at',j.updated_at,'idempotent',false);
END $$;
REVOKE ALL ON FUNCTION platform_private.update_org_admin_core(uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.update_org_admin_core(uuid,text,text,text,text,timestamptz,uuid) TO authenticated;

-- Cancela automaticamente uma troca falha somente se o Auth ainda mantém o e-mail antigo.
CREATE OR REPLACE FUNCTION platform_private.cancel_stale_email_change(p_invite_id uuid, p_actor_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c public.platform_org_admin_email_changes%ROWTYPE; v_auth text;
BEGIN
  SELECT * INTO c FROM public.platform_org_admin_email_changes WHERE invite_id=p_invite_id AND status='failed' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF c.user_id IS NOT NULL THEN
    SELECT lower(email) INTO v_auth FROM auth.users WHERE id=c.user_id;
    IF v_auth IS DISTINCT FROM c.old_email THEN RETURN; END IF;  -- Auth já mudou: exige reconciliação.
  END IF;
  UPDATE public.platform_org_admin_email_changes SET status='cancelled', updated_at=now() WHERE id=c.id;
  INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,old_values,new_values,error_code,attempt)
  VALUES (c.organization_id,c.user_id,c.invite_id,p_actor_id,'email_change_failed','failed',c.reason,'edge_platform_org_admin_email_change',c.idempotency_key,
          jsonb_build_object('email',c.old_email),jsonb_build_object('email',c.new_email),'superseded_by_new_request',c.attempt_count);
END $$;
REVOKE ALL ON FUNCTION platform_private.cancel_stale_email_change(uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_begin_org_admin_email_change(
  p_actor_id uuid, p_invite_id uuid, p_new_email text, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE j public.platform_org_admin_invites%ROWTYPE; c public.platform_org_admin_email_changes%ROWTYPE;
  v_email text := lower(btrim(coalesce(p_new_email,''))); v_reason text := btrim(coalesce(p_reason,''));
BEGIN
  PERFORM platform_private.require_service_role();
  IF p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL OR p_invite_id IS NULL THEN RAISE EXCEPTION 'platform_invalid: parâmetros' USING ERRCODE='22023'; END IF;
  IF char_length(v_reason) < 2 THEN RAISE EXCEPTION 'platform_invalid: motivo' USING ERRCODE='22023'; END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_email) > 254 THEN RAISE EXCEPTION 'platform_invalid: email' USING ERRCODE='22023'; END IF;

  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_invite_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: administrador' USING ERRCODE='22023'; END IF;

  SELECT * INTO c FROM public.platform_org_admin_email_changes WHERE idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF c.invite_id<>p_invite_id OR c.new_email<>v_email OR c.reason<>v_reason THEN
      RAISE EXCEPTION 'platform_conflict: chave idempotente já usada com outro conteúdo' USING ERRCODE='40001'; END IF;
    IF c.status='cancelled' THEN RAISE EXCEPTION 'platform_conflict: solicitação substituída' USING ERRCODE='40001'; END IF;
    IF c.status='failed' THEN
      UPDATE public.platform_org_admin_email_changes SET status='requested', attempt_count=attempt_count+1, updated_at=now()
       WHERE id=c.id RETURNING * INTO c;
    END IF;
    RETURN jsonb_build_object('op_id',c.id,'status',c.status,'user_id',c.user_id,'old_email',c.old_email,'new_email',c.new_email,
      'invite_status',c.invite_status_at_request,'organization_id',c.organization_id,'attempt',c.attempt_count,'idempotent',true);
  END IF;

  PERFORM platform_private.cancel_stale_email_change(p_invite_id, p_actor_id);
  IF EXISTS (SELECT 1 FROM public.platform_org_admin_email_changes x WHERE x.invite_id=p_invite_id AND x.status IN ('requested','auth_updated','failed')) THEN
    RAISE EXCEPTION 'platform_conflict: já existe mudança de e-mail pendente para este administrador' USING ERRCODE='55P03'; END IF;
  IF j.status='processando' OR (j.lease_expires_at IS NOT NULL AND j.lease_expires_at > clock_timestamp())
     OR j.email_delivery_status='sending' THEN
    RAISE EXCEPTION 'platform_conflict: provisionamento em andamento' USING ERRCODE='55P03'; END IF;
  IF j.user_id IS NOT NULL AND public.is_platform_superadmin(j.user_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF j.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=j.user_id AND p.organization_id=j.organization_id) THEN
    RAISE EXCEPTION 'platform_conflict: vínculo do perfil diverge da empresa' USING ERRCODE='40001'; END IF;
  IF lower(j.email)=v_email THEN RAISE EXCEPTION 'platform_invalid: e-mail igual ao atual' USING ERRCODE='22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.platform_org_admin_invites i WHERE lower(i.email)=v_email)
     OR EXISTS (SELECT 1 FROM public.profiles p WHERE lower(p.email)=v_email AND p.user_id IS DISTINCT FROM j.user_id)
     OR EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email)=v_email AND u.id IS DISTINCT FROM j.user_id)
     OR EXISTS (SELECT 1 FROM public.platform_org_admin_email_changes x WHERE x.new_email=v_email AND x.status IN ('requested','auth_updated','failed')) THEN
    RAISE EXCEPTION 'platform_email_in_use' USING ERRCODE='23505'; END IF;

  INSERT INTO public.platform_org_admin_email_changes(idempotency_key,organization_id,invite_id,user_id,invite_status_at_request,old_email,new_email,reason,actor_user_id,status)
  VALUES (p_idempotency_key,j.organization_id,j.id,j.user_id,j.status,lower(j.email),v_email,v_reason,p_actor_id,'requested') RETURNING * INTO c;
  INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,old_values,new_values)
  VALUES (j.organization_id,j.user_id,j.id,p_actor_id,'email_change_requested','requested',v_reason,'edge_platform_org_admin_email_change',p_idempotency_key,
          jsonb_build_object('email',lower(j.email),'invite_status',j.status),jsonb_build_object('email',v_email));
  RETURN jsonb_build_object('op_id',c.id,'status',c.status,'user_id',c.user_id,'old_email',c.old_email,'new_email',c.new_email,
    'invite_status',c.invite_status_at_request,'organization_id',c.organization_id,'attempt',c.attempt_count,'idempotent',false);
END $$;
REVOKE ALL ON FUNCTION public.platform_begin_org_admin_email_change(uuid,uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_begin_org_admin_email_change(uuid,uuid,text,text,uuid) TO service_role;