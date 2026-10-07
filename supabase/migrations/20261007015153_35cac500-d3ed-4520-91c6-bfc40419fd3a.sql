-- Gestão segura de administradores provisionados (responsável, edição, e-mail).
CREATE TABLE IF NOT EXISTS public.platform_org_admin_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  target_user_id uuid,
  invite_id uuid,
  actor_user_id uuid,
  action text NOT NULL CHECK (action IN ('admin_profile_updated','principal_transferred','email_change_requested','email_change_completed','email_change_failed')),
  status text NOT NULL CHECK (status IN ('succeeded','requested','failed')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) >= 2),
  origin text NOT NULL,
  idempotency_key uuid NOT NULL,
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text CHECK (error_code IS NULL OR char_length(error_code) BETWEEN 1 AND 80),
  attempt integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_org_admin_audit_idem_uidx
  ON public.platform_org_admin_audit(action, idempotency_key) WHERE action <> 'email_change_failed';
CREATE INDEX IF NOT EXISTS platform_org_admin_audit_org_idx ON public.platform_org_admin_audit(organization_id, created_at DESC);
REVOKE ALL ON public.platform_org_admin_audit FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_org_admin_audit TO authenticated;
GRANT ALL ON public.platform_org_admin_audit TO service_role;
ALTER TABLE public.platform_org_admin_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_org_admin_audit_superadmin_read ON public.platform_org_admin_audit;
CREATE POLICY platform_org_admin_audit_superadmin_read ON public.platform_org_admin_audit
  FOR SELECT TO authenticated USING (public.is_platform_superadmin(auth.uid()));

CREATE OR REPLACE FUNCTION public.platform_org_admin_audit_no_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN RAISE EXCEPTION 'platform_org_admin_audit_immutable' USING ERRCODE='42501'; END $$;
DROP TRIGGER IF EXISTS platform_org_admin_audit_immutable ON public.platform_org_admin_audit;
CREATE TRIGGER platform_org_admin_audit_immutable BEFORE UPDATE OR DELETE ON public.platform_org_admin_audit
  FOR EACH ROW EXECUTE FUNCTION public.platform_org_admin_audit_no_mutation();
REVOKE ALL ON FUNCTION public.platform_org_admin_audit_no_mutation() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.platform_org_admin_email_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key uuid NOT NULL UNIQUE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  invite_id uuid NOT NULL REFERENCES public.platform_org_admin_invites(id),
  user_id uuid,
  invite_status_at_request text NOT NULL,
  old_email text NOT NULL,
  new_email text NOT NULL,
  reason text NOT NULL,
  actor_user_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('requested','auth_updated','completed','failed')),
  attempt_count integer NOT NULL DEFAULT 1,
  last_error_code text,
  sessions_revoked integer,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS platform_org_admin_email_changes_open_uidx
  ON public.platform_org_admin_email_changes(invite_id) WHERE status IN ('requested','auth_updated','failed');
REVOKE ALL ON public.platform_org_admin_email_changes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.platform_org_admin_email_changes TO authenticated;
GRANT ALL ON public.platform_org_admin_email_changes TO service_role;
ALTER TABLE public.platform_org_admin_email_changes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_org_admin_email_changes_superadmin_read ON public.platform_org_admin_email_changes;
CREATE POLICY platform_org_admin_email_changes_superadmin_read ON public.platform_org_admin_email_changes
  FOR SELECT TO authenticated USING (public.is_platform_superadmin(auth.uid()));

