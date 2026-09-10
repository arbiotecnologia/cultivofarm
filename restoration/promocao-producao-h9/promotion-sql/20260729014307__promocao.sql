-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É UMA MIGRATION HISTÓRICA
-- Origem: supabase/migrations/20260729014307_motor_b2b_fase0_2_reconciliacao.sql
-- SHA-256 da origem: 67781b37fd59141a51fd5017584d00ff92cf237f01280f7fcdc7f0abdd0f7b2d
-- Gerado por: restoration/promocao-producao-h9/gerar-promotion-sql.py (determinístico)
-- Transformação aplicada: to_regclass(marcador) -> true
-- O arquivo de origem NÃO foi alterado.
--
-- Guarda canônica: o runner valida o ref do alvo por canal externo e só então
-- executa `SET LOCAL promocao.target_ref = 'navfzbwgwzruipouyfnk'`. Nenhuma tabela marcadora
-- de homologação é consultada.
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
DO $guard$
DECLARE v_ref text;
BEGIN
  IF true THEN
    EXECUTE 'SELECT project_ref FROM public._fiscal_staging_marker WHERE marker = ''STAGING'' LIMIT 1'
      INTO v_ref;
  END IF;
  IF v_ref = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'STAGING_GUARD: project_ref de PRODUCAO recusado';
  END IF;
END
$guard$;

-- 1. Reafirmacao idempotente das policies endurecidas (mesma definicao canonica)
DROP POLICY IF EXISTS popt_select ON public.partner_order_payment_terms;
CREATE POLICY popt_select ON public.partner_order_payment_terms
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.partner_orders po
      JOIN public.partner_users pu ON pu.partner_id = po.partner_id
      WHERE po.id = partner_order_payment_terms.partner_order_id
        AND pu.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS pops_select ON public.partner_order_payment_schedule;
CREATE POLICY pops_select ON public.partner_order_payment_schedule
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role)
  OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role)
  OR (
    has_role(auth.uid(), 'parceiro_b2b'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.partner_orders po
      JOIN public.partner_users pu ON pu.partner_id = po.partner_id
      WHERE po.id = partner_order_payment_schedule.partner_order_id
        AND pu.user_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS ar_producer_read ON public.accounts_receivable;
CREATE POLICY ar_producer_read ON public.accounts_receivable
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cliente_produtor'::app_role)
  AND customer_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
  AND partner_id IS NULL
  AND origin_type IS DISTINCT FROM 'B2B_ORDER'
);

DROP POLICY IF EXISTS ar_partner_select_own_b2b ON public.accounts_receivable;
CREATE POLICY ar_partner_select_own_b2b ON public.accounts_receivable
FOR SELECT TO authenticated
USING (
  origin_type = 'B2B_ORDER'
  AND has_role(auth.uid(), 'parceiro_b2b'::app_role)
  AND partner_id IN (SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid())
);

DROP POLICY IF EXISTS ari_producer_read ON public.accounts_receivable_installments;
CREATE POLICY ari_producer_read ON public.accounts_receivable_installments
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'cliente_produtor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.accounts_receivable ar
    WHERE ar.id = accounts_receivable_installments.receivable_id
      AND ar.customer_id = ANY (public.get_cliente_ids_for_user(auth.uid()))
      AND ar.partner_id IS NULL
      AND ar.origin_type IS DISTINCT FROM 'B2B_ORDER'
  )
);

DROP POLICY IF EXISTS ari_partner_select_own_b2b ON public.accounts_receivable_installments;
CREATE POLICY ari_partner_select_own_b2b ON public.accounts_receivable_installments
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'parceiro_b2b'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.accounts_receivable ar
    WHERE ar.id = accounts_receivable_installments.receivable_id
      AND ar.origin_type = 'B2B_ORDER'
      AND ar.partner_id IN (SELECT pu.partner_id FROM public.partner_users pu WHERE pu.user_id = auth.uid())
  )
);

-- 2. ACLs das RPCs sensiveis
REVOKE ALL ON FUNCTION public.approve_b2b_payment_terms_secure(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reject_b2b_payment_terms_secure(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_b2b_payment_terms_note_secure(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_b2b_payment_terms_secure(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reject_b2b_payment_terms_secure(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_b2b_payment_terms_adjustment_secure(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_b2b_payment_terms_note_secure(uuid, text) TO authenticated, service_role;

-- 3. Remocao do acesso anon (nenhum fluxo publico usa estas tabelas)
REVOKE ALL ON TABLE public.partner_order_payment_terms FROM anon;
REVOKE ALL ON TABLE public.partner_order_payment_schedule FROM anon;
REVOKE ALL ON TABLE public.partner_orders FROM anon;
REVOKE ALL ON TABLE public.partner_order_items FROM anon;
REVOKE ALL ON TABLE public.partner_users FROM anon;

-- 4. Indice de apoio
CREATE INDEX IF NOT EXISTS idx_ari_receivable
  ON public.accounts_receivable_installments (receivable_id);

-- 5. Remocao da tabela tecnica de evidencias da execucao anterior
DROP TABLE IF EXISTS public._motor_b2b_fase0_2_harness;