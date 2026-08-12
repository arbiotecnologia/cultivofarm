-- ROLLBACK EXATO de 14-migration-20260831030000_finalizar_os_replay_idempotente.sql
DO $guard$
BEGIN
  IF current_database() = 'navfzbwgwzruipouyfnk'
     OR coalesce(current_setting('lovable.project_ref', true), '') = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO';
  END IF;
END
$guard$;

DO $rb$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public' AND p.proname='rpc_avancar_esteira_laboratorio';
  v_new := replace(v_def,
$old$    -- Replay idempotente do encerramento (duplo clique): nao gera evento novo.
    IF p_etapa_destino = 'finalizar_os' AND v_status_os = 'finalizada' THEN
        RETURN jsonb_build_object('success', true, 'replay', true,
                                  'message', 'OS já finalizada anteriormente.');
    END IF;

$old$, '');
  IF v_new <> v_def THEN EXECUTE v_new; END IF;
END
$rb$;