-- ===== Responsável principal =====
CREATE OR REPLACE FUNCTION platform_private.set_org_principal_admin_core(
  _org uuid, _user_id uuid, _motivo text, _expected_responsavel uuid, _idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE o public.organizations%ROWTYPE; a public.platform_org_admin_audit%ROWTYPE; v_motivo text; v_old uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  IF _idempotency_key IS NULL OR _org IS NULL OR _user_id IS NULL THEN
    RAISE EXCEPTION 'platform_invalid: parâmetros obrigatórios' USING ERRCODE='22023'; END IF;
  v_motivo := btrim(coalesce(_motivo,''));
  IF char_length(v_motivo) < 2 THEN RAISE EXCEPTION 'platform_invalid: motivo obrigatório (mínimo 2 caracteres)' USING ERRCODE='22023'; END IF;

  SELECT * INTO o FROM public.organizations WHERE id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: empresa inexistente' USING ERRCODE='22023'; END IF;

  SELECT * INTO a FROM public.platform_org_admin_audit WHERE action='principal_transferred' AND idempotency_key=_idempotency_key;
  IF FOUND THEN
    IF a.organization_id=_org AND a.target_user_id=_user_id AND a.reason=v_motivo THEN
      RETURN jsonb_build_object('organization_id',_org,'responsavel_user_id',_user_id,'idempotent',true); END IF;
    RAISE EXCEPTION 'platform_conflict: chave idempotente já usada com outro conteúdo' USING ERRCODE='40001';
  END IF;

  IF o.responsavel_user_id IS DISTINCT FROM _expected_responsavel THEN
    RAISE EXCEPTION 'platform_conflict: o responsável foi alterado por outra pessoa; recarregue' USING ERRCODE='40001'; END IF;
  IF o.responsavel_user_id = _user_id THEN
    RAISE EXCEPTION 'platform_invalid: este administrador já é o responsável principal' USING ERRCODE='22023'; END IF;
  IF public.is_platform_superadmin(_user_id)
     OR NOT EXISTS (SELECT 1 FROM public.platform_org_admin_invites i WHERE i.organization_id=_org AND i.user_id=_user_id AND i.status='ativo')
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=_user_id AND p.organization_id=_org AND p.ativo IS TRUE)
     OR NOT public.has_role(_user_id,'administrador'::public.app_role) THEN
    RAISE EXCEPTION 'platform_invalid: candidato precisa ser administrador ativo desta empresa' USING ERRCODE='22023'; END IF;

  v_old := o.responsavel_user_id;
  PERFORM platform_private.issue_ticket('org_write', _org);
  UPDATE public.organizations SET responsavel_user_id=_user_id, responsavel_definido_em=now(), updated_at=now() WHERE id=_org;
  UPDATE public.platform_org_admin_invites SET responsavel_principal = coalesce(user_id=_user_id,false), updated_at=now()
   WHERE organization_id=_org AND responsavel_principal IS DISTINCT FROM coalesce(user_id=_user_id,false);
  UPDATE public.profiles SET cargo = CASE WHEN user_id=_user_id THEN 'Responsável Principal' ELSE 'Administrador' END
   WHERE organization_id=_org AND user_id IN (_user_id, v_old) AND cargo IN ('Responsável Principal','Administrador')
     AND cargo IS DISTINCT FROM CASE WHEN user_id=_user_id THEN 'Responsável Principal' ELSE 'Administrador' END;

  INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,actor_user_id,action,status,reason,origin,idempotency_key,old_values,new_values)
  VALUES (_org,_user_id,auth.uid(),'principal_transferred','succeeded',v_motivo,'platform_rpc',_idempotency_key,
          jsonb_build_object('responsavel_user_id',v_old,'responsavel_definido_em',o.responsavel_definido_em),
          jsonb_build_object('responsavel_user_id',_user_id));
  RETURN jsonb_build_object('organization_id',_org,'responsavel_user_id',_user_id,'idempotent',false);
