-- ============================================================================
-- H10 — Hardening do módulo Planejamento de Produção
-- STATUS: PREPARADA, NÃO APLICADA. Nenhum banco foi acessado nesta etapa.
--
-- Corrige as duas pendências de servidor documentadas no README do módulo:
--   1) Autorização real no servidor para criar/alterar planejamento e publicar OS.
--   2) Publicação de OS idempotente e segura contra concorrência/cliques simultâneos.
--
-- Regras: transacional, reexecutável, sem uso de DROP destrutivo,
-- sem apagar dados. Rollback documentado no README.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 0. DIAGNÓSTICO PRÉVIO — falha segura se houver duplicidade histórica.
--    Nenhuma deduplicação automática é executada.
-- ----------------------------------------------------------------------------
DO $diag$
DECLARE
  v_dup_links int;
  v_dup_os int;
BEGIN
  SELECT count(*) INTO v_dup_links
  FROM (
    SELECT partner_order_item_id
    FROM public.production_order_link
    GROUP BY partner_order_item_id
    HAVING count(*) > 1
  ) d;

  SELECT count(*) INTO v_dup_os
  FROM (
    SELECT os.partner_order_id, os.produto_id
    FROM public.ordens_servico os
    WHERE os.partner_order_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.production_order_link l WHERE l.ordem_servico_id = os.id
      )
    GROUP BY os.partner_order_id, os.produto_id
    HAVING count(*) > 1
  ) d;

  IF v_dup_links > 0 OR v_dup_os > 0 THEN
    RAISE EXCEPTION
      'h10_planejamento_duplicidade_historica: % item(ns) com vínculo duplicado e % grupo(s) de OS órfãs duplicadas.',
      v_dup_links, v_dup_os
      USING HINT = 'Revise manualmente (consulta no README). Nenhuma deduplicação automática é executada.';
  END IF;
END
$diag$;

-- ----------------------------------------------------------------------------
-- 1. AUTORIZAÇÃO — políticas explícitas por comando, sem ampliar acesso.
--    Papéis preservados: administrador, producao, gestor (leitura também para
--    gestor_comercial). DELETE deixa de ser exposto à API (histórico preservado).
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "planning_modify_staff" ON public.production_planning;

CREATE POLICY "planning_insert_producao" ON public.production_planning
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'gestor')
  );

CREATE POLICY "planning_update_producao" ON public.production_planning
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'gestor')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'gestor')
  );

REVOKE DELETE ON public.production_planning FROM authenticated;

DROP POLICY IF EXISTS "polink_modify_staff" ON public.production_order_link;

CREATE POLICY "polink_insert_producao" ON public.production_order_link
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'gestor')
  );

CREATE POLICY "polink_update_producao" ON public.production_order_link
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'gestor')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'producao')
    OR public.has_role(auth.uid(),'gestor')
  );

REVOKE DELETE ON public.production_order_link FROM authenticated;

-- ----------------------------------------------------------------------------
-- 2. IDEMPOTÊNCIA — ledger de publicações + RPC atômica
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.production_planning_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_id uuid NOT NULL REFERENCES public.production_planning(id),
  partner_order_id uuid NOT NULL REFERENCES public.partner_orders(id),
  idempotency_key text NOT NULL,
  os_created int NOT NULL DEFAULT 0,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_planning_publications_key
  ON public.production_planning_publications(idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_planning_publications_planning
  ON public.production_planning_publications(planning_id);
CREATE INDEX IF NOT EXISTS idx_planning_publications_order
  ON public.production_planning_publications(partner_order_id);

GRANT SELECT ON public.production_planning_publications TO authenticated;
GRANT ALL ON public.production_planning_publications TO service_role;

ALTER TABLE public.production_planning_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planning_pub_select_staff" ON public.production_planning_publications;
CREATE POLICY "planning_pub_select_staff" ON public.production_planning_publications
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador')
    OR public.has_role(auth.uid(),'gestor')
    OR public.has_role(auth.uid(),'gestor_comercial')
    OR public.has_role(auth.uid(),'producao')
  );
-- Escrita somente pela RPC SECURITY DEFINER abaixo (sem policies de escrita).

CREATE OR REPLACE FUNCTION public.rpc_planejamento_publicar_v1(
  p_planning_id uuid,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_pl public.production_planning%ROWTYPE;
  v_prev public.production_planning_publications%ROWTYPE;
  v_result jsonb;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'nao_autenticado' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid,'administrador')
    OR public.has_role(v_uid,'producao')
    OR public.has_role(v_uid,'gestor')
  ) THEN
    RAISE EXCEPTION 'permissao_negada' USING ERRCODE = '42501';
  END IF;

  IF p_planning_id IS NULL THEN
    RAISE EXCEPTION 'planejamento_invalido' USING ERRCODE = '22023';
  END IF;

  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'chave_idempotencia_obrigatoria' USING ERRCODE = '22023';
  END IF;

  -- Replay explícito pela chave: devolve o resultado original, sem novo efeito.
  SELECT * INTO v_prev
    FROM public.production_planning_publications
   WHERE idempotency_key = btrim(p_idempotency_key);
  IF FOUND THEN
    IF v_prev.planning_id <> p_planning_id THEN
      RAISE EXCEPTION 'chave_idempotencia_conflitante' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'replay', true,
      'planning_id', v_prev.planning_id,
      'os_created', v_prev.os_created,
      'resultado', v_prev.resultado
    );
  END IF;

  -- Serializa cliques/chamadas concorrentes sobre o mesmo planejamento.
  PERFORM pg_advisory_xact_lock(hashtext('planejamento_publicar:' || p_planning_id::text));

  SELECT * INTO v_pl FROM public.production_planning WHERE id = p_planning_id FOR UPDATE;
  IF v_pl.id IS NULL THEN
    RAISE EXCEPTION 'planejamento_nao_encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Replay por planejamento já publicado (outra chave, mesmo efeito).
  SELECT * INTO v_prev
    FROM public.production_planning_publications
   WHERE planning_id = p_planning_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true, 'replay', true,
      'planning_id', v_prev.planning_id,
      'os_created', v_prev.os_created,
      'resultado', v_prev.resultado
    );
  END IF;

  v_result := public.publish_planning_to_lab(p_planning_id);
  v_count := COALESCE((v_result->>'os_created')::int, 0);

  INSERT INTO public.production_planning_publications
    (planning_id, partner_order_id, idempotency_key, os_created, resultado, performed_by)
  VALUES
    (p_planning_id, v_pl.partner_order_id, btrim(p_idempotency_key), v_count, v_result, v_uid);

  RETURN jsonb_build_object(
    'ok', true, 'replay', false,
    'planning_id', p_planning_id,
    'os_created', v_count,
    'resultado', v_result
  );
END
$function$;

REVOKE ALL ON FUNCTION public.rpc_planejamento_publicar_v1(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rpc_planejamento_publicar_v1(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rpc_planejamento_publicar_v1(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_planejamento_publicar_v1(uuid, text) TO service_role;

-- A função legada permanece, mas sai da superfície direta do frontend:
-- passa a ser chamada apenas de dentro da RPC idempotente acima.
REVOKE ALL ON FUNCTION public.publish_planning_to_lab(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.publish_planning_to_lab(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.publish_planning_to_lab(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.publish_planning_to_lab(uuid) TO service_role;

COMMIT;
