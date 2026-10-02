BEGIN;

ALTER TABLE public.platform_org_admin_invites
  ADD COLUMN IF NOT EXISTS email_delivery_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS email_attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS email_lease_token uuid,
  ADD COLUMN IF NOT EXISTS email_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS email_last_error_code text;

ALTER TABLE public.platform_org_admin_invites
  DROP CONSTRAINT IF EXISTS platform_org_admin_invites_email_delivery_status_chk;
ALTER TABLE public.platform_org_admin_invites
  ADD CONSTRAINT platform_org_admin_invites_email_delivery_status_chk
  CHECK (email_delivery_status IN ('pending','sending','accepted','failed')) NOT VALID;
ALTER TABLE public.platform_org_admin_invites
  VALIDATE CONSTRAINT platform_org_admin_invites_email_delivery_status_chk;

ALTER TABLE public.platform_org_admin_invites
  DROP CONSTRAINT IF EXISTS platform_org_admin_invites_email_attempt_count_chk;
ALTER TABLE public.platform_org_admin_invites
  ADD CONSTRAINT platform_org_admin_invites_email_attempt_count_chk
  CHECK (email_attempt_count BETWEEN 0 AND 50) NOT VALID;
ALTER TABLE public.platform_org_admin_invites
  VALIDATE CONSTRAINT platform_org_admin_invites_email_attempt_count_chk;

ALTER TABLE public.platform_org_admin_invites
  DROP CONSTRAINT IF EXISTS platform_org_admin_invites_email_error_code_chk;
ALTER TABLE public.platform_org_admin_invites
  ADD CONSTRAINT platform_org_admin_invites_email_error_code_chk
  CHECK (email_last_error_code IS NULL OR length(email_last_error_code) BETWEEN 1 AND 80) NOT VALID;
ALTER TABLE public.platform_org_admin_invites
  VALIDATE CONSTRAINT platform_org_admin_invites_email_error_code_chk;

CREATE INDEX IF NOT EXISTS platform_org_admin_invites_email_delivery_idx
  ON public.platform_org_admin_invites(email_delivery_status, email_next_attempt_at, email_lease_expires_at)
  WHERE modo_acesso = 'link' AND email_delivery_status IN ('pending','sending','failed');

CREATE OR REPLACE FUNCTION public.platform_claim_org_admin_email_delivery(
  p_job_id uuid,
  p_cooldown_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  j public.platform_org_admin_invites%ROWTYPE;
  v_token uuid := gen_random_uuid();
  v_idempotency uuid;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'platform_forbidden: uso restrito ao backend' USING ERRCODE='42501';
  END IF;
  IF p_cooldown_seconds < 30 OR p_cooldown_seconds > 86400 THEN
    RAISE EXCEPTION 'platform_invalid: cooldown inválido' USING ERRCODE='22023';
  END IF;

  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: job inexistente' USING ERRCODE='22023'; END IF;
  IF j.modo_acesso <> 'link' OR j.user_id IS NULL OR j.status NOT IN ('pendente','ativo') THEN
    RAISE EXCEPTION 'platform_invalid: convite ainda não está pronto para envio' USING ERRCODE='22023';
  END IF;
  IF j.email_delivery_status='sending' AND j.email_lease_expires_at > clock_timestamp() THEN
    RAISE EXCEPTION 'platform_email_busy: envio já reservado' USING ERRCODE='55P03';
  END IF;
  IF j.email_next_attempt_at > clock_timestamp() THEN
    RAISE EXCEPTION 'platform_email_cooldown: reenvio em cooldown' USING ERRCODE='55P03';
  END IF;

  v_idempotency := CASE
    WHEN j.email_delivery_status='accepted' THEN gen_random_uuid()
    ELSE j.email_idempotency_key
  END;

  UPDATE public.platform_org_admin_invites
     SET email_delivery_status='sending',
         email_attempt_count=email_attempt_count+1,
         email_idempotency_key=v_idempotency,
         email_lease_token=v_token,
         email_lease_expires_at=clock_timestamp()+interval '2 minutes',
         email_last_attempt_at=now(),
         email_last_error_code=NULL,
         email_next_attempt_at=clock_timestamp()+make_interval(secs=>p_cooldown_seconds),
         updated_at=now()
   WHERE id=j.id;

  RETURN jsonb_build_object(
    'job_id',j.id,
    'lease_token',v_token,
    'idempotency_key',v_idempotency,
    'recipient_email',lower(j.email),
    'recipient_name',j.nome
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_accept_org_admin_email_delivery(
  p_job_id uuid,
  p_lease_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  j public.platform_org_admin_invites%ROWTYPE;
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'platform_forbidden: uso restrito ao backend' USING ERRCODE='42501';
  END IF;
  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: job inexistente' USING ERRCODE='22023'; END IF;
  IF j.email_delivery_status='accepted' THEN
    RETURN jsonb_build_object('status','accepted','idempotent',true);
  END IF;
  IF j.email_delivery_status<>'sending' OR j.email_lease_token IS DISTINCT FROM p_lease_token
     OR j.email_lease_expires_at IS NULL OR j.email_lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'platform_stale_lease: confirmação sem reserva vigente' USING ERRCODE='55P03';
  END IF;
  UPDATE public.platform_org_admin_invites
     SET email_delivery_status='accepted',email_accepted_at=now(),email_failed_at=NULL,
         email_lease_token=NULL,email_lease_expires_at=NULL,email_last_error_code=NULL,updated_at=now()
   WHERE id=j.id AND email_lease_token=p_lease_token;
  RETURN jsonb_build_object('status','accepted','idempotent',false);
END
$function$;

CREATE OR REPLACE FUNCTION public.platform_fail_org_admin_email_delivery(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_retry_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  v_role text;
  j public.platform_org_admin_invites%ROWTYPE;
  v_code text := left(regexp_replace(coalesce(nullif(btrim(p_error_code),''),'email_failed'),'[^a-zA-Z0-9_:-]','','g'),80);
BEGIN
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'role','');
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'platform_forbidden: uso restrito ao backend' USING ERRCODE='42501';
  END IF;
  IF p_retry_seconds < 30 OR p_retry_seconds > 86400 THEN
    RAISE EXCEPTION 'platform_invalid: retry inválido' USING ERRCODE='22023';
  END IF;
  SELECT * INTO j FROM public.platform_org_admin_invites WHERE id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'platform_invalid: job inexistente' USING ERRCODE='22023'; END IF;
  IF j.email_delivery_status<>'sending' OR j.email_lease_token IS DISTINCT FROM p_lease_token
     OR j.email_lease_expires_at IS NULL OR j.email_lease_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'platform_stale_lease: falha sem reserva vigente' USING ERRCODE='55P03';
  END IF;
  UPDATE public.platform_org_admin_invites
     SET email_delivery_status='failed',email_failed_at=now(),email_lease_token=NULL,
         email_lease_expires_at=NULL,email_last_error_code=v_code,
         email_next_attempt_at=clock_timestamp()+make_interval(secs=>p_retry_seconds),updated_at=now()
   WHERE id=j.id AND email_lease_token=p_lease_token;
  RETURN jsonb_build_object('status','failed','code',v_code);
END
$function$;

REVOKE ALL ON FUNCTION public.platform_claim_org_admin_email_delivery(uuid,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_accept_org_admin_email_delivery(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_fail_org_admin_email_delivery(uuid,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_claim_org_admin_email_delivery(uuid,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_accept_org_admin_email_delivery(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.platform_fail_org_admin_email_delivery(uuid,uuid,text,integer) TO service_role;

COMMIT;