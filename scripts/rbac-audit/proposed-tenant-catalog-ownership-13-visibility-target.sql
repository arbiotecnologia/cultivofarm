-- CANDIDATO 13 — NÃO APLICAR. Requer 01–06/08–12; gate OFF.
-- P1: SHOW/no_change lia privados antes de qualquer trigger. Alvos agora global-only.
-- Replay permanece antes do lookup: recibo imutável scoped por ator+org+chave e hash do payload.
-- Não move locks, não muda CAS/chaves/recibos/ACL. Ownership global NULL é imutável (01).
BEGIN;
DO $$ BEGIN
 IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership13_gate_must_remain_off'; END IF;
 IF md5(pg_get_functiondef('platform_private.catalog_tenant_set_visibility_core(text,uuid,boolean,integer,text,uuid)'::regprocedure)) <> '806751acb0477165ed863320ab24c6d0' THEN
  RAISE EXCEPTION 'ownership13_visibility_core_drift'; END IF;
END $$;
CREATE OR REPLACE FUNCTION platform_private.catalog_tenant_set_visibility_core(
  p_entity_type text, p_entity_id uuid, p_hidden boolean, p_expected_version integer, p_reason text, p_idempotency_key uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
  v_reason text := btrim(COALESCE(p_reason,''));
  v_hash text;
  v_prev public.catalog_tenant_visibility%ROWTYPE;
  v_ledger public.catalog_tenant_visibility_ledger%ROWTYPE;
  v_ativo boolean;
  v_new_version integer;
  v_result jsonb;
BEGIN
  v_org := platform_private.catalog_tenant_actor('mutate');
  IF p_entity_type IS NULL OR p_entity_type NOT IN ('produto','microrganismo','cultura') OR p_entity_id IS NULL
     OR p_hidden IS NULL OR p_idempotency_key IS NULL OR p_expected_version IS NULL OR p_expected_version < 0 THEN
    RAISE EXCEPTION 'catalog_visibility_invalid_payload' USING ERRCODE='22023'; END IF;
  IF char_length(v_reason) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'catalog_visibility_reason_required' USING ERRCODE='22023'; END IF;
  v_hash := md5(concat_ws('|', p_entity_type, p_entity_id::text, p_hidden::text, p_expected_version::text, v_reason));

  -- Ordem fixa de locks: (1) ator+empresa+chave — serializa replay/conflito da MESMA chave mesmo em itens
  -- distintos; (2) empresa+item — serializa primeira gravação/CAS. Sempre nesta ordem (sem deadlock cruzado).
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','ctvk',v_uid::text,v_org::text,p_idempotency_key::text),0));
  PERFORM pg_advisory_xact_lock(hashtextextended(concat_ws(':','ctv',v_org::text,p_entity_type,p_entity_id::text),0));

  SELECT * INTO v_ledger FROM public.catalog_tenant_visibility_ledger
   WHERE actor_id=v_uid AND organization_id=v_org AND idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_ledger.payload_hash <> v_hash THEN
      RAISE EXCEPTION 'catalog_visibility_idempotency_conflict' USING ERRCODE='22023'; END IF;
    RETURN v_ledger.result || jsonb_build_object('replayed', true);
  END IF;

  -- Item global existente; inativo não pode ser exibido (preferência não reativa).
  IF p_entity_type='produto' THEN SELECT ativo INTO v_ativo FROM public.produtos WHERE id=p_entity_id AND owner_organization_id IS NULL;
  ELSIF p_entity_type='microrganismo' THEN SELECT ativo INTO v_ativo FROM public.microrganismos WHERE id=p_entity_id AND owner_organization_id IS NULL;
  ELSE SELECT ativo INTO v_ativo FROM public.culturas WHERE id=p_entity_id AND owner_organization_id IS NULL; END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'catalog_visibility_item_not_found' USING ERRCODE='P0002'; END IF;
  IF v_ativo IS NOT TRUE AND p_hidden IS FALSE THEN
    RAISE EXCEPTION 'catalog_visibility_item_inactive' USING ERRCODE='22023'; END IF;

  SELECT * INTO v_prev FROM public.catalog_tenant_visibility
   WHERE organization_id=v_org AND entity_type=p_entity_type
     AND COALESCE(produto_id,microrganismo_id,cultura_id)=p_entity_id FOR UPDATE;
  IF COALESCE(v_prev.version,0) <> p_expected_version THEN
    RAISE EXCEPTION 'catalog_visibility_version_conflict' USING ERRCODE='40001'; END IF;
  IF v_prev.id IS NOT NULL AND v_prev.hidden = p_hidden THEN
    RAISE EXCEPTION 'catalog_visibility_no_change' USING ERRCODE='22023'; END IF;
  IF v_prev.id IS NULL AND p_hidden IS FALSE THEN
    RAISE EXCEPTION 'catalog_visibility_no_change' USING ERRCODE='22023'; END IF;

  v_new_version := p_expected_version + 1;
  IF v_prev.id IS NULL THEN
    INSERT INTO public.catalog_tenant_visibility(organization_id,entity_type,produto_id,microrganismo_id,cultura_id,hidden,version,reason,updated_by)
    VALUES (v_org,p_entity_type,
      CASE WHEN p_entity_type='produto' THEN p_entity_id END,
      CASE WHEN p_entity_type='microrganismo' THEN p_entity_id END,
      CASE WHEN p_entity_type='cultura' THEN p_entity_id END,
      p_hidden,v_new_version,v_reason,v_uid);
  ELSE
    UPDATE public.catalog_tenant_visibility SET hidden=p_hidden, version=v_new_version, reason=v_reason,
      updated_by=v_uid, updated_at=now()
     WHERE id=v_prev.id AND version=p_expected_version;
    IF NOT FOUND THEN RAISE EXCEPTION 'catalog_visibility_version_conflict' USING ERRCODE='40001'; END IF;
  END IF;

  v_result := jsonb_build_object('entity_type',p_entity_type,'entity_id',p_entity_id,'hidden',p_hidden,
    'version',v_new_version,'replayed',false);
  INSERT INTO public.catalog_tenant_visibility_ledger(organization_id,actor_id,idempotency_key,payload_hash,entity_type,entity_id,
    before_state,after_state,reason,result)
  VALUES (v_org,v_uid,p_idempotency_key,v_hash,p_entity_type,p_entity_id,
    CASE WHEN v_prev.id IS NULL THEN NULL ELSE jsonb_build_object('hidden',v_prev.hidden,'version',v_prev.version) END,
    jsonb_build_object('hidden',p_hidden,'version',v_new_version),v_reason,v_result);
  RETURN v_result;
END; $$;
-- CREATE OR REPLACE preserva os grants existentes; nenhum grant adicional.
COMMIT;
