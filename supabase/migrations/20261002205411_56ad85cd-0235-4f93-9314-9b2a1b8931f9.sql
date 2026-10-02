BEGIN;

ALTER TABLE public.platform_org_admin_invites
  DROP CONSTRAINT IF EXISTS platform_org_admin_invites_email_delivery_status_chk;
ALTER TABLE public.platform_org_admin_invites
  ADD CONSTRAINT platform_org_admin_invites_email_delivery_status_chk
  CHECK (email_delivery_status IN ('pending','sending','accepted','failed','ambiguous')) NOT VALID;
ALTER TABLE public.platform_org_admin_invites
  VALIDATE CONSTRAINT platform_org_admin_invites_email_delivery_status_chk;

CREATE OR REPLACE FUNCTION public.platform_claim_org_admin_provisioning(
  p_actor_id uuid,
  p_organization_id uuid,
  p_email text,
  p_nome text,
  p_cpf_cnpj text DEFAULT NULL,
  p_telefone text DEFAULT NULL,
  p_modo_acesso text DEFAULT 'link',
  p_responsavel_principal boolean DEFAULT true,
  p_confirm_ambiguous_email_retry boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
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
    UPDATE public.platform_org_admin_invites SET status='processando',lease_token=token,lease_expires_at=clock_timestamp()+interval '2 minutes',attempt_count=attempt_count+1,last_error_code=NULL,updated_at=now() WHERE id=j.id RETURNING * INTO j;
  ELSE
    INSERT INTO public.platform_org_admin_invites(organization_id,user_id,email,nome,cpf_cnpj,telefone,modo_acesso,responsavel_principal,invited_by,status,request_id,attempt_count,lease_token,lease_expires_at,updated_at)
    VALUES(p_organization_id,NULL,v_email,btrim(p_nome),v_cpf,v_tel,p_modo_acesso,p_responsavel_principal,p_actor_id,'processando',gen_random_uuid(),1,token,clock_timestamp()+interval '2 minutes',now()) RETURNING * INTO j;
  END IF;
  RETURN jsonb_build_object('job_id',j.id,'request_id',j.request_id,'status',j.status,'lease_token',token,'lease_expires_at',j.lease_expires_at,'user_id',j.user_id,'completed',false);
END $fn$;

CREATE OR REPLACE FUNCTION public.platform_claim_org_admin_email_delivery(
  p_job_id uuid,
  p_actor_id uuid,
  p_confirm_ambiguous_email_retry boolean DEFAULT false,
  p_cooldown_seconds integer DEFAULT 300
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE
  v_role text;
  j public.platform_org_admin_invites%ROWTYPE;
  v_token uuid:=gen_random_uuid();
  v_idempotency uuid;
  v_ambiguous boolean;
BEGIN
  v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role<>'service_role' OR p_actor_id IS NULL OR NOT public.is_platform_superadmin(p_actor_id) THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  IF p_cooldown_seconds<30 OR p_cooldown_seconds>86400 THEN RAISE EXCEPTION 'platform_invalid: cooldown inválido' USING ERRCODE='22023'; END IF;
  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: job inexistente' USING ERRCODE='22023'; END IF;
  IF j.modo_acesso<>'link' OR j.user_id IS NULL OR j.status NOT IN('pendente','ativo') THEN RAISE EXCEPTION 'platform_invalid: convite ainda não está pronto para envio' USING ERRCODE='22023'; END IF;
  v_ambiguous := j.email_delivery_status='ambiguous' OR (j.email_delivery_status='failed' AND j.email_last_error_code IN('email_unknown_error','email_send_ambiguous','email_accept_persistence_failed','email_timeout','email_network_error','email_send_crash','email_delivery_setup_failed'));
  IF v_ambiguous AND NOT coalesce(p_confirm_ambiguous_email_retry,false) THEN RAISE EXCEPTION 'email_ambiguous_confirmation_required' USING ERRCODE='P0001'; END IF;
  IF j.email_delivery_status='sending' AND j.email_lease_expires_at>clock_timestamp() THEN RAISE EXCEPTION 'platform_email_busy: envio já reservado' USING ERRCODE='55P03'; END IF;
  IF j.email_next_attempt_at>clock_timestamp() THEN RAISE EXCEPTION 'platform_email_cooldown: reenvio em cooldown' USING ERRCODE='55P03'; END IF;
  IF v_ambiguous THEN
    INSERT INTO public.comunicacao_audit_log(acao,entidade,entity_id,actor_id,before_state,after_state)
    VALUES('invite.email_ambiguous_retry_confirmed','platform_org_admin_invites',j.id,p_actor_id,
      jsonb_build_object('delivery_status',j.email_delivery_status,'safe_code',j.email_last_error_code),
      jsonb_build_object('confirmation','nao_recebimento_confirmado','next_action','retry_claimed'));
  END IF;
  v_idempotency:=CASE WHEN j.email_delivery_status='accepted' THEN gen_random_uuid() ELSE j.email_idempotency_key END;
  UPDATE public.platform_org_admin_invites SET email_delivery_status='sending',email_attempt_count=email_attempt_count+1,email_idempotency_key=v_idempotency,email_lease_token=v_token,email_lease_expires_at=clock_timestamp()+interval '2 minutes',email_last_attempt_at=now(),email_last_error_code=NULL,email_next_attempt_at=clock_timestamp()+make_interval(secs=>p_cooldown_seconds),updated_at=now() WHERE id=j.id;
  RETURN jsonb_build_object('job_id',j.id,'lease_token',v_token,'idempotency_key',v_idempotency,'recipient_email',lower(j.email),'recipient_name',j.nome);
END $fn$;

CREATE OR REPLACE FUNCTION public.platform_mark_org_admin_email_ambiguous(p_job_id uuid,p_lease_token uuid,p_error_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
DECLARE v_role text; j public.platform_org_admin_invites%ROWTYPE; v_code text;
BEGIN
  v_role:=coalesce(nullif(current_setting('request.jwt.claim.role',true),''),nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role<>'service_role' THEN RAISE EXCEPTION 'platform_forbidden' USING ERRCODE='42501'; END IF;
  v_code:=CASE WHEN p_error_code IN('email_send_ambiguous','email_accept_persistence_failed') THEN p_error_code ELSE 'email_send_ambiguous' END;
  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: job inexistente' USING ERRCODE='22023'; END IF;
  IF j.email_delivery_status<>'sending' OR j.email_lease_token IS DISTINCT FROM p_lease_token OR j.email_lease_expires_at IS NULL OR j.email_lease_expires_at<=clock_timestamp() THEN RAISE EXCEPTION 'platform_stale_lease: ambiguidade sem reserva vigente' USING ERRCODE='55P03'; END IF;
  UPDATE public.platform_org_admin_invites SET email_delivery_status='ambiguous',email_failed_at=now(),email_lease_token=NULL,email_lease_expires_at=NULL,email_last_error_code=v_code,updated_at=now() WHERE id=j.id AND email_lease_token=p_lease_token;
  RETURN jsonb_build_object('status','ambiguous','code',v_code);
END $fn$;

REVOKE ALL ON FUNCTION public.platform_claim_org_admin_provisioning(uuid,uuid,text,text,text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_claim_org_admin_provisioning(uuid,uuid,text,text,text,text,text,boolean,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_claim_org_admin_provisioning(uuid,uuid,text,text,text,text,text,boolean,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.platform_claim_org_admin_email_delivery(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.platform_claim_org_admin_email_delivery(uuid,uuid,boolean,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_claim_org_admin_email_delivery(uuid,uuid,boolean,integer) TO service_role;
REVOKE ALL ON FUNCTION public.platform_mark_org_admin_email_ambiguous(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.platform_mark_org_admin_email_ambiguous(uuid,uuid,text) TO service_role;

COMMIT;