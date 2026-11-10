"""Wrappers canônicos fiscais da previsão e composição única B4+previsão do crédito.

REVIEW_ONLY_INACTIVE_NOT_APPROVED. Somente gera SQL; nunca executa em banco hospedado.

Ordem de instalação explícita (produção e ensaio):
  previsão 01-04 (não toca crédito) -> B4 PRE/INSTALL/POST (crédito LIVE 213ac31f -> B4 44e8768f)
  -> 09-12 composição de crédito (B4 44e8768f -> corpo único composto)
  -> ponte/strict -> 05-08 reconciliação fiscal + wrappers -> bridge-audit -> H7.
O instalador B4 nunca roda depois de 10: o PRE 09 exige o corpo B4 exato e o PRE B4
exige o LIVE exato, logo uma inversão falha fechada em vez de sobrescrever a correção.
"""
import hashlib
from pathlib import Path

B4_CREDIT_MD5 = "44e8768ff53d7fe5ff3b9f0889258946"
LIVE_CREDIT_MD5 = "213ac31f3a30816ead75365b0d1fed18"
CREDIT_ACL_MD5 = "578c00048ab38c285e229e11ff6211ec"
B4_BALANCES_MD5 = "9fbf08a16f6bcbec379945886c85c245"
B4_RESIDUAL_MD5 = "93769163bfc7c72a4bbc722e62313179"
B4_HELPER_ACL_MD5 = "aae127bcdd4f7096876d7094c14eabd1"
SIG = "public.fn_b2b_credit_exposure(uuid,numeric,uuid)"
APPROVED = "'aprovado','em_producao','produzido','aguardando_entrega','confirmado','em_separacao','enviado','entregue'"
PENDING = "'pendente','solicitado','em_analise_comercial','aguardando_aprovacao_credito','aguardando_ajuste_comercial','aguardando_itens'"


def md5(text):
    return hashlib.md5(text.encode()).hexdigest()


def sha(text):
    return hashlib.sha256(text.encode()).hexdigest()


