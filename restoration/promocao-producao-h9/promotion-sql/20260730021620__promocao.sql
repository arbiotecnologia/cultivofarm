-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260730021620_2399d6cb-5b57-46d1-a867-d4403b908e0c.sql
-- SHA-256 orig: f784cc385275751cf08ad21444751be0e5fcc89bb6dd081a0d0e123a36ca9aab
-- Gerador     : restoration/promocao-producao-h9/gerar-promotion-sql.py
-- Transformação: 1 bloco(s) DO de guarda removido(s); guarda canônica de promoção prefixada
--
-- A guarda de homologação foi REMOVIDA e substituída pela guarda canônica de
-- promoção. O runner valida o ref do alvo por canal externo (API/DSN) e só
-- então executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela
-- marcadora de homologação é consultada em produção.
-- ============================================================================
DO $promo_guard$
BEGIN
  IF coalesce(current_setting('promocao.target_ref', true), '') <> 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'PROMO_GUARD: alvo nao confirmado (esperado %)', 'navfzbwgwzruipouyfnk'
      USING ERRCODE = '42501';
  END IF;
END
$promo_guard$;

-- STAGING_GUARD normalizado (portatil / forward-only):
-- recusa apenas ambiente comprovadamente de PRODUCAO. Em banco novo (marker ausente)
-- a migration segue adiante, tornando o replay reprodutivel fora deste projeto.
-- [guarda de homologação removida pelo gerador de promoção]


-- 1) EXECUTE mínimo nas auxiliares internas (idempotente)
REVOKE ALL ON FUNCTION public._cpp_validate_payload(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._cpp_audit(text, uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_cpp_guard_financial_immutability() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_b2b_enforce_plan_selectable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_b2b_apply_interest(numeric, text, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._cpp_validate_payload(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public._cpp_audit(text, uuid, jsonb, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_b2b_apply_interest(numeric, text, numeric, numeric) TO service_role;

-- 2) Troca de plano padrão passa a auditar a remoção do padrão anterior
CREATE OR REPLACE FUNCTION public.rpc_admin_set_default_commercial_plan(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_old public.commercial_payment_plans%ROWTYPE; v_prev public.commercial_payment_plans%ROWTYPE;
BEGIN
  IF NOT public.fn_b2b_can_admin_plans() THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('cpp_default_plan'));
  SELECT * INTO v_old FROM public.commercial_payment_plans WHERE id = p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  IF NOT public.fn_b2b_plan_selectable(p_plan_id) THEN RAISE EXCEPTION 'plan_not_selectable'; END IF;

  SELECT * INTO v_prev FROM public.commercial_payment_plans
   WHERE is_default AND id <> p_plan_id FOR UPDATE;

  UPDATE public.commercial_payment_plans SET is_default = false, updated_by = auth.uid()
   WHERE is_default AND id <> p_plan_id;
  UPDATE public.commercial_payment_plans SET is_default = true, updated_by = auth.uid()
   WHERE id = p_plan_id;

  IF v_prev.id IS NOT NULL THEN
    PERFORM public._cpp_audit(
      'commercial_plan_unset_default',
      v_prev.id,
      jsonb_build_object('is_default', true, 'code', v_prev.code, 'name', v_prev.name),
      jsonb_build_object('is_default', false, 'replaced_by_plan_id', p_plan_id),
      'substituido_por_novo_plano_padrao');
  END IF;

  PERFORM public._cpp_audit(
    'commercial_plan_set_default',
    p_plan_id,
    jsonb_build_object('is_default', v_old.is_default, 'code', v_old.code, 'name', v_old.name),
    jsonb_build_object('is_default', true, 'previous_default_plan_id', v_prev.id),
    NULL);
END
$function$;

-- 3) Pós-condição fail-fast: guard de vigência presente nos 4 caminhos + triggers declarativos
DO $post$
DECLARE
  v_sigs text[] := ARRAY[
    'public.simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)',
    'public.create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)',
    'public.convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean)',
    'public.respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)'
  ];
  s text; oid_ oid; v_missing text[] := '{}';
  v_extra int;
BEGIN
  FOREACH s IN ARRAY v_sigs LOOP
    oid_ := to_regprocedure(s);
    IF oid_ IS NULL THEN
      RAISE EXCEPTION 'POSCONDICAO: assinatura ausente: %', s;
    END IF;
    IF position('fn_b2b_plan_selectable' IN pg_get_functiondef(oid_)) = 0 THEN
      v_missing := v_missing || s;
    END IF;
  END LOOP;
  IF array_length(v_missing,1) IS NOT NULL THEN
    RAISE EXCEPTION 'POSCONDICAO: guard de vigencia ausente em: %', array_to_string(v_missing, ', ');
  END IF;

  -- overloads não auditados das 4 RPCs operacionais
  SELECT count(*) INTO v_extra
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('simulate_b2b_payment_plan_secure','create_partner_order_secure',
                      'convert_partner_simulation_to_order_secure','respond_b2b_order_quote_secure')
    AND NOT (p.oid::regprocedure::text = ANY (SELECT replace(x,'public.','') FROM unnest(v_sigs) x));
  IF v_extra > 0 THEN
    RAISE EXCEPTION 'POSCONDICAO: % overload(s) nao auditado(s) das RPCs operacionais', v_extra;
  END IF;

  IF (SELECT count(*) FROM pg_trigger
       WHERE tgname IN ('trg_b2b_plan_selectable_orders','trg_b2b_plan_selectable_terms')) <> 2 THEN
    RAISE EXCEPTION 'POSCONDICAO: triggers declarativos de vigencia ausentes';
  END IF;

  IF has_table_privilege('authenticated','public.commercial_payment_plans','select')
     OR has_table_privilege('anon','public.commercial_payment_plans','select') THEN
    RAISE EXCEPTION 'POSCONDICAO: leitura direta da tabela reaberta indevidamente';
  END IF;

  IF has_function_privilege('authenticated','public.fn_b2b_can_admin_plans(uuid)','execute')
     OR has_function_privilege('authenticated','public._cpp_audit(text,uuid,jsonb,jsonb,text)','execute')
     OR has_function_privilege('authenticated','public._cpp_validate_payload(jsonb)','execute') THEN
    RAISE EXCEPTION 'POSCONDICAO: auxiliares internas ainda executaveis por authenticated';
  END IF;
END
$post$;