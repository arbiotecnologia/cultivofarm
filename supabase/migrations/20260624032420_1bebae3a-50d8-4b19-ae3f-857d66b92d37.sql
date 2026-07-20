
-- ============ ficha_tecnica_versoes ============
CREATE TABLE public.ficha_tecnica_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL CHECK (entidade_tipo IN ('produto', 'microrganismo')),
  entidade_id uuid NOT NULL,
  profile_id uuid,
  campo text NOT NULL,
  conteudo_anterior text,
  conteudo_novo text,
  origem text NOT NULL CHECK (origem IN ('ia_manual', 'ia_global', 'humano')),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovada', 'rejeitada', 'substituida')),
  modelo_ia text,
  prompt_hash text,
  job_id uuid,
  criado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  revisado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revisado_em timestamptz,
  observacao text
);

CREATE INDEX idx_ftv_entidade ON public.ficha_tecnica_versoes (entidade_tipo, entidade_id, campo, criado_em DESC);
CREATE INDEX idx_ftv_status ON public.ficha_tecnica_versoes (status) WHERE status = 'pendente';
CREATE INDEX idx_ftv_job ON public.ficha_tecnica_versoes (job_id) WHERE job_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.ficha_tecnica_versoes TO authenticated;
GRANT ALL ON public.ficha_tecnica_versoes TO service_role;

ALTER TABLE public.ficha_tecnica_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ftv_select_tech" ON public.ficha_tecnica_versoes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor') OR
    public.has_role(auth.uid(), 'consultor_tecnico') OR
    public.has_role(auth.uid(), 'tecnico_agronomo')
  );

CREATE POLICY "ftv_insert_tech" ON public.ficha_tecnica_versoes
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor') OR
    public.has_role(auth.uid(), 'consultor_tecnico') OR
    public.has_role(auth.uid(), 'tecnico_agronomo')
  );

CREATE POLICY "ftv_update_admin" ON public.ficha_tecnica_versoes
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador') OR
    public.has_role(auth.uid(), 'gestor')
  );

-- ============ ai_refresh_jobs ============
CREATE TABLE public.ai_refresh_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  escopo jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'processando', 'concluido', 'falhou', 'cancelado')),
  total_itens integer NOT NULL DEFAULT 0,
  itens_processados integer NOT NULL DEFAULT 0,
  itens_com_sugestao integer NOT NULL DEFAULT 0,
  itens_falhos integer NOT NULL DEFAULT 0,
  modelo_ia text,
  erro text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz
);

CREATE INDEX idx_arj_status ON public.ai_refresh_jobs (status, iniciado_em DESC);

GRANT SELECT, INSERT, UPDATE ON public.ai_refresh_jobs TO authenticated;
GRANT ALL ON public.ai_refresh_jobs TO service_role;

ALTER TABLE public.ai_refresh_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arj_select_admin" ON public.ai_refresh_jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "arj_insert_admin" ON public.ai_refresh_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "arj_update_admin" ON public.ai_refresh_jobs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor'))
  WITH CHECK (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor'));

-- ============ Função para aprovar uma versão e aplicar ao profile ============
CREATE OR REPLACE FUNCTION public.aprovar_ficha_versao(p_versao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_versao public.ficha_tecnica_versoes%ROWTYPE;
  v_sql text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar versões';
  END IF;

  SELECT * INTO v_versao FROM public.ficha_tecnica_versoes WHERE id = p_versao_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Versão não encontrada'; END IF;
  IF v_versao.status <> 'pendente' THEN RAISE EXCEPTION 'Versão não está pendente'; END IF;

  -- Aplica ao profile correto
  IF v_versao.entidade_tipo = 'produto' THEN
    v_sql := format(
      'UPDATE public.product_technical_profiles SET %I = $1, updated_at = now() WHERE produto_id = $2',
      v_versao.campo
    );
    EXECUTE v_sql USING v_versao.conteudo_novo, v_versao.entidade_id;
  ELSE
    v_sql := format(
      'UPDATE public.microorganism_technical_profiles SET %I = $1, updated_at = now() WHERE microrganismo_id = $2',
      v_versao.campo
    );
    EXECUTE v_sql USING v_versao.conteudo_novo, v_versao.entidade_id;
  END IF;

  -- Marca anteriores como substituidas
  UPDATE public.ficha_tecnica_versoes
  SET status = 'substituida'
  WHERE entidade_tipo = v_versao.entidade_tipo
    AND entidade_id = v_versao.entidade_id
    AND campo = v_versao.campo
    AND status = 'aprovada';

  UPDATE public.ficha_tecnica_versoes
  SET status = 'aprovada',
      revisado_por = auth.uid(),
      revisado_em = now()
  WHERE id = p_versao_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.rejeitar_ficha_versao(p_versao_id uuid, p_observacao text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'administrador') OR public.has_role(auth.uid(), 'gestor')) THEN
    RAISE EXCEPTION 'Sem permissão para rejeitar versões';
  END IF;
  UPDATE public.ficha_tecnica_versoes
  SET status = 'rejeitada',
      revisado_por = auth.uid(),
      revisado_em = now(),
      observacao = COALESCE(p_observacao, observacao)
  WHERE id = p_versao_id AND status = 'pendente';
END;
$$;