# pg_get_functiondef canonical form: md5(body + "\n") is the pinned value.
SYNC = """CREATE OR REPLACE FUNCTION public.rpc_b2b_forecast_fiscal_sync_v1(p_transmission_id uuid, p_expected_version integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE t public.fiscal_sefaz_transmissions;inv public.fiscal_invoices;f platform_private.b2b_financial_forecasts;
 v_invoice uuid;org uuid;ev text;payload jsonb;att integer;result jsonb;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'B2B_FORECAST_READ_COMMITTED_REQUIRED' USING ERRCODE='42501';END IF;
 -- Authority is derived server-side from the JWT actor; payload/IDs never attest it.
 org:=platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]);
 IF org IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_FISCAL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE
  OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FEATURE_DENIED' USING ERRCODE='42501';END IF;
 IF p_transmission_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN
  RAISE EXCEPTION 'B2B_FORECAST_EVENT_INVALID' USING ERRCODE='22023';END IF;
 SELECT t0.fiscal_invoice_id INTO v_invoice FROM public.fiscal_sefaz_transmissions t0
 JOIN public.fiscal_invoices i ON i.id=t0.fiscal_invoice_id
 WHERE t0.id=p_transmission_id AND i.organization_id=org
 AND platform_private.c2p1_settings_allowed(i.debtor_partner_id,true)
 AND platform_private.resale_pilot_scope_v1('b2b_resale','forecast_sync',auth.uid(),org,
  i.debtor_partner_id,i.partner_order_id,NULL,NULL,NULL,NULL) IS TRUE;
 IF v_invoice IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_FISCAL_SOURCE_UNPROVEN' USING ERRCODE='42501';END IF;
 -- Canonical H13 order: fiscal invoice, transmission, then forecast (bridge: invoice, order, forecast).
 SELECT * INTO inv FROM public.fiscal_invoices WHERE id=v_invoice AND organization_id=org FOR SHARE;
 SELECT * INTO t FROM public.fiscal_sefaz_transmissions WHERE id=p_transmission_id FOR SHARE;
 IF NOT FOUND OR t.fiscal_invoice_id IS DISTINCT FROM inv.id THEN
  RAISE EXCEPTION 'FISCAL_TRANSMISSION_LINK_CHANGED' USING ERRCODE='PT409';END IF;
 IF inv.partner_order_id IS NULL OR inv.organization_id IS DISTINCT FROM org OR inv.debtor_partner_id IS NULL THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_SOURCE_UNPROVEN' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=inv.partner_order_id AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR f.organization_id IS DISTINCT FROM inv.organization_id OR f.partner_id IS DISTINCT FROM inv.debtor_partner_id THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_SOURCE_UNPROVEN' USING ERRCODE='42501';END IF;
 -- Re-authorize after every wait: role, profile, tenant and seller scope may have been revoked.
 IF platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]) IS DISTINCT FROM f.organization_id
  OR NOT platform_private.c2p1_settings_allowed(f.partner_id,true) THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF platform_private.resale_pilot_allowed_v1('b2b_resale','forecast_sync',auth.uid(),org,
   inv.debtor_partner_id,inv.partner_order_id,NULL,NULL,NULL,NULL) IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_PILOT_DENIED' USING ERRCODE='42501';END IF;
 -- Recheck entitlements and actor after grant/gate locks, not just aggregate locks.
 IF public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE
  OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FEATURE_DENIED' USING ERRCODE='42501';END IF;
 IF platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]) IS DISTINCT FROM org
  OR platform_private.c2p1_settings_allowed(inv.debtor_partner_id,true) IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF t.outcome='AUTHORIZED' THEN
  -- Definitive confirmation exists only through the H13 callback and fiscal bridge permit.
  RETURN jsonb_build_object('forecast_id',f.id,'state',f.state,'version',f.version,'event',NULL,
   'fiscal_confirmation','H13_BRIDGE_ONLY','transmission_id',t.id,'invoice_id',inv.id);
 END IF;
 IF t.service='NFeAutorizacao4' THEN
  ev:=CASE WHEN t.state IN ('PENDING','SENT') AND coalesce(t.outcome,'PENDING') IN ('PENDING','PROCESSING') THEN 'EMISSION_STARTED'
           WHEN t.state IN ('FAILED','BLOCKED') AND t.outcome='TRANSPORT_ERROR' THEN 'EMISSION_TIMEOUT'
           WHEN t.state='SUCCEEDED' AND t.outcome='REJECTED' THEN 'EMISSION_REJECTED' END;
 ELSIF t.service IN ('NFeRetAutorizacao4','NFeConsultaProtocolo4') THEN
  -- Only protocol consultation 217, for the current exact document/key/environment,
  -- concludes absence. Receipt/schema/auth failures (including RetAutorizacao) do not.
  IF t.service='NFeConsultaProtocolo4' AND t.state='SUCCEEDED' AND t.outcome='REJECTED'
   AND t.c_stat='217' AND t.ch_nfe=inv.access_key AND inv.environment='HOMOLOGATION'
   AND t.environment_code='2' AND t.ambiente_retorno='2'
   -- Returned proof is recorded by the worker callback, not inherited request fields.
   AND t.response_summary->>'cStat'='217'
   AND t.response_summary->>'chNFe'=inv.access_key AND t.response_summary->>'tpAmb'='2'
   AND t.xml_run_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.fiscal_xml_runs r
     WHERE r.id=t.xml_run_id AND r.fiscal_invoice_id=inv.id AND r.access_key=inv.access_key AND r.environment_code='2')
   AND t.n_prot IS NULL AND t.n_rec IS NULL
   AND f.fiscal_intent_id=inv.id
   -- Causality is recorded by the canonical begin while holding the aggregate:
   -- exact timeout event/revision/emission, never timestamp+UUID ordering.
   AND EXISTS(SELECT 1 FROM platform_private.b2b_forecast_consultation_links_v1 l
     JOIN platform_private.b2b_financial_forecast_events e ON e.id=l.timeout_event_id
     WHERE l.transmission_id=t.id AND l.forecast_id=f.id AND l.forecast_version=f.version
       AND l.invoice_id=inv.id AND l.xml_run_id=t.xml_run_id
       AND e.forecast_id=f.id AND e.event_type='EMISSION_TIMEOUT'
       AND e.payload->>'transmission_id'=l.emission_transmission_id::text
       AND NOT EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecast_events later
         WHERE later.forecast_id=f.id AND later.id>e.id
          AND later.event_type IN ('EMISSION_STARTED','EMISSION_TIMEOUT','FISCAL_CONFIRMED'))) THEN
    ev:='CONSULTATION_NOT_AUTHORIZED';
  END IF;
 END IF;
 IF ev IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_FISCAL_OUTCOME_NOT_SYNCABLE' USING ERRCODE='PT409';END IF;
 IF ev='EMISSION_STARTED' AND (inv.total_amount IS NULL OR inv.total_amount<=0 OR inv.total_amount>f.residual_amount) THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_AMOUNT_EXCEEDS_RESIDUAL' USING ERRCODE='PT409';END IF;
 att:=coalesce(t.attempt,0)+1;
 payload:=jsonb_build_object('attempt',att::text,'invoice_id',inv.id,'transmission_id',t.id,'service',t.service,'source','fiscal_sefaz_transmissions')
  ||CASE WHEN ev='EMISSION_STARTED' THEN '{}'::jsonb
         ELSE jsonb_build_object('error_code',coalesce(nullif(t.error_code,''),nullif(t.c_stat,''),t.outcome)) END;
 result:=platform_private.b2b_financial_forecast_transition_v1(f.id,p_expected_version,ev,inv.id::text,payload);
 RETURN result||jsonb_build_object('event',ev,'transmission_id',t.id,'invoice_id',inv.id);
END
$function$"""

