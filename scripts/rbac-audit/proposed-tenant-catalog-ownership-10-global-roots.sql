-- CANDIDATO 10 — NÃO APLICADO. Gerado por build-ownership10.py a partir de definições live (read-only).
-- Requer 01–06/08/09; gate OFF. Somente filtra roots a globais (owner IS NULL); não altera ACL, autorização, preços ou históricos.
-- Cada função: hash-before fixado; âncoras literais com contagem exata; aborta antes de qualquer replace em drift.
BEGIN;
DO $g$ BEGIN IF platform_private.catalog_ownership_enabled() THEN RAISE EXCEPTION 'ownership10_gate_must_remain_off'; END IF; END $g$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$  WHERE p.ativo = true
$anc$,$anc$  WHERE p.ativo = true AND p.owner_organization_id IS NULL
$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='partner_apply_default_discount' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> 'c33a667463b7f34840237ad9ba676761' THEN RAISE EXCEPTION 'ownership10_drift:public.partner_apply_default_discount'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:public.partner_apply_default_discount'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'public.partner_apply_default_discount', md5(pg_get_functiondef(v_oid));
END $p$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$     WHERE p.id = p_product_id;$anc$,$anc$     WHERE p.id = p_product_id AND p.owner_organization_id IS NULL;$anc$,'1'],
    ARRAY[$anc$        FROM public.produtos p WHERE p.id = p_product_id;$anc$,$anc$        FROM public.produtos p WHERE p.id = p_product_id AND p.owner_organization_id IS NULL;$anc$,'1'],
    ARRAY[$anc$  -- 1) Campanha ativa
$anc$,$anc$  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL) THEN
    RAISE EXCEPTION 'product_unavailable' USING ERRCODE='P0002';
  END IF;

  -- 1) Campanha ativa
$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_commercial_simulator' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '4e324b1711f06bb556f050d8ea1aa8f0' THEN RAISE EXCEPTION 'ownership10_drift:public.rpc_commercial_simulator'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:public.rpc_commercial_simulator'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'public.rpc_commercial_simulator', md5(pg_get_functiondef(v_oid));
END $p$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok',false,'reason_code','UNIT_INVALID','quote_required',false);$anc$,$anc$  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.microrganismos gm WHERE gm.id = p_microrganismo_id AND gm.owner_organization_id IS NULL) THEN
    RETURN jsonb_build_object('ok',false,'reason_code','ITEM_INVALID','quote_required',false);
  END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok',false,'reason_code','UNIT_INVALID','quote_required',false);$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_resolve_commercial_price' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '0df0d9005d46b667db4433d3eae59e27' THEN RAISE EXCEPTION 'ownership10_drift:public.fn_resolve_commercial_price'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:public.fn_resolve_commercial_price'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'public.fn_resolve_commercial_price', md5(pg_get_functiondef(v_oid));
END $p$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'UNIT_INVALID');$anc$,$anc$  IF NOT EXISTS (SELECT 1 FROM public.produtos gp WHERE gp.id = p_product_id AND gp.owner_organization_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM public.microrganismos gm WHERE gm.id = p_microrganismo_id AND gm.owner_organization_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'ITEM_INVALID');
  END IF;
  IF p_unit_type IS NULL OR p_unit_type NOT IN ('hectare','litro','dose','unidade') THEN
    RETURN jsonb_build_object('ok', false, 'reason_code', 'UNIT_INVALID');$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_b2b_resolve_base_unit_price' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '60651fe823452436d807b9b175c3865c' THEN RAISE EXCEPTION 'ownership10_drift:public.fn_b2b_resolve_base_unit_price'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:public.fn_b2b_resolve_base_unit_price'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'public.fn_b2b_resolve_base_unit_price', md5(pg_get_functiondef(v_oid));
