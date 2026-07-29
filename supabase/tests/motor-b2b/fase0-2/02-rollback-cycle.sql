-- =====================================================================
-- MOTOR B2B — FASE 0.2 — T20: PROVA RUNTIME DO CICLO ROLLBACK -> HARDENING
--
-- NAO E MIGRATION. Execucao manual e explicita.
--
-- Ambiente permitido : STAGING ikaauvsflpmamgxmkhoq
-- Ambiente PROIBIDO  : PRODUCAO navfzbwgwzruipouyfnk
--
-- O ciclo inteiro roda dentro de uma subtransacao que SEMPRE sofre ROLLBACK:
-- o banco nunca permanece com o baseline vulneravel apos a execucao.
-- Apenas as linhas de evidencia sao persistidas.
--
--   psql "$PGURL_STAGING" -v ON_ERROR_STOP=1 -f 02-rollback-cycle.sql
-- =====================================================================

\set ON_ERROR_STOP on

DO $guard$
DECLARE v_ref text;
BEGIN
  SELECT project_ref INTO v_ref FROM public._fiscal_staging_marker WHERE marker='STAGING' LIMIT 1;
  IF v_ref IS DISTINCT FROM 'ikaauvsflpmamgxmkhoq' THEN
    RAISE EXCEPTION 'STAGING_GUARD: ambiente invalido %', coalesce(v_ref,'<null>');
  END IF;
END $guard$;

CREATE TEMP TABLE IF NOT EXISTS _motor_b2b_fase0_2_evidence (
  id bigserial PRIMARY KEY,
  test_code text NOT NULL,
  descricao text NOT NULL,
  identidade text NOT NULL,
  esperado text NOT NULL,
  obtido text NOT NULL,
  passou boolean NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now()
);

DO $cycle$
DECLARE
  fp_hard_ini text; fp_base text; fp_hard_fim text;
  v int; res jsonb := '[]'::jsonb;
  FUNC_FP text := $q$
    SELECT md5(string_agg(x,'|' ORDER BY x)) FROM (
      SELECT tablename||'.'||policyname||':'||coalesce(qual,'') AS x
        FROM pg_policies WHERE schemaname='public'
         AND tablename IN ('partner_order_payment_terms','partner_order_payment_schedule',
                           'accounts_receivable','accounts_receivable_installments')
      UNION ALL
      SELECT p.proname||':'||coalesce(array_to_string(p.proacl::text[],' '),'')
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname='public' AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure',
             'request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
      UNION ALL
      SELECT 'anon_terms:'||has_table_privilege('anon','public.partner_order_payment_terms','SELECT')::text
      UNION ALL
      SELECT 'idx_ari:'||(SELECT count(*)::text FROM pg_indexes WHERE schemaname='public' AND indexname='idx_ari_receivable')
    ) s $q$;