CANCEL = """CREATE OR REPLACE FUNCTION public.rpc_b2b_forecast_cancel_residual_v1(p_order uuid, p_expected_version integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE po public.partner_orders;f platform_private.b2b_financial_forecasts;org uuid;
BEGIN
 IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
  RAISE EXCEPTION 'B2B_FORECAST_READ_COMMITTED_REQUIRED' USING ERRCODE='42501';END IF;
 org:=platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]);
 IF org IS NULL THEN RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE
  OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FEATURE_DENIED' USING ERRCODE='42501';END IF;
 IF p_order IS NULL OR p_expected_version IS NULL OR nullif(btrim(coalesce(p_reason,'')),'') IS NULL THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_REASON_REQUIRED' USING ERRCODE='22023';END IF;
 -- Canonical order: order row first, then forecast (same as approval and the bridge).
 SELECT * INTO po FROM public.partner_orders WHERE id=p_order
  AND EXISTS(SELECT 1 FROM public.partner_accounts pa WHERE pa.id=partner_orders.partner_id
   AND pa.commercial_owner_organization_id=org)
  AND platform_private.c2p1_settings_allowed(partner_id,true)
  AND platform_private.resale_pilot_scope_v1('b2b_resale','forecast_cancel',auth.uid(),org,
   partner_id,id,NULL,NULL,NULL,NULL) IS TRUE FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 SELECT * INTO f FROM platform_private.b2b_financial_forecasts WHERE order_id=p_order AND organization_id=org FOR UPDATE;
 IF NOT FOUND OR f.partner_id IS DISTINCT FROM po.partner_id THEN
  RAISE EXCEPTION 'B2B_FORECAST_CAS_CONFLICT' USING ERRCODE='PT409';END IF;
 IF platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]) IS DISTINCT FROM f.organization_id
  OR NOT platform_private.c2p1_settings_allowed(f.partner_id,true) THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 IF platform_private.resale_pilot_allowed_v1('b2b_resale','forecast_cancel',auth.uid(),org,
   po.partner_id,po.id,NULL,NULL,NULL,NULL) IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_PILOT_DENIED' USING ERRCODE='42501';END IF;
 IF public._saas_user_has_feature(auth.uid(),'pedidos_b2b') IS NOT TRUE
  OR public._saas_user_has_feature(auth.uid(),'contas_receber') IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_FEATURE_DENIED' USING ERRCODE='42501';END IF;
 IF platform_private.c2p1_internal_actor(ARRAY['administrador','financeiro']::public.app_role[]) IS DISTINCT FROM org
  OR platform_private.c2p1_settings_allowed(po.partner_id,true) IS NOT TRUE THEN
  RAISE EXCEPTION 'B2B_FORECAST_CANCEL_ACTOR_DENIED' USING ERRCODE='42501';END IF;
 -- An emission/consultation still open or an authorized return awaiting close must settle first.
 IF EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN public.fiscal_sefaz_transmissions t ON t.fiscal_invoice_id=i.id
   WHERE i.partner_order_id=p_order AND t.state IN ('PENDING','SENT')) THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_IN_FLIGHT' USING ERRCODE='PT409';END IF;
 IF EXISTS(SELECT 1 FROM public.fiscal_invoices i JOIN platform_private.fiscal_close_pending cp ON cp.fiscal_invoice_id=i.id
   WHERE i.partner_order_id=p_order) THEN
  RAISE EXCEPTION 'B2B_FORECAST_FISCAL_RECONCILIATION_PENDING' USING ERRCODE='PT409';END IF;
 RETURN platform_private.b2b_financial_forecast_cancel_residual_v1(f.id,p_expected_version,p_reason)
  ||jsonb_build_object('actor',auth.uid(),'order_id',p_order);
END
$function$"""


