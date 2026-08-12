-- =====================================================================
-- FASE 5 — correção incremental de DETERMINISMO na leitura do laudo CQ.
--
-- Evidência concreta (harness 31-e2e-fase5): quando dois laudos do mesmo
-- lote compartilham o mesmo `created_at` (ex.: reprovar_cq seguido de
-- aprovar_cq na mesma transação / mesmo instante), o `ORDER BY created_at
-- DESC [, id DESC]` não desempata pela ordem real de inserção — `id` é
-- uuid aleatório. Resultado: o motor podia ler o laudo REPROVADO como
-- "mais recente" e bloquear indevidamente o envase de um lote aprovado.
--
-- Correção: desempate por `ctid DESC` (ordem física de inserção),
-- preservando integralmente a regra vigente (o último laudo manda).
--
-- Guard fail-closed: EXCLUSIVO staging ikaauvsflpmamgxmkhoq.
-- Produção navfzbwgwzruipouyfnk explicitamente RECUSADA.
-- =====================================================================

DO $guard$
BEGIN
  IF current_database() = 'navfzbwgwzruipouyfnk'
     OR coalesce(current_setting('lovable.project_ref', true), '') = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: migration proibida em navfzbwgwzruipouyfnk';
  END IF;
  IF to_regclass('public._fiscal_staging_marker') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker
                     WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq') THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo nao e o staging ikaauvsflpmamgxmkhoq';
  END IF;
END
$guard$;

-- 1) Motor de envase: desempate determinístico do laudo CQ.
DO $patch$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'rpc_cockpit_registrar_envase_v1';
  IF v_def IS NULL THEN RAISE EXCEPTION 'ABORT: rpc_cockpit_registrar_envase_v1 ausente'; END IF;

  v_new := replace(
    v_def,
    'FROM public.controle_qualidade WHERE lote_id = p_lote_id
   ORDER BY created_at DESC LIMIT 1;',
    'FROM public.controle_qualidade WHERE lote_id = p_lote_id
   ORDER BY created_at DESC, ctid DESC LIMIT 1;'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'ABORT: padrao de ordenacao do CQ nao localizado (funcao ja alterada?)';
  END IF;

  EXECUTE v_new;
END
$patch$;

-- 2) Motor da esteira: mesma regra de desempate ao ler o laudo vigente.
DO $patch2$
DECLARE
  v_def text;
  v_new text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_rpc_avancar_esteira_laboratorio_internal';
  IF v_def IS NULL THEN RAISE EXCEPTION 'ABORT: motor da esteira ausente'; END IF;

  v_new := replace(v_def,
    'ORDER BY created_at DESC, id DESC',
    'ORDER BY created_at DESC, ctid DESC');

  IF v_new = v_def THEN
    RAISE EXCEPTION 'ABORT: padrao de ordenacao do CQ nao localizado no motor da esteira';
  END IF;

  EXECUTE v_new;
END
$patch2$;

-- Menor privilégio preservado.
REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public._rpc_avancar_esteira_laboratorio_internal(uuid, text, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid, uuid, text, uuid, jsonb, date, text, text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid, uuid, text, uuid, jsonb, date, text, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid, uuid, text, uuid, jsonb, date, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_cockpit_registrar_envase_v1(uuid, uuid, text, uuid, jsonb, date, text, text, boolean, text) TO service_role;
