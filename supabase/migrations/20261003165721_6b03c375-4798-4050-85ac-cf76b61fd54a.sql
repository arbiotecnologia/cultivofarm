CREATE OR REPLACE FUNCTION public.rpc_service_record_smtp_diagnostic(
  p_actor uuid,
  p_action text,
  p_outcome text,
  p_safe_code text,
  p_stage text,
  p_latency_ms integer DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_id bigint;
BEGIN
  IF p_actor IS NULL OR NOT public.is_platform_superadmin(p_actor) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_action NOT IN ('smtp_connection_test', 'smtp_connection_candidate_test', 'smtp_send_test') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;
  IF p_outcome NOT IN ('success', 'failure', 'ambiguous', 'blocked') THEN
    RAISE EXCEPTION 'invalid_outcome' USING ERRCODE = '22023';
  END IF;
  IF p_stage NOT IN ('connect', 'greeting', 'ehlo', 'starttls', 'auth', 'quit', 'send', 'response', 'preflight', 'config') THEN
    RAISE EXCEPTION 'invalid_stage' USING ERRCODE = '22023';
  END IF;
  IF p_safe_code NOT IN (
    'smtp_connection_ok', 'smtp_connect_timeout', 'smtp_connect_failed',
    'smtp_dns_failed', 'smtp_tcp_refused', 'smtp_tcp_unreachable',
    'smtp_tls_certificate_failed', 'smtp_tls_handshake_failed', 'smtp_tls_failed',
    'smtp_greeting_failed', 'smtp_ehlo_failed',
    'smtp_starttls_unavailable', 'smtp_starttls_failed',
    'smtp_auth_unsupported', 'smtp_auth_failed', 'smtp_protocol_error',
    'smtp_port_blocked_by_edge_runtime', 'smtp_config_invalid',
    'smtp_send_accepted', 'smtp_send_ambiguous', 'smtp_send_failed',
    'smtp_not_ready', 'rate_limited', 'candidate_not_applicable'
  ) THEN
    RAISE EXCEPTION 'invalid_safe_code' USING ERRCODE = '22023';
  END IF;
  IF p_latency_ms IS NOT NULL AND (p_latency_ms < 0 OR p_latency_ms > 300000) THEN
    RAISE EXCEPTION 'invalid_latency' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.communication_provider_settings_audit(
    actor_id, action, changed_fields, outcome, safe_code, stage, latency_ms
  ) VALUES (
    p_actor, p_action, '{}'::text[], p_outcome, p_safe_code, p_stage, p_latency_ms
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_service_record_smtp_diagnostic(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_service_record_smtp_diagnostic(uuid, text, text, text, text, integer) TO service_role;