def begin_overlay(root):
    import json
    capture = root / 'scripts/b2b-downstream-audit-20261107/order-e2e-new-20261108/evidence/attempt-184/current-pre-physical.json'
    row = next(r for r in json.loads(capture.read_text())['functions'] if r['name']=='rpc_fiscal_sefaz_transmit_begin_v1')
    assert md5(row['body']) == row['md5'] == '4d93bb04e4a18771ed9185d2f3c5d6dc'
    blind = """  SELECT coalesce(nfe_environment_code, '') INTO v_tpamb
    FROM public.company_fiscal_settings WHERE is_active LIMIT 1;
  IF v_tpamb IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;
"""
    assert row['body'].count(blind)==1
    # Demonstrated defect (attempt 195): tenant-blind LIMIT 1 reads another
    # tenant's active settings. Candidate derives tpamb from the document's own
    # active settings after invoice derivation; no-document services keep the
    # canonical clause verbatim. Missing/other settings => NULL => blocked.
    # Identity first: Consulta/RetAutorizacao derive the invoice from the XML run
    # (caller invoice is never authority, as H7G-001); then the ISSUER's exact
    # active settings decide tpamb. Without a document, only the actor's own
    # organization with exactly one active settings row may decide; absence or
    # ambiguity blocks. Another tenant's settings are never read as authority.
    scoped_env = """  -- Real transport sends receipt/consult/status with an h15-authorized invoice and
  -- optional run; when a run is given it is authority and must match.
  IF _service IN ('NFeConsultaProtocolo4','NFeRetAutorizacao4') AND _xml_run_id IS NOT NULL THEN
    SELECT * INTO v_run FROM public.fiscal_xml_runs WHERE id = _xml_run_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'SEFAZ_RUN_NOT_FOUND'; END IF;
    IF v_run.fiscal_invoice_id IS NULL THEN RAISE EXCEPTION 'SEFAZ_RUN_INVOICE_MISSING'; END IF;
    IF _invoice_id IS NOT NULL AND _invoice_id IS DISTINCT FROM v_run.fiscal_invoice_id THEN
      RAISE EXCEPTION 'SEFAZ_INVOICE_RUN_MISMATCH';
    END IF;
    v_invoice := v_run.fiscal_invoice_id;
  END IF;
  v_tpamb := NULL;
  IF v_invoice IS NOT NULL THEN
    SELECT coalesce(c.nfe_environment_code, '') INTO v_tpamb
      FROM public.fiscal_invoices i JOIN public.company_fiscal_settings c
        ON c.id=i.company_settings_id AND c.organization_id=i.organization_id AND c.is_active
     WHERE i.id=v_invoice;
  ELSIF _actor IS NOT NULL THEN
    SELECT CASE WHEN count(*)=1 THEN max(coalesce(c.nfe_environment_code,'')) END INTO v_tpamb
      FROM public.profiles p JOIN public.company_fiscal_settings c
        ON c.organization_id=p.organization_id AND c.is_active
     WHERE p.user_id=_actor AND p.ativo IS TRUE;
  END IF;
  IF v_tpamb IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';
  END IF;
"""
    anchor = "  PERFORM pg_advisory_xact_lock(hashtextextended('fiscal_sefaz_tx:' || _idempotency_key, 0));"
    guard = """  -- Shared serialization with cancel: invoice -> order -> forecast, as H13.
  -- Runs in the canonical worker writer, before any transmission insert/replay.
  IF v_invoice IS NOT NULL AND _service IN ('NFeAutorizacao4','NFeRetAutorizacao4','NFeConsultaProtocolo4') THEN
    IF current_setting('transaction_isolation') IS DISTINCT FROM 'read committed' THEN
      RAISE EXCEPTION 'B2B_FORECAST_READ_COMMITTED_REQUIRED' USING ERRCODE='42501';END IF;
    -- Pre-lock tenant fence (unlocked read): a foreign/unknown actor never waits
    -- on another tenant's invoice/order/forecast rows. Re-checked after locks.
    IF EXISTS(SELECT 1 FROM platform_private.b2b_financial_forecasts f
        JOIN public.fiscal_invoices i ON i.partner_order_id=f.order_id WHERE i.id=v_invoice)
      AND (_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.fiscal_invoices i
        ON i.organization_id=p.organization_id WHERE i.id=v_invoice AND p.user_id=_actor AND p.ativo IS TRUE)) THEN
      RAISE EXCEPTION 'B2B_FORECAST_BEGIN_SCOPE_DENIED' USING ERRCODE='42501';END IF;
    PERFORM i.id FROM public.fiscal_invoices i WHERE i.id=v_invoice FOR SHARE;
    PERFORM po.id FROM public.partner_orders po JOIN public.fiscal_invoices i ON i.partner_order_id=po.id
      WHERE i.id=v_invoice FOR UPDATE OF po;
    PERFORM f.id FROM platform_private.b2b_financial_forecasts f JOIN public.fiscal_invoices i ON i.partner_order_id=f.order_id
      WHERE i.id=v_invoice FOR UPDATE OF f;
  END IF;
"""
    assert row['body'].count(anchor)==1
    body=row['body'].replace(blind,'',1).replace(anchor,scoped_env+guard+anchor)
    # Only new dispatches reserve; exact replay above retains original transmission.
    insert_anchor = '  INSERT INTO public.fiscal_sefaz_transmissions ('
    # Authority + scope re-checked AFTER every lock wait and BEFORE any replay,
    # so a replay never returns a row to a revoked/foreign caller nor authorizes a send.
    authz = """  SELECT f.* INTO v_forecast FROM platform_private.b2b_financial_forecasts f
    JOIN public.fiscal_invoices i ON i.partner_order_id=f.order_id WHERE i.id=v_invoice;
  IF FOUND AND _service IN ('NFeAutorizacao4','NFeConsultaProtocolo4','NFeRetAutorizacao4') THEN
    SELECT i.* INTO v_source FROM public.fiscal_invoices i WHERE i.id=v_invoice;
    IF v_forecast.organization_id IS DISTINCT FROM v_source.organization_id
      OR v_forecast.partner_id IS DISTINCT FROM v_source.debtor_partner_id THEN
      RAISE EXCEPTION 'B2B_FORECAST_BEGIN_SCOPE_DENIED' USING ERRCODE='42501';END IF;
    -- Post-wait revalidation of everything read before the locks: marker,
    -- XML identity/state and the issuer's exact active settings.
    SELECT project_ref, production_emission_allowed INTO v_ref, v_prod
      FROM public.fiscal_environment_marker LIMIT 1;
    IF v_ref IS DISTINCT FROM 'swzpzcwiasxmjutrmvkm' OR coalesce(v_prod, true) THEN
      RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';END IF;
    IF _xml_run_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.fiscal_xml_runs r
        WHERE r.id=_xml_run_id AND r.fiscal_invoice_id=v_invoice
          AND (_service<>'NFeAutorizacao4' OR (r.state='SIGNED' AND coalesce(r.signed_path,'')<>''
            AND coalesce(r.environment_code,'')='2' AND r.access_key IS NOT DISTINCT FROM v_run.access_key))) THEN
      RAISE EXCEPTION 'SEFAZ_INVOICE_RUN_MISMATCH';END IF;
    IF NOT EXISTS(SELECT 1 FROM public.company_fiscal_settings c
        WHERE c.id=v_source.company_settings_id AND c.organization_id=v_source.organization_id
          AND c.is_active AND coalesce(c.nfe_environment_code,'')='2') THEN
      RAISE EXCEPTION 'FISCAL_PRODUCTION_ENDPOINT_BLOCKED';END IF;
    -- Pilot first (it may wait on its own gate/allowlist locks); every profile,
    -- role, tenant and entitlement check is evaluated AFTER that wait.
    v_pilot := platform_private.resale_pilot_allowed_v1('b2b_resale','forecast_begin',_actor,
          v_source.organization_id,v_source.debtor_partner_id,v_source.partner_order_id,NULL,NULL,NULL,NULL);
    IF _service IN ('NFeAutorizacao4','NFeConsultaProtocolo4','NFeRetAutorizacao4') THEN
      -- Worker actor argument is NOT sufficient: canonical active internal authority,
      -- tenant, entitlements and exact pilot are read from server records.
      IF v_pilot IS NOT TRUE OR _actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.profiles p
        JOIN public.organizations o ON o.id=p.organization_id
        WHERE p.user_id=_actor AND p.ativo IS TRUE AND o.ativo IS TRUE
         AND p.organization_id=v_source.organization_id)
        OR NOT (public.has_role(_actor,'administrador') OR public.has_role(_actor,'financeiro'))
        OR public._saas_user_has_feature(_actor,'pedidos_b2b') IS NOT TRUE
        OR public._saas_user_has_feature(_actor,'contas_receber') IS NOT TRUE THEN
        RAISE EXCEPTION 'B2B_FORECAST_BEGIN_SCOPE_DENIED' USING ERRCODE='42501';END IF;
    END IF;
  END IF;
"""
    # Replay is bound to the full canonical identity, not only the fingerprint.
    replay_old = """    IF v_existing.request_fingerprint IS DISTINCT FROM _request_fingerprint THEN
      RAISE EXCEPTION 'FISCAL_TRANSMISSION_IDEMPOTENCY_MISMATCH';
    END IF;
"""
    replay_new = """    IF v_existing.request_fingerprint IS DISTINCT FROM _request_fingerprint
      OR v_existing.service IS DISTINCT FROM _service
      OR v_existing.fiscal_invoice_id IS DISTINCT FROM v_invoice
      OR v_existing.xml_run_id IS DISTINCT FROM _xml_run_id
      OR v_existing.fiscal_event_id IS DISTINCT FROM _event_id
      OR v_existing.endpoint_url IS DISTINCT FROM _endpoint_url
      OR (v_invoice IS NULL AND NOT EXISTS(SELECT 1 FROM public.profiles a JOIN public.profiles b
            ON b.organization_id=a.organization_id
          WHERE a.user_id=_actor AND a.ativo IS TRUE AND b.user_id=v_existing.created_by)) THEN
      RAISE EXCEPTION 'FISCAL_TRANSMISSION_IDEMPOTENCY_MISMATCH';
    END IF;
"""
    replay_anchor = "  SELECT * INTO v_existing FROM public.fiscal_sefaz_transmissions\n   WHERE idempotency_key = _idempotency_key;"
    reserve = """  IF v_forecast.id IS NOT NULL AND _service IN ('NFeAutorizacao4','NFeConsultaProtocolo4','NFeRetAutorizacao4') THEN
    IF _service='NFeAutorizacao4' AND
      (v_forecast.state NOT IN ('aguardando_fiscal','faturado_parcial')
       OR v_source.total_amount IS NULL OR v_source.total_amount<=0 OR v_source.total_amount>v_forecast.residual_amount) THEN
      RAISE EXCEPTION 'B2B_FORECAST_BEGIN_BLOCKED' USING ERRCODE='PT409';END IF;
    IF _service='NFeConsultaProtocolo4' THEN
      SELECT e.* INTO v_timeout FROM platform_private.b2b_financial_forecast_events e
       WHERE e.forecast_id=v_forecast.id AND e.event_type='EMISSION_TIMEOUT' ORDER BY e.id DESC LIMIT 1;
      IF v_forecast.state<>'consulta_fiscal_obrigatoria' OR v_forecast.fiscal_intent_id IS DISTINCT FROM v_invoice
        OR v_timeout.id IS NULL OR v_timeout.payload->>'invoice_id' IS DISTINCT FROM v_invoice::text
        OR NOT EXISTS(SELECT 1 FROM public.fiscal_sefaz_transmissions t
         WHERE t.id=(v_timeout.payload->>'transmission_id')::uuid AND t.fiscal_invoice_id=v_invoice
          AND t.xml_run_id=_xml_run_id AND t.service='NFeAutorizacao4' AND t.outcome='TRANSPORT_ERROR') THEN
        RAISE EXCEPTION 'B2B_FORECAST_CONSULTATION_CAUSE_UNPROVEN' USING ERRCODE='PT409';END IF;
    END IF;
  END IF;
"""
    assert body.count(insert_anchor)==1
    assert body.count(replay_anchor)==1 and body.count(replay_old)==1
    body=body.replace(replay_anchor,authz+replay_anchor,1).replace(replay_old,replay_new,1)
    body=body.replace('  v_row       public.fiscal_sefaz_transmissions;', '''  v_row       public.fiscal_sefaz_transmissions;
  v_forecast platform_private.b2b_financial_forecasts;
  v_source public.fiscal_invoices;
  v_timeout platform_private.b2b_financial_forecast_events;
  v_pilot boolean;''').replace(insert_anchor,reserve+insert_anchor)
    after_insert='  RETURNING * INTO v_row;'
    assert body.count(after_insert)==1
    body=body.replace(after_insert,after_insert+"""
  IF v_forecast.id IS NOT NULL AND _service='NFeAutorizacao4' THEN
    PERFORM platform_private.b2b_financial_forecast_transition_v1(v_forecast.id,v_forecast.version,
      'EMISSION_STARTED',v_invoice::text,jsonb_build_object('attempt',(v_row.attempt+1)::text,
       'invoice_id',v_invoice,'transmission_id',v_row.id,'service',_service,'source','fiscal_sefaz_transmissions'));
  ELSIF v_forecast.id IS NOT NULL AND _service='NFeConsultaProtocolo4' THEN
    INSERT INTO platform_private.b2b_forecast_consultation_links_v1
      (transmission_id,forecast_id,forecast_version,invoice_id,xml_run_id,timeout_event_id,emission_transmission_id)
    VALUES(v_row.id,v_forecast.id,v_forecast.version,v_invoice,_xml_run_id,v_timeout.id,
      (v_timeout.payload->>'transmission_id')::uuid);
  END IF;
""")
    sig='public.rpc_fiscal_sefaz_transmit_begin_v1(text,text,text,text,uuid,uuid,uuid,uuid)'
    acl=md5('postgres=EXECUTE/postgres|service_role=EXECUTE/postgres')
    return body, sig, row['md5'], md5(body), acl


def lifecycle_pilot_sql():
    """Extend only operation vocabulary of the existing private, revocable pilot.
    No rows or global switches are enabled; historical read grants authorize nothing.
    Constraint pins measured from pilot_containment.foundation on PG17.11.
    """
    return """DO $pilot$ DECLARE op text; shape text; BEGIN
 IF to_regprocedure('public._saas_user_has_feature(uuid,text)') IS NULL
  OR to_regprocedure('platform_private.resale_pilot_scope_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)') IS NULL
  OR to_regprocedure('platform_private.resale_pilot_allowed_v1(text,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION 'B2B_FORECAST_PILOT_DEPENDENCY_MISSING' USING ERRCODE='42501';END IF;
 LOCK TABLE platform_private.resale_pilot_allowlist_v1 IN ACCESS EXCLUSIVE MODE;
 SELECT pg_get_constraintdef(oid) INTO op FROM pg_constraint
  WHERE conrelid='platform_private.resale_pilot_allowlist_v1'::regclass AND conname='resale_pilot_allowlist_v1_operation_check';
 SELECT pg_get_constraintdef(oid) INTO shape FROM pg_constraint
  WHERE conrelid='platform_private.resale_pilot_allowlist_v1'::regclass AND conname='resale_pilot_allowlist_v1_check2';
 IF md5(op) IS DISTINCT FROM '0fd27c10e23c84c4157e0e3c5219e9c3'
  OR md5(shape) IS DISTINCT FROM 'eded2fefaa492b7e32ba8e6f39c9f420' THEN
  RAISE EXCEPTION 'B2B_FORECAST_PILOT_CONSTRAINT_DRIFT' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM platform_private.resale_pilot_allowlist_v1 WHERE operation IN ('forecast_sync','forecast_cancel')) THEN
  RAISE EXCEPTION 'B2B_FORECAST_PILOT_NOT_CLOSED' USING ERRCODE='42501';END IF;
 ALTER TABLE platform_private.resale_pilot_allowlist_v1 DROP CONSTRAINT resale_pilot_allowlist_v1_operation_check;
 ALTER TABLE platform_private.resale_pilot_allowlist_v1 DROP CONSTRAINT resale_pilot_allowlist_v1_check2;
 EXECUTE 'ALTER TABLE platform_private.resale_pilot_allowlist_v1 ADD CONSTRAINT resale_pilot_allowlist_v1_operation_check CHECK ('
  ||substr(op,8,length(op)-8)||' OR operation IN (''forecast_sync'',''forecast_cancel'',''forecast_begin''))';
 EXECUTE 'ALTER TABLE platform_private.resale_pilot_allowlist_v1 ADD CONSTRAINT resale_pilot_allowlist_v1_check2 CHECK ('
  ||substr(shape,8,length(shape)-8)||' OR (operation IN (''forecast_sync'',''forecast_cancel'',''forecast_begin'') AND gate=''b2b_resale''
   AND partner_id IS NOT NULL AND order_id IS NOT NULL AND order_item_id IS NULL AND product_id IS NULL AND stock_id IS NULL AND delivery_id IS NULL))';
END $pilot$;
CREATE TABLE platform_private.b2b_forecast_consultation_links_v1(
 transmission_id uuid PRIMARY KEY REFERENCES public.fiscal_sefaz_transmissions(id),
 forecast_id uuid NOT NULL REFERENCES platform_private.b2b_financial_forecasts(id),
 forecast_version integer NOT NULL CHECK(forecast_version>0),invoice_id uuid NOT NULL,
 xml_run_id uuid NOT NULL,timeout_event_id bigint NOT NULL REFERENCES platform_private.b2b_financial_forecast_events(id),
 emission_transmission_id uuid NOT NULL REFERENCES public.fiscal_sefaz_transmissions(id));
ALTER TABLE platform_private.b2b_forecast_consultation_links_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON platform_private.b2b_forecast_consultation_links_v1 FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER b2b_forecast_consultation_links_immutable BEFORE UPDATE OR DELETE
 ON platform_private.b2b_forecast_consultation_links_v1 FOR EACH ROW
 EXECUTE FUNCTION platform_private.b2b_financial_forecast_events_immutable();
"""


