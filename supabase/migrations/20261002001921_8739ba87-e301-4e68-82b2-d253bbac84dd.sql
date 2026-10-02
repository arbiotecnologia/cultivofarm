BEGIN;

ALTER TABLE public.platform_org_admin_invites
  ALTER COLUMN user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS request_id uuid,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS auth_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error_code text;

UPDATE public.platform_org_admin_invites
SET request_id = COALESCE(request_id, gen_random_uuid()),
    updated_at = COALESCE(concluido_em, created_at, now())
WHERE request_id IS NULL;

ALTER TABLE public.platform_org_admin_invites
  ALTER COLUMN request_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS platform_org_admin_invites_request_uidx
  ON public.platform_org_admin_invites(request_id);
CREATE INDEX IF NOT EXISTS platform_org_admin_invites_lease_idx
  ON public.platform_org_admin_invites(status, lease_expires_at)
  WHERE status IN ('pendente','processando','falhou');

ALTER TABLE public.platform_org_admin_invites
  DROP CONSTRAINT IF EXISTS platform_org_admin_invites_status_chk;
ALTER TABLE public.platform_org_admin_invites
  ADD CONSTRAINT platform_org_admin_invites_status_chk
  CHECK (status IN ('pendente','processando','falhou','ativo')) NOT VALID;
ALTER TABLE public.platform_org_admin_invites
  VALIDATE CONSTRAINT platform_org_admin_invites_status_chk;

CREATE OR REPLACE FUNCTION public.platform_claim_org_admin_provisioning(
  p_organization_id uuid,
  p_email text,
  p_nome text,
  p_cpf_cnpj text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_modo_acesso text DEFAULT 'link',
  p_responsavel_principal boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_email text := lower(btrim(coalesce(p_email,'')));
  v_cpf text := nullif(regexp_replace(coalesce(p_cpf_cnpj,''), '\D', '', 'g'),'');
  v_tel text := nullif(regexp_replace(coalesce(p_telefone,''), '\D', '', 'g'),'');
  v_row public.platform_org_admin_invites%ROWTYPE;
  v_token uuid := gen_random_uuid();
BEGIN
  IF v_actor IS NULL OR NOT public.is_platform_superadmin(v_actor) THEN
    RAISE EXCEPTION 'platform_forbidden: apenas superadmin de plataforma' USING ERRCODE='42501';
  END IF;
  IF p_organization_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id AND o.ativo IS TRUE
  ) THEN RAISE EXCEPTION 'platform_invalid: empresa inexistente ou inativa'; END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_email)>255
     OR length(btrim(coalesce(p_nome,''))) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'platform_invalid: nome ou e-mail inválido';
  END IF;
  IF v_cpf IS NOT NULL AND length(v_cpf)<>11 THEN RAISE EXCEPTION 'platform_invalid: cpf'; END IF;
  IF v_tel IS NOT NULL AND length(v_tel) NOT IN (10,11) THEN RAISE EXCEPTION 'platform_invalid: telefone'; END IF;
  IF p_modo_acesso NOT IN ('link','senha_temporaria') THEN RAISE EXCEPTION 'platform_invalid: modo'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_email, 0));
  SELECT * INTO v_row FROM public.platform_org_admin_invites WHERE lower(email)=v_email FOR UPDATE;

  IF FOUND THEN
    IF v_row.organization_id <> p_organization_id THEN
      RAISE EXCEPTION 'platform_conflict: e-mail já vinculado a outra empresa' USING ERRCODE='23505';
    END IF;
    IF v_row.status='ativo' THEN
      RETURN jsonb_build_object('job_id',v_row.id,'request_id',v_row.request_id,'status','ativo','user_id',v_row.user_id,'completed',true);
    END IF;
    IF v_row.lease_expires_at IS NOT NULL AND v_row.lease_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION 'platform_conflict: provisionamento em andamento' USING ERRCODE='55P03';
    END IF;
    IF (v_row.nome, v_row.cpf_cnpj, v_row.telefone, v_row.modo_acesso, v_row.responsavel_principal)
       IS DISTINCT FROM (btrim(p_nome), v_cpf, v_tel, p_modo_acesso, p_responsavel_principal) THEN
      RAISE EXCEPTION 'platform_conflict: dados divergentes para o mesmo e-mail' USING ERRCODE='23505';
    END IF;
    UPDATE public.platform_org_admin_invites
       SET status='processando', lease_token=v_token,
           lease_expires_at=clock_timestamp()+interval '2 minutes',
           attempt_count=attempt_count+1, last_error_code=NULL, updated_at=now()
     WHERE id=v_row.id
     RETURNING * INTO v_row;
  ELSE
    INSERT INTO public.platform_org_admin_invites(
      organization_id,user_id,email,nome,cpf_cnpj,telefone,modo_acesso,
      responsavel_principal,invited_by,status,request_id,attempt_count,
      lease_token,lease_expires_at,updated_at)
    VALUES (
      p_organization_id,NULL,v_email,btrim(p_nome),v_cpf,v_tel,p_modo_acesso,
      p_responsavel_principal,v_actor,'processando',gen_random_uuid(),1,
      v_token,clock_timestamp()+interval '2 minutes',now())
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('job_id',v_row.id,'request_id',v_row.request_id,
    'status',v_row.status,'lease_token',v_token,'lease_expires_at',v_row.lease_expires_at,
    'user_id',v_row.user_id,'completed',false);
END
$function$;

REVOKE ALL ON FUNCTION public.platform_claim_org_admin_provisioning(uuid,text,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_claim_org_admin_provisioning(uuid,text,text,text,text,text,boolean) TO authenticated;

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

  SELECT lower(u.email), coalesce(u.raw_user_meta_data->>'provisioning_request_id','')
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

CREATE OR REPLACE FUNCTION public.platform_fail_org_admin_provisioning(
  p_job_id uuid,p_lease_token uuid,p_error_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE v_role text;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role<>'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  UPDATE public.platform_org_admin_invites SET status='falhou',lease_token=NULL,lease_expires_at=NULL,
    last_error_code=left(coalesce(p_error_code,'unknown'),40),updated_at=now()
  WHERE id=p_job_id AND status='processando' AND lease_token=p_lease_token;
  RETURN FOUND;
END
$function$;
REVOKE ALL ON FUNCTION public.platform_fail_org_admin_provisioning(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_fail_org_admin_provisioning(uuid,uuid,text) TO service_role;

-- O caminho antigo baseado em digest/MD5 permanece apenas como objeto histórico inacessível.
REVOKE ALL ON FUNCTION platform_private.conclude_provisional_password() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.platform_conclude_provisional_password() FROM PUBLIC, anon, authenticated, service_role;

COMMIT;