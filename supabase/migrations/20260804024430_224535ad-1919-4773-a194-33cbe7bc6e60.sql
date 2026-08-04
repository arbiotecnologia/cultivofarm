DO $$
DECLARE
  r record;
  v_def text;
  v_new text;
  v_map jsonb := jsonb_build_object(
    'reservar_estoque_item','reserva',
    'rpc_cockpit_cancelar_reserva_v1','cancelamento_reserva',
    'rpc_cockpit_confirmar_entrega_v1','entrega',
    'rpc_cockpit_registrar_envase_v1','entrada',
    '_seed_cockpit_fixtures_impl','entrada'
  );
  v_acao text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('reservar_estoque_item','rpc_cockpit_cancelar_reserva_v1',
                         'rpc_cockpit_confirmar_entrega_v1','rpc_cockpit_registrar_envase_v1',
                         '_seed_cockpit_fixtures_impl')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    IF position('fn_estoque_ctx_open' in v_def) > 0 THEN CONTINUE; END IF;
    v_acao := v_map->>r.proname;
    v_new := regexp_replace(
      v_def,
      '(AS \$function\$\s*(?:DECLARE[\s\S]*?)?\mBEGIN\M)',
      '\1' || format(
        E'\n  PERFORM public.fn_estoque_ctx_open(jsonb_build_object(''acao'',%L,''origem'',%L,''usuario_id'',auth.uid()::text));',
        v_acao, r.proname),
      ''
    );
    IF v_new = v_def THEN
      RAISE EXCEPTION 'Não foi possível instrumentar a função %', r.proname;
    END IF;
    EXECUTE v_new;
  END LOOP;
END $$;

-- Confirmação: todas instrumentadas
DO $$
DECLARE v_faltando text;
BEGIN
  SELECT string_agg(p.proname, ', ') INTO v_faltando
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('reservar_estoque_item','rpc_cockpit_cancelar_reserva_v1',
                       'rpc_cockpit_confirmar_entrega_v1','rpc_cockpit_registrar_envase_v1',
                       '_seed_cockpit_fixtures_impl')
     AND position('fn_estoque_ctx_open' in p.prosrc) = 0;
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'Funções sem contexto de estoque: %', v_faltando;
  END IF;
END $$;