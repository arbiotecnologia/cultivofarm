BEGIN;

CREATE OR REPLACE FUNCTION public.platform_finalize_org_admin_provisioning(
  p_job_id uuid,
  p_lease_token uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  j public.platform_org_admin_invites%ROWTYPE;
  v_auth_email text;
  v_origin text;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'platform_forbidden: uso restrito ao backend' USING ERRCODE='42501';
  END IF;
  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: job inexistente'; END IF;
  IF j.status='ativo' AND j.user_id=p_user_id THEN
    RETURN jsonb_build_object('status','ativo','idempotent',true,'user_id',j.user_id);
  END IF;
  IF j.status<>'processando' OR j.lease_token IS DISTINCT FROM p_lease_token
     OR j.lease_expires_at IS NULL OR j.lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'platform_stale_lease: execução sem reserva vigente' USING ERRCODE='55P03';
  END IF;

  SELECT lower(u.email), coalesce(u.raw_app_meta_data->>'provisioning_request_id','')
    INTO v_auth_email,v_origin FROM auth.users u WHERE u.id=p_user_id;
  IF v_auth_email IS NULL OR v_auth_email<>lower(j.email) OR v_origin<>j.request_id::text THEN
    RAISE EXCEPTION 'platform_conflict: identidade Auth sem origem comprovada' USING ERRCODE='23505';
  END IF;
  IF public.is_platform_superadmin(p_user_id) THEN
    RAISE EXCEPTION 'platform_forbidden: superadmin não pode virar administrador operacional' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id=p_user_id AND p.organization_id IS DISTINCT FROM j.organization_id)
     OR EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id=p_user_id AND r.role<>'administrador'::public.app_role) THEN
    RAISE EXCEPTION 'platform_conflict: conta possui vínculos incompatíveis' USING ERRCODE='23505';
  END IF;

  INSERT INTO public.profiles AS p(user_id,nome,email,telefone,cargo,cpf_cnpj,ativo,organization_id,senha_provisoria)
  VALUES (p_user_id,j.nome,j.email,j.telefone,
    CASE WHEN j.responsavel_principal THEN 'Responsável Principal' ELSE 'Administrador' END,
    j.cpf_cnpj,true,j.organization_id,true)
  ON CONFLICT (user_id) DO UPDATE SET
    nome=excluded.nome,email=excluded.email,telefone=excluded.telefone,cargo=excluded.cargo,
    cpf_cnpj=excluded.cpf_cnpj,ativo=true,senha_provisoria=true,updated_at=now()
  WHERE p.organization_id=excluded.organization_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_conflict: perfil de outro tenant'; END IF;

  INSERT INTO public.user_roles(user_id,role) VALUES(p_user_id,'administrador'::public.app_role)
  ON CONFLICT (user_id,role) DO NOTHING;
  INSERT INTO platform_private.provisional_password_state(user_id)
  VALUES(p_user_id) ON CONFLICT(user_id) DO UPDATE SET desde=now(),pwd_digest=NULL;

  IF j.responsavel_principal THEN
    PERFORM platform_private.issue_ticket('org_write',j.organization_id);
    UPDATE public.organizations SET responsavel_user_id=p_user_id,
      responsavel_definido_em=now(),updated_at=now() WHERE id=j.organization_id;
  END IF;

  UPDATE public.platform_org_admin_invites
     SET user_id=p_user_id,status='pendente',auth_created_at=coalesce(auth_created_at,now()),
         lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=now()
   WHERE id=j.id AND lease_token=p_lease_token;
  RETURN jsonb_build_object('status','pendente','idempotent',false,'user_id',p_user_id);
END
$function$;

REVOKE ALL ON FUNCTION public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_finalize_org_admin_provisioning(uuid,uuid,uuid) TO service_role;

REVOKE ALL ON FUNCTION public.platform_claim_org_admin_provisioning(uuid,text,text,text,text,text,boolean) FROM PUBLIC, anon, authenticated, service_role;

COMMIT;