END $$;
REVOKE ALL ON FUNCTION platform_private.set_org_principal_admin_core(uuid,uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION platform_private.set_org_principal_admin_core(uuid,uuid,text,uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_org_principal_admin(
  _org uuid, _user_id uuid, _motivo text, _expected_responsavel uuid, _idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  RETURN platform_private.set_org_principal_admin_core(_org,_user_id,_motivo,_expected_responsavel,_idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.platform_set_org_principal_admin(uuid,uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_org_principal_admin(uuid,uuid,text,uuid,uuid) TO authenticated;

-- ===== Edição de dados básicos =====
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
  UPDATE public.platform_org_admin_invites SET nome=v_nome, telefone=v_tel, cpf_cnpj=v_cpf, updated_at=now()
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

CREATE OR REPLACE FUNCTION public.platform_update_org_admin(
  _invite_id uuid, _nome text, _telefone text, _cpf text, _motivo text, _expected_updated_at timestamptz, _idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql SET search_path TO '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_platform_superadmin(auth.uid()) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin' USING ERRCODE='42501'; END IF;
  RETURN platform_private.update_org_admin_core(_invite_id,_nome,_telefone,_cpf,_motivo,_expected_updated_at,_idempotency_key);
END $$;
REVOKE ALL ON FUNCTION public.platform_update_org_admin(uuid,text,text,text,text,timestamptz,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_org_admin(uuid,text,text,text,text,timestamptz,uuid) TO authenticated;

-- ===== Troca de e-mail (somente service_role, chamada pela Edge Function) =====
CREATE OR REPLACE FUNCTION platform_private.require_service_role()
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO '' AS $$
DECLARE v_role text;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
                     nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role <> 'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION platform_private.require_service_role() FROM PUBLIC, anon, authenticated;

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
    IF c.status='failed' THEN
      UPDATE public.platform_org_admin_email_changes SET status='requested', attempt_count=attempt_count+1, updated_at=now()
       WHERE id=c.id RETURNING * INTO c;
    END IF;
    RETURN jsonb_build_object('op_id',c.id,'status',c.status,'user_id',c.user_id,'old_email',c.old_email,'new_email',c.new_email,
      'invite_status',c.invite_status_at_request,'organization_id',c.organization_id,'attempt',c.attempt_count,'idempotent',true);
  END IF;

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

CREATE OR REPLACE FUNCTION public.platform_complete_org_admin_email_change(p_actor_id uuid, p_op_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c public.platform_org_admin_email_changes%ROWTYPE; j public.platform_org_admin_invites%ROWTYPE;
  v_auth_email text; v_sessions integer := 0;
BEGIN
  PERFORM platform_private.require_service_role();
  IF p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM public.platform_org_admin_email_changes WHERE id=p_op_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: operação' USING ERRCODE='22023'; END IF;
  IF c.status='completed' THEN
    RETURN jsonb_build_object('op_id',c.id,'status','completed','sessions_revoked',c.sessions_revoked,'invite_status',c.invite_status_at_request,'idempotent',true); END IF;
  IF c.status NOT IN ('requested','auth_updated') THEN RAISE EXCEPTION 'platform_conflict: operação não está pronta' USING ERRCODE='55P03'; END IF;
  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=c.invite_id FOR UPDATE;
  IF j.user_id IS DISTINCT FROM c.user_id OR lower(j.email)<>c.old_email THEN
    RAISE EXCEPTION 'platform_conflict: administrador alterado durante a operação' USING ERRCODE='40001'; END IF;

  IF c.user_id IS NOT NULL THEN
    SELECT lower(u.email) INTO v_auth_email FROM auth.users u WHERE u.id=c.user_id;
    IF v_auth_email IS DISTINCT FROM c.new_email THEN RAISE EXCEPTION 'platform_auth_not_updated' USING ERRCODE='55000'; END IF;
  END IF;

  UPDATE public.platform_org_admin_invites SET email=c.new_email, updated_at=now() WHERE id=j.id;
  IF j.status IN ('pendente','falhou') THEN
    UPDATE public.platform_org_admin_invites
       SET email_idempotency_key=gen_random_uuid(), email_delivery_status='pending', email_last_error_code=NULL,
           email_next_attempt_at=now(), email_lease_token=NULL, email_lease_expires_at=NULL, email_accepted_at=NULL, email_failed_at=NULL
     WHERE id=j.id;
  END IF;
  IF c.user_id IS NOT NULL THEN
    UPDATE public.profiles SET email=c.new_email WHERE user_id=c.user_id AND organization_id=c.organization_id;
    DELETE FROM auth.sessions s WHERE s.user_id=c.user_id;
    GET DIAGNOSTICS v_sessions = ROW_COUNT;
  END IF;

  UPDATE public.platform_org_admin_email_changes SET status='completed', sessions_revoked=v_sessions, completed_at=now(),
         last_error_code=NULL, updated_at=now() WHERE id=c.id;
  INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,old_values,new_values,attempt)
  VALUES (c.organization_id,c.user_id,c.invite_id,p_actor_id,'email_change_completed','succeeded',c.reason,'edge_platform_org_admin_email_change',c.idempotency_key,
          jsonb_build_object('email',c.old_email),jsonb_build_object('email',c.new_email,'sessions_revoked',v_sessions),c.attempt_count);
  RETURN jsonb_build_object('op_id',c.id,'status','completed','sessions_revoked',v_sessions,'invite_status',c.invite_status_at_request,'idempotent',false);
END $$;
REVOKE ALL ON FUNCTION public.platform_complete_org_admin_email_change(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_complete_org_admin_email_change(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_mark_org_admin_email_change(p_actor_id uuid, p_op_id uuid, p_status text, p_error_code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
DECLARE c public.platform_org_admin_email_changes%ROWTYPE;
BEGIN
  PERFORM platform_private.require_service_role();
  IF p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('auth_updated','failed') THEN RAISE EXCEPTION 'platform_invalid: status' USING ERRCODE='22023'; END IF;
  SELECT * INTO c FROM public.platform_org_admin_email_changes WHERE id=p_op_id FOR UPDATE;
  IF NOT FOUND OR c.status='completed' THEN RETURN; END IF;
  UPDATE public.platform_org_admin_email_changes
     SET status=p_status, last_error_code=CASE WHEN p_status='failed' THEN left(coalesce(p_error_code,'unknown'),80) ELSE NULL END, updated_at=now()
   WHERE id=c.id;
  IF p_status='failed' THEN
    INSERT INTO public.platform_org_admin_audit(organization_id,target_user_id,invite_id,actor_user_id,action,status,reason,origin,idempotency_key,old_values,new_values,error_code,attempt)
    VALUES (c.organization_id,c.user_id,c.invite_id,p_actor_id,'email_change_failed','failed',c.reason,'edge_platform_org_admin_email_change',c.idempotency_key,
            jsonb_build_object('email',c.old_email),jsonb_build_object('email',c.new_email),left(coalesce(p_error_code,'unknown'),80),c.attempt_count);
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.platform_mark_org_admin_email_change(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_mark_org_admin_email_change(uuid,uuid,text,text) TO service_role;