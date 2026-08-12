-- ROLLBACK EXATO de 12-migration-20260831010000_cq_desempate_determinismo.sql
-- Reverte o desempate `ctid DESC` para a ordenação anterior.
-- Guard fail-closed: staging ikaauvsflpmamgxmkhoq. Produção RECUSADA.

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
   WHERE n.nspname = 'public' AND p.proname = 'rpc_cockpit_registrar_envase_v1';
  v_new := replace(v_def,
    'ORDER BY created_at DESC, ctid DESC LIMIT 1;',
    'ORDER BY created_at DESC LIMIT 1;');
  IF v_new <> v_def THEN EXECUTE v_new; END IF;
END
$rb$;

DO $rb2$
DECLARE v_def text; v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_rpc_avancar_esteira_laboratorio_internal';
  v_new := replace(v_def,
    'ORDER BY created_at DESC, ctid DESC',
    'ORDER BY created_at DESC, id DESC');
  IF v_new <> v_def THEN EXECUTE v_new; END IF;
END
$rb2$;

REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) TO service_role;
