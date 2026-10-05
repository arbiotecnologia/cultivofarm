CREATE OR REPLACE FUNCTION public.platform_claim_org_admin_provisioning(
  p_actor_id uuid,
  p_organization_id uuid,
  p_email text,
  p_nome text,
  p_cpf_cnpj text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_modo_acesso text DEFAULT 'link',
  p_responsavel_principal boolean DEFAULT true,
  p_confirm_ambiguous_email_retry boolean DEFAULT false,
  p_delivery_mode text DEFAULT 'email'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $fn$
DECLARE
  v_role text;
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_cpf text:=nullif(regexp_replace(coalesce(p_cpf_cnpj,''),'\D','','g'),'');
  v_tel text:=nullif(regexp_replace(coalesce(p_telefone,''),'\D','','g'),'');
  j public.platform_org_admin_invites%ROWTYPE;
  token uuid:=gen_random_uuid();
  v_ambiguous boolean;
BEGIN
  v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role<>'service_role' OR p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF p_delivery_mode NOT IN('email','manual_link') THEN RAISE EXCEPTION 'platform_invalid: delivery mode' USING ERRCODE='22023'; END IF;
  IF p_delivery_mode='manual_link' AND p_modo_acesso<>'link' THEN RAISE EXCEPTION 'platform_invalid: manual link requires link access' USING ERRCODE='22023'; END IF;
  IF p_organization_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=p_organization_id AND o.ativo IS TRUE) THEN RAISE EXCEPTION 'platform_invalid: empresa'; END IF;
  IF v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(v_email)>255 OR length(btrim(coalesce(p_nome,''))) NOT BETWEEN 3 AND 200 THEN RAISE EXCEPTION 'platform_invalid: identidade'; END IF;
  IF v_cpf IS NOT NULL AND length(v_cpf)<>11 THEN RAISE EXCEPTION 'platform_invalid: cpf'; END IF;
  IF v_tel IS NOT NULL AND length(v_tel) NOT IN(10,11) THEN RAISE EXCEPTION 'platform_invalid: telefone'; END IF;
  IF p_modo_acesso NOT IN('link','senha_temporaria') THEN RAISE EXCEPTION 'platform_invalid: modo'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_email,0));
  SELECT * INTO j FROM public.platform_org_admin_invites WHERE lower(email)=v_email FOR UPDATE;
  IF FOUND THEN
    IF j.organization_id<>p_organization_id THEN RAISE EXCEPTION 'platform_conflict: outro tenant' USING ERRCODE='23505'; END IF;
    IF j.status='ativo' THEN RETURN jsonb_build_object('job_id',j.id,'request_id',j.request_id,'status','ativo','user_id',j.user_id,'completed',true); END IF;
    IF j.lease_expires_at IS NOT NULL AND j.lease_expires_at>clock_timestamp() THEN RAISE EXCEPTION 'platform_conflict: em andamento' USING ERRCODE='55P03'; END IF;
    IF (j.nome,j.cpf_cnpj,j.telefone,j.modo_acesso,j.responsavel_principal) IS DISTINCT FROM (btrim(p_nome),v_cpf,v_tel,p_modo_acesso,p_responsavel_principal) THEN RAISE EXCEPTION 'platform_conflict: dados divergentes' USING ERRCODE='23505'; END IF;
    IF p_delivery_mode='email' THEN
      v_ambiguous := j.email_delivery_status='ambiguous' OR (
        j.email_delivery_status='failed' AND j.email_last_error_code IN (
          'email_unknown_error','email_send_ambiguous','email_accept_persistence_failed',
          'email_timeout','email_network_error','email_send_crash','email_delivery_setup_failed'
        )
      );
      IF v_ambiguous AND NOT coalesce(p_confirm_ambiguous_email_retry,false) THEN
        RAISE EXCEPTION 'email_ambiguous_confirmation_required' USING ERRCODE='P0001';
      END IF;
      IF j.email_next_attempt_at > clock_timestamp() THEN
        RAISE EXCEPTION 'platform_email_cooldown: reenvio em cooldown' USING ERRCODE='55P03';
      END IF;
    END IF;
    UPDATE public.platform_org_admin_invites
       SET status='processando',lease_token=token,lease_expires_at=clock_timestamp()+interval '2 minutes',attempt_count=attempt_count+1,last_error_code=NULL,updated_at=now()
     WHERE id=j.id RETURNING * INTO j;
  ELSE
    INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,cpf_cnpj,telefone,modo_acesso,responsavel_principal,invited_by,status,request_id,attempt_count,lease_token,lease_expires_at,updated_at)
    VALUES(p_organization_id,NULL,v_email,btrim(p_nome),v_cpf,v_tel,p_modo_acesso,p_responsavel_principal,p_actor_id,'processando',gen_random_uuid(),1,token,clock_timestamp()+interval '2 minutes',now()) RETURNING * INTO j;
  END IF;
  RETURN jsonb_build_object('job_id',j.id,'request_id',j.request_id,'status',j.status,'lease_token',token,'lease_expires_at',j.lease_expires_at,'user_id',j.user_id,'completed',false);
END
$fn$;

REVOKE ALL ON FUNCTION public.platform_claim_org_admin_provisioning(uuid,uuid,text,text,text,text,text,boolean,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_claim_org_admin_provisioning(uuid,uuid,text,text,text,text,text,boolean,boolean,text) TO service_role;