BEGIN
  EXECUTE FUNC_FP INTO fp_hard_ini;

  BEGIN
    -- ============ 1. aplica restore-policies.sql (baseline pre-Fase 0.2) ============
    DROP POLICY IF EXISTS popt_select ON public.partner_order_payment_terms;
    CREATE POLICY popt_select ON public.partner_order_payment_terms FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'financeiro'::app_role)
             OR has_role(auth.uid(),'gestor_comercial'::app_role)
             OR EXISTS (SELECT 1 FROM partner_orders po JOIN partner_users pu ON pu.partner_id=po.partner_id
                        WHERE po.id=partner_order_payment_terms.partner_order_id AND pu.user_id=auth.uid()));
    DROP POLICY IF EXISTS pops_select ON public.partner_order_payment_schedule;
    CREATE POLICY pops_select ON public.partner_order_payment_schedule FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'financeiro'::app_role)
             OR has_role(auth.uid(),'gestor_comercial'::app_role)
             OR EXISTS (SELECT 1 FROM partner_orders po JOIN partner_users pu ON pu.partner_id=po.partner_id
                        WHERE po.id=partner_order_payment_schedule.partner_order_id AND pu.user_id=auth.uid()));
    DROP POLICY IF EXISTS ar_producer_read ON public.accounts_receivable;
    CREATE POLICY ar_producer_read ON public.accounts_receivable FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'cliente_produtor'::app_role)
             AND customer_id = ANY (get_cliente_ids_for_user(auth.uid())));
    DROP POLICY IF EXISTS ar_partner_select_own_b2b ON public.accounts_receivable;
    CREATE POLICY ar_partner_select_own_b2b ON public.accounts_receivable FOR SELECT TO authenticated
      USING (origin_type='B2B_ORDER'
             AND partner_id IN (SELECT pu.partner_id FROM partner_users pu WHERE pu.user_id=auth.uid()));
    DROP POLICY IF EXISTS ari_producer_read ON public.accounts_receivable_installments;
    CREATE POLICY ari_producer_read ON public.accounts_receivable_installments FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'cliente_produtor'::app_role)
             AND EXISTS (SELECT 1 FROM accounts_receivable ar WHERE ar.id=accounts_receivable_installments.receivable_id
                         AND ar.customer_id = ANY (get_cliente_ids_for_user(auth.uid()))));
    DROP POLICY IF EXISTS ari_partner_select_own_b2b ON public.accounts_receivable_installments;
    GRANT EXECUTE ON FUNCTION public.approve_b2b_payment_terms_secure(uuid,text) TO PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.reject_b2b_payment_terms_secure(uuid,text) TO PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid,text) TO PUBLIC, anon, authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.add_b2b_payment_terms_note_secure(uuid,text) TO PUBLIC, anon, authenticated, service_role;
    GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.partner_order_payment_terms TO anon;
    GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.partner_order_payment_schedule TO anon;
    GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.partner_orders TO anon;
    GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.partner_order_items TO anon;
    GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE public.partner_users TO anon;
    DROP INDEX IF EXISTS public.idx_ari_receivable;

    EXECUTE FUNC_FP INTO fp_base;

    SELECT count(*)::int INTO v FROM pg_policies WHERE schemaname='public'
      AND policyname IN ('popt_select','pops_select') AND qual LIKE '%parceiro_b2b%';
    res := res || jsonb_build_array(jsonb_build_object('code','T20.1',
      'desc','Apos rollback: terms/schedule voltam a NAO exigir papel parceiro_b2b','ident','n/a',
      'exp','0','got',v::text,'pass',v=0));

    SELECT count(*)::int INTO v FROM pg_policies WHERE schemaname='public'
      AND tablename='accounts_receivable' AND policyname='ar_producer_read' AND qual LIKE '%partner_id IS NULL%';
    res := res || jsonb_build_array(jsonb_build_object('code','T20.2',
      'desc','Apos rollback: produtor volta a enxergar recebivel B2B','ident','n/a',
      'exp','0','got',v::text,'pass',v=0));

    SELECT count(*)::int INTO v FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname IN ('approve_b2b_payment_terms_secure','reject_b2b_payment_terms_secure',
            'request_b2b_payment_terms_adjustment_secure','add_b2b_payment_terms_note_secure')
        AND has_function_privilege('anon',p.oid,'EXECUTE');
    res := res || jsonb_build_array(jsonb_build_object('code','T20.3',
      'desc','Apos rollback: anon volta a executar as 4 RPCs','ident','anon','exp','4','got',v::text,'pass',v=4));

    res := res || jsonb_build_array(jsonb_build_object('code','T20.4',
      'desc','Impressao digital do baseline difere da endurecida','ident','n/a',
      'exp','diferente','got',CASE WHEN fp_base <> fp_hard_ini THEN 'diferente' ELSE 'igual' END,
      'pass', fp_base <> fp_hard_ini));

    -- ============ 2. reaplica o hardening canonico ============
    DROP POLICY IF EXISTS popt_select ON public.partner_order_payment_terms;
    CREATE POLICY popt_select ON public.partner_order_payment_terms FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'financeiro'::app_role)
             OR has_role(auth.uid(),'gestor_comercial'::app_role)
             OR (has_role(auth.uid(),'parceiro_b2b'::app_role)
                 AND EXISTS (SELECT 1 FROM public.partner_orders po JOIN public.partner_users pu ON pu.partner_id=po.partner_id
                             WHERE po.id=partner_order_payment_terms.partner_order_id AND pu.user_id=auth.uid())));
    DROP POLICY IF EXISTS pops_select ON public.partner_order_payment_schedule;
    CREATE POLICY pops_select ON public.partner_order_payment_schedule FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'administrador'::app_role) OR has_role(auth.uid(),'financeiro'::app_role)
             OR has_role(auth.uid(),'gestor_comercial'::app_role)
             OR (has_role(auth.uid(),'parceiro_b2b'::app_role)
                 AND EXISTS (SELECT 1 FROM public.partner_orders po JOIN public.partner_users pu ON pu.partner_id=po.partner_id
                             WHERE po.id=partner_order_payment_schedule.partner_order_id AND pu.user_id=auth.uid())));
    DROP POLICY IF EXISTS ar_producer_read ON public.accounts_receivable;
    CREATE POLICY ar_producer_read ON public.accounts_receivable FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'cliente_produtor'::app_role)
             AND customer_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
             AND partner_id IS NULL AND origin_type IS DISTINCT FROM 'B2B_ORDER');
    DROP POLICY IF EXISTS ar_partner_select_own_b2b ON public.accounts_receivable;
    CREATE POLICY ar_partner_select_own_b2b ON public.accounts_receivable FOR SELECT TO authenticated
      USING (origin_type='B2B_ORDER' AND has_role(auth.uid(),'parceiro_b2b'::app_role)
             AND partner_id IN (SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id=auth.uid()));
    DROP POLICY IF EXISTS ari_producer_read ON public.accounts_receivable_installments;
    CREATE POLICY ari_producer_read ON public.accounts_receivable_installments FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'cliente_produtor'::app_role)
             AND EXISTS (SELECT 1 FROM public.accounts_receivable ar WHERE ar.id=accounts_receivable_installments.receivable_id
                         AND ar.customer_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
                         AND ar.partner_id IS NULL AND ar.origin_type IS DISTINCT FROM 'B2B_ORDER'));
    DROP POLICY IF EXISTS ari_partner_select_own_b2b ON public.accounts_receivable_installments;
    CREATE POLICY ari_partner_select_own_b2b ON public.accounts_receivable_installments FOR SELECT TO authenticated
      USING (has_role(auth.uid(),'parceiro_b2b'::app_role)
             AND EXISTS (SELECT 1 FROM public.accounts_receivable ar WHERE ar.id=accounts_receivable_installments.receivable_id
                         AND ar.origin_type='B2B_ORDER'
                         AND ar.partner_id IN (SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id=auth.uid())));
    REVOKE ALL ON FUNCTION public.approve_b2b_payment_terms_secure(uuid,text) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.reject_b2b_payment_terms_secure(uuid,text) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid,text) FROM PUBLIC, anon;
    REVOKE ALL ON FUNCTION public.add_b2b_payment_terms_note_secure(uuid,text) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION public.approve_b2b_payment_terms_secure(uuid,text) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.reject_b2b_payment_terms_secure(uuid,text) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid,text) TO authenticated, service_role;
    GRANT EXECUTE ON FUNCTION public.add_b2b_payment_terms_note_secure(uuid,text) TO authenticated, service_role;
    REVOKE ALL ON TABLE public.partner_order_payment_terms FROM anon;
    REVOKE ALL ON TABLE public.partner_order_payment_schedule FROM anon;
    REVOKE ALL ON TABLE public.partner_orders FROM anon;
    REVOKE ALL ON TABLE public.partner_order_items FROM anon;
    REVOKE ALL ON TABLE public.partner_users FROM anon;
    CREATE INDEX IF NOT EXISTS idx_ari_receivable ON public.accounts_receivable_installments (receivable_id);

    EXECUTE FUNC_FP INTO fp_hard_fim;
    res := res || jsonb_build_array(jsonb_build_object('code','T20.5',
      'desc','Reaplicacao do hardening reproduz exatamente a impressao digital segura inicial','ident','n/a',
      'exp','identica','got',CASE WHEN fp_hard_fim = fp_hard_ini THEN 'identica' ELSE 'divergente' END,
      'pass', fp_hard_fim = fp_hard_ini));

    RAISE EXCEPTION 'FASE02_CYCLE_ROLLBACK' USING ERRCODE='P0001';
  EXCEPTION
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM <> 'FASE02_CYCLE_ROLLBACK' THEN
        res := res || jsonb_build_array(jsonb_build_object('code','T20-FATAL','desc',SQLERRM,'ident','n/a',
          'exp','sem erro','got',SQLERRM,'pass',false));
      END IF;
    WHEN OTHERS THEN
      res := res || jsonb_build_array(jsonb_build_object('code','T20-FATAL','desc',SQLERRM,'ident','n/a',
        'exp','sem erro','got',SQLSTATE||' '||SQLERRM,'pass',false));
  END;

  EXECUTE FUNC_FP INTO fp_hard_fim;
  res := res || jsonb_build_array(jsonb_build_object('code','T20.6',
    'desc','Estado final do staging permanece endurecido apos o ciclo','ident','n/a',
    'exp','identica','got',CASE WHEN fp_hard_fim = fp_hard_ini THEN 'identica' ELSE 'divergente' END,
    'pass', fp_hard_fim = fp_hard_ini));

  INSERT INTO _motor_b2b_fase0_2_evidence (test_code, descricao, identidade, esperado, obtido, passou)
  SELECT e->>'code', e->>'desc', e->>'ident', e->>'exp', e->>'got', (e->>'pass')::boolean
  FROM jsonb_array_elements(res) e;
END $cycle$;

SELECT test_code, esperado, obtido, passou
FROM _motor_b2b_fase0_2_evidence
WHERE test_code LIKE 'T20%'
ORDER BY id;

-- Limpeza defensiva: a tabela de evidencia e TEMP (some no fim da sessao).
DROP TABLE IF EXISTS _motor_b2b_fase0_2_evidence;
DROP TABLE IF EXISTS public._motor_b2b_fase0_2_evidence;