END $p$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$        FROM public.produtos WHERE id = v_iid;$anc$,$anc$        FROM public.produtos WHERE id = v_iid AND owner_organization_id IS NULL;$anc$,'1'],
    ARRAY[$anc$        FROM public.microrganismos WHERE id = v_iid;$anc$,$anc$        FROM public.microrganismos WHERE id = v_iid AND owner_organization_id IS NULL;$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='fn_resolve_b2b_cart' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> 'c8b4584475698835b786dacdf1e0fc14' THEN RAISE EXCEPTION 'ownership10_drift:public.fn_resolve_b2b_cart'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:public.fn_resolve_b2b_cart'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'public.fn_resolve_b2b_cart', md5(pg_get_functiondef(v_oid));
END $p$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$FROM public.produtos WHERE id=iid AND ativo AND b2b_enabled;$anc$,$anc$FROM public.produtos WHERE id=iid AND ativo AND b2b_enabled AND owner_organization_id IS NULL;$anc$,'1'],
    ARRAY[$anc$FROM public.microrganismos WHERE id=iid AND ativo AND b2b_enabled;$anc$,$anc$FROM public.microrganismos WHERE id=iid AND ativo AND b2b_enabled AND owner_organization_id IS NULL;$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='platform_private' AND p.proname='b2b_save_technical_simulation' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> 'daad3c1554f370bb0456b4ea3afdeea7' THEN RAISE EXCEPTION 'ownership10_drift:platform_private.b2b_save_technical_simulation'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:platform_private.b2b_save_technical_simulation'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'platform_private.b2b_save_technical_simulation', md5(pg_get_functiondef(v_oid));
END $p$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$FROM public.microrganismos m WHERE m.id = p_microorganism_id)$anc$,$anc$FROM public.microrganismos m WHERE m.id = p_microorganism_id AND m.owner_organization_id IS NULL)$anc$,'1'],
    ARRAY[$anc$FROM public.produtos p WHERE p.id = p_product_id)$anc$,$anc$FROM public.produtos p WHERE p.id = p_product_id AND p.owner_organization_id IS NULL)$anc$,'1'],
    ARRAY[$anc$   WHERE m.id = p_microorganism_id
  RETURNING$anc$,$anc$   WHERE m.id = p_microorganism_id AND m.owner_organization_id IS NULL
  RETURNING$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_associate_microorganism_fiscal_product' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> 'da0d679779e9d57558a3a203219b4afc' THEN RAISE EXCEPTION 'ownership10_drift:public.rpc_associate_microorganism_fiscal_product'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:public.rpc_associate_microorganism_fiscal_product'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'public.rpc_associate_microorganism_fiscal_product', md5(pg_get_functiondef(v_oid));
END $p$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$FROM public.microrganismos WHERE id = p_microorganism_id)$anc$,$anc$FROM public.microrganismos WHERE id = p_microorganism_id AND owner_organization_id IS NULL)$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_regulatory_dossier_ensure_draft' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '56076bccafd27aa8c95473ac38e73422' THEN RAISE EXCEPTION 'ownership10_drift:public.rpc_regulatory_dossier_ensure_draft'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:public.rpc_regulatory_dossier_ensure_draft'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'public.rpc_regulatory_dossier_ensure_draft', md5(pg_get_functiondef(v_oid));
END $p$;
DO $p$
DECLARE v_oid regprocedure; v_def text; v_pair text[]; v_pairs text[][] := ARRAY[
    ARRAY[$anc$FROM public.produtos pr WHERE pr.id = v_source_id)$anc$,$anc$FROM public.produtos pr WHERE pr.id = v_source_id AND pr.owner_organization_id IS NULL)$anc$,'1']];
BEGIN
  SELECT p.oid::regprocedure INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_fiscal_draft_save' AND p.prokind='f';
  v_def := pg_get_functiondef(v_oid);
  IF md5(v_def) <> '5e364c8f67c92fb31ff9568310eb876c' THEN RAISE EXCEPTION 'ownership10_drift:public.rpc_fiscal_draft_save'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs LOOP
    IF (length(v_def)-length(replace(v_def,v_pair[1],'')))/length(v_pair[1]) <> v_pair[3]::int THEN
      RAISE EXCEPTION 'ownership10_anchor:public.rpc_fiscal_draft_save'; END IF;
    v_def := replace(v_def, v_pair[1], v_pair[2]);
  END LOOP;
  EXECUTE v_def;
  RAISE NOTICE 'ownership10 % hash_after=%', 'public.rpc_fiscal_draft_save', md5(pg_get_functiondef(v_oid));
END $p$;
COMMIT;