def wrappers_sql():
    begin,sig,old,new,acl=begin_overlay(Path(__file__).resolve().parent.parents[5])
    sql = (lifecycle_pilot_sql() + SYNC + ";\n" + CANCEL + ";\n"
           "REVOKE ALL ON FUNCTION public.rpc_b2b_forecast_fiscal_sync_v1(uuid,integer),public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text) FROM PUBLIC,anon,service_role;\n"
           "GRANT EXECUTE ON FUNCTION public.rpc_b2b_forecast_fiscal_sync_v1(uuid,integer),public.rpc_b2b_forecast_cancel_residual_v1(uuid,integer,text) TO authenticated;\n"
           "-- Private transition/cancel/reconcile keep NO grant: only these owner wrappers and the bridge nest them.\n")
    sql=acl_loop('B2B_FORECAST_BEGIN_PRE',[(sig,old,acl)])+'\n'+begin+';\n'+acl_loop('B2B_FORECAST_BEGIN_POST',[(sig,new,acl)])+'\n'+sql
    return sql, {"sync": md5(SYNC + "\n"), "cancel": md5(CANCEL + "\n"), "begin":new}


def b4_credit_body(root):
    stage = root / "scripts/b2b-downstream-audit-20261107/canonical-composition-feb815603/stages/02-b4-install-post-composition.sql.review"
    text = stage.read_text()
    head = "CREATE OR REPLACE FUNCTION public.fn_b2b_credit_exposure("
    assert text.count(head) == 1
    i = text.index(head)
    j = text.index("END $function$", i) + len("END $function$")
    body = text[i:j]
    assert md5(body + "\n") == B4_CREDIT_MD5, md5(body + "\n")
    return body, sha(text)


def composed_credit(b4_body):
    decl = "  v_settings_json jsonb;\n"
    anchor = "  v_pending:=(v_settings_json->>'comprometido_pendente')::numeric;\n"
    assert b4_body.count(decl) == 1 and b4_body.count(anchor) == 1
    block = f"""  -- B4+previsão (corpo único; ordem B4 -> 09-12): o residual B4 (total menos
  -- alocações de NF autorizadas não estornadas) segue como única base e títulos
  -- abertos entram só por saldo_em_aberto. A previsão nunca é aditiva: apenas zera
  -- residual formalmente cancelado e, nos demais estados, precisa coincidir com o
  -- residual B4. Divergência, tenant ou parceiro conflitante falham fechados.
  SELECT pa.commercial_owner_organization_id INTO v_owner FROM public.partner_accounts pa WHERE pa.id=p_partner_id;
  FOR v_fc IN SELECT f.order_id,f.state,f.residual_amount,f.organization_id,f.partner_id AS forecast_partner,
      po.partner_id AS order_partner,po.status::text AS status
    FROM platform_private.b2b_financial_forecasts f JOIN public.partner_orders po ON po.id=f.order_id
    WHERE (po.partner_id=p_partner_id OR f.partner_id=p_partner_id)
      AND po.id IS DISTINCT FROM p_exclude_order_id
      AND po.status::text IN ({APPROVED},{PENDING})
  LOOP
    IF v_fc.forecast_partner IS DISTINCT FROM v_fc.order_partner OR v_fc.organization_id IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'CREDIT_FORECAST_SCOPE_CONFLICT' USING ERRCODE='23514'; END IF;
    v_b4_residual:=platform_private.b2b_order_residual(v_fc.order_id);
    IF v_fc.state IN ('cancelado_antes_nf','cancelado_residual') THEN v_effective:=0;
    ELSIF v_fc.residual_amount IS DISTINCT FROM v_b4_residual THEN
      RAISE EXCEPTION 'CREDIT_FORECAST_RESIDUAL_DIVERGENCE' USING ERRCODE='23514';
    ELSE v_effective:=v_b4_residual; END IF;
    IF v_fc.status IN ({APPROVED}) THEN v_committed:=v_committed-v_b4_residual+v_effective;
    ELSE v_pending:=v_pending-v_b4_residual+v_effective; END IF;
  END LOOP;
"""
    out = b4_body.replace(decl, decl + "  v_fc record; v_b4_residual numeric; v_effective numeric; v_owner uuid;\n")
    out = out.replace(anchor, anchor + block)
    return out


ELIG_SIG = "public.fn_b2b_order_billing_eligibility(uuid)"
ELIG_LIVE_MD5 = "db977875e15ea49ce10fb3e5388d7dfb"
ELIG_SOURCE = "scripts/owner-orders-20261023/baseline-p1/public.fn_b2b_order_billing_eligibility.sql"


def live_eligibility(root):
    text = (root / ELIG_SOURCE).read_text()
    head = "CREATE OR REPLACE FUNCTION public.fn_b2b_order_billing_eligibility("
    assert text.count(head) == 1
    i = text.index(head)
    j = text.index("$function$", text.index("$function$", i) + 10) + len("$function$")
    body = text[i:j]
    assert md5(body + "\n") == ELIG_LIVE_MD5, md5(body + "\n")
    return body, sha(text)


def linked_terms_eligibility(live):
    """Same class as linked_terms_overlay: the frozen header keeps 'pending' while the
    approval of record is the exact linked child terms row (id + order, actor, time)."""
    anchor = "  v_fin := COALESCE(v_order.financial_approval_status,'not_required');\n"
    assert live.count(anchor) == 1 and live.count("IF v_fin = 'pending' THEN") == 1
    delta = anchor + """  -- Approval of record lives in the exact linked child terms (id + order, approver
  -- and time). The frozen header is never rewritten; 'rejected' still blocks.
  IF v_fin = 'pending' AND v_order.payment_terms_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.partner_order_payment_terms t
        WHERE t.id = v_order.payment_terms_id AND t.partner_order_id = p_partner_order_id
          AND t.approval_status = 'approved' AND t.approved_by IS NOT NULL AND t.approved_at IS NOT NULL) THEN
    v_fin := 'approved';
  END IF;
"""
    return live.replace(anchor, delta)


def acl_loop(prefix, rows):
    values = ",".join(f"('{s}','{b}','postgres',{('NULL' if a is None else repr(a))})" for s, b, a in rows)
    return f"""DO $guard$ DECLARE d record; BEGIN
 FOR d IN SELECT * FROM (VALUES {values}) x(sig,body_md5,owner,acl_md5) LOOP
  IF to_regprocedure(d.sig) IS NULL THEN RAISE EXCEPTION '{prefix}_MISSING:%',d.sig USING ERRCODE='42501'; END IF;
  IF md5(pg_get_functiondef(d.sig::regprocedure)) IS DISTINCT FROM d.body_md5 THEN RAISE EXCEPTION '{prefix}_BODY:%',d.sig USING ERRCODE='42501'; END IF;
  IF (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=d.sig::regprocedure) IS DISTINCT FROM d.owner THEN RAISE EXCEPTION '{prefix}_OWNER:%',d.sig USING ERRCODE='42501'; END IF;
  IF d.acl_md5 IS NOT NULL AND (SELECT md5(string_agg(v.entry,'|' ORDER BY v.entry)) FROM (
    SELECT CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END||'='||a.privilege_type||CASE WHEN a.is_grantable THEN '*' ELSE '' END||'/'||a.grantor::regrole::text entry
    FROM pg_proc p,aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=d.sig::regprocedure) v) IS DISTINCT FROM d.acl_md5
  THEN RAISE EXCEPTION '{prefix}_ACL:%',d.sig USING ERRCODE='42501'; END IF;
 END LOOP;
END $guard$;"""


def credit_composition(root, ref):
    b4_body, b4_stage_sha = b4_credit_body(root)
    composed = composed_credit(b4_body)
    composed_md5 = md5(composed + "\n")
    elig_live, elig_source_sha = live_eligibility(root)
    elig_new = linked_terms_eligibility(elig_live)
    elig_md5 = md5(elig_new + "\n")
    deps = [("platform_private.b2b_credit_balances(uuid,uuid)", B4_BALANCES_MD5, B4_HELPER_ACL_MD5),
            ("platform_private.b2b_order_residual(uuid)", B4_RESIDUAL_MD5, B4_HELPER_ACL_MD5)]
    ref_guard = f""" IF current_setting('b2b_forecast.review_project_ref',true) IS DISTINCT FROM '{ref}' THEN RAISE EXCEPTION 'B2B_CREDIT_COMPOSITION_REF_NOT_VERIFIED';END IF;
 IF to_regclass('platform_private.b2b_financial_forecasts') IS NULL THEN RAISE EXCEPTION 'B2B_CREDIT_COMPOSITION_FORECAST_MISSING';END IF;
 IF to_regclass('platform_private.b2b_document_allocations') IS NULL OR to_regclass('platform_private.b2b_allocation_reversals') IS NULL THEN RAISE EXCEPTION 'B2B_CREDIT_COMPOSITION_B4_MISSING';END IF;"""
    pre = f"""-- REVIEW ONLY READ ONLY. 09: composição de crédito exige B4 POST exato (nunca LIVE nem pré-B4 residual).
BEGIN READ ONLY;
DO $$ BEGIN
{ref_guard}
END$$;
{acl_loop('B2B_CREDIT_COMPOSITION_PRE', [(SIG, B4_CREDIT_MD5, CREDIT_ACL_MD5), (ELIG_SIG, ELIG_LIVE_MD5, CREDIT_ACL_MD5)] + deps)}
ROLLBACK;
"""
    install = f"""-- REVIEW_ONLY_INACTIVE_NOT_APPROVED. 10: corpo único B4+previsão; PostgreSQL descartável apenas.
BEGIN;
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
{ref_guard}
END$$;
{acl_loop('B2B_CREDIT_COMPOSITION_INSTALL_PRE', [(SIG, B4_CREDIT_MD5, CREDIT_ACL_MD5), (ELIG_SIG, ELIG_LIVE_MD5, CREDIT_ACL_MD5)] + deps)}
{composed};
{elig_new};
{acl_loop('B2B_CREDIT_COMPOSITION_INSTALL_POST', [(SIG, composed_md5, CREDIT_ACL_MD5), (ELIG_SIG, elig_md5, CREDIT_ACL_MD5)] + deps)}
COMMIT;
"""
    post = f"""-- REVIEW ONLY READ ONLY. 11: corpo composto, mesmo dono/ACL B4, dependências B4 intactas.
BEGIN READ ONLY;
{acl_loop('B2B_CREDIT_COMPOSITION_POST', [(SIG, composed_md5, CREDIT_ACL_MD5), (ELIG_SIG, elig_md5, CREDIT_ACL_MD5)] + deps)}
ROLLBACK;
"""
    rollback = f"""-- REVIEW ONLY. 12: rollback deny-only/retain. NÃO restaura B4 (ignoraria residual
-- cancelado) nem LIVE (somaria pedido inteiro e título após NF parcial). A leitura
-- composta permanece; writers fecham pelos rollbacks 08/04 e B4/ponte.
-- Elegibilidade volta ao LIVE capturado, que é ESTRITAMENTE mais restritivo
-- (exige header aprovado): fecha faturamento novo, nunca o amplia.
BEGIN;
SET LOCAL lock_timeout='3s';
{acl_loop('B2B_CREDIT_COMPOSITION_ROLLBACK_PRE', [(SIG, composed_md5, CREDIT_ACL_MD5), (ELIG_SIG, elig_md5, CREDIT_ACL_MD5)] + deps)}
{elig_live};
{acl_loop('B2B_CREDIT_COMPOSITION_ROLLBACK_RETAIN', [(SIG, composed_md5, CREDIT_ACL_MD5), (ELIG_SIG, ELIG_LIVE_MD5, CREDIT_ACL_MD5)] + deps)}
COMMIT;
"""
    files = {"09-pre-credit-composition.sql.readonly": pre, "10-install-credit-composition.sql.review": install,
             "11-post-credit-composition.sql.readonly": post, "12-rollback-credit-composition-retain.sql.review": rollback,
             "credit-exposure.composed.sql": composed + "\n", "billing-eligibility.linked-terms.sql": elig_new + "\n"}
    manifest = {"order": ["forecast 01-04 (credit untouched, LIVE pin)", "B4 PRE/INSTALL/POST (LIVE->B4)", "credit 09-12 (B4->composed)",
                          "bridge/strict", "forecast 05-08 reconcile+wrappers", "bridge-audit", "H7"],
                "live_md5": LIVE_CREDIT_MD5, "b4_md5": B4_CREDIT_MD5, "composed_md5": composed_md5, "acl_md5": CREDIT_ACL_MD5,
                "b4_stage_sha256": b4_stage_sha, "b4_dependencies": {s: {"body_md5":b,"owner":"postgres","acl_md5":a,"acl_source":"B4 OWNER_ONLY manifest; normalized aclexplode"} for s, b, a in deps},
                "rule": "exposure = open titles (B4 proven money) + B4 residual per order; forecast only zeroes canceled residual, must equal B4 residual otherwise",
                "additive_forecast": False,
                "billing_eligibility": {"live_md5": ELIG_LIVE_MD5, "linked_terms_md5": elig_md5, "source": ELIG_SOURCE, "source_sha256": elig_source_sha,
                                        "reason": "B4 allocation reproduced PT409 B2B_ORDER_NOT_BILLABLE:FINANCIAL_APPROVAL_PENDING (attempt 174) with frozen header pending and linked terms approved",
                                        "rollback": "RESTORE_LIVE_STRICTER"}, "rollback": "RETAIN_COMPOSED_NO_BODY_RESTORE"}
    return files, manifest
