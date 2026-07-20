
-- ============================================================
-- CATÁLOGO TÉCNICO — FASES 1 e 2
-- ============================================================

-- Helper: updated_at trigger (reuso da função padrão se já existir)
CREATE OR REPLACE FUNCTION public.catalog_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============================================================
-- 1. microorganism_technical_profiles
-- ============================================================
CREATE TABLE public.microorganism_technical_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  microrganismo_id uuid NOT NULL REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  resumo_curto text,
  mecanismo_acao text,
  beneficios_agronomicos text,
  explicacao_tecnica text,
  explicacao_produtor text,
  explicacao_b2b text,
  indicacoes_uso text,
  cuidados_aplicacao text,
  compatibilidade text,
  armazenamento text,
  observacoes_regulatorias text,
  status_validacao text NOT NULL DEFAULT 'rascunho'
    CHECK (status_validacao IN ('rascunho','em_revisao','aprovado','arquivado')),
  validado_por uuid,
  validado_em timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_microorganism_technical_profiles_micro
  ON public.microorganism_technical_profiles(microrganismo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microorganism_technical_profiles TO authenticated;
GRANT ALL ON public.microorganism_technical_profiles TO service_role;

-- ============================================================
-- 2. microorganism_targets
-- ============================================================
CREATE TABLE public.microorganism_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  microrganismo_id uuid NOT NULL REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  alvo_nome text NOT NULL,
  alvo_tipo text NOT NULL
    CHECK (alvo_tipo IN ('praga','doenca','nematoide','nutricao','solo','estresse','crescimento')),
  descricao text,
  prioridade int NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_microorganism_targets_micro ON public.microorganism_targets(microrganismo_id);
CREATE INDEX idx_microorganism_targets_alvo ON public.microorganism_targets(alvo_tipo, alvo_nome);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microorganism_targets TO authenticated;
GRANT ALL ON public.microorganism_targets TO service_role;

-- ============================================================
-- 3. microorganism_crop_recommendations
-- ============================================================
CREATE TABLE public.microorganism_crop_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  microrganismo_id uuid NOT NULL REFERENCES public.microrganismos(id) ON DELETE CASCADE,
  cultura_id uuid REFERENCES public.culturas(id) ON DELETE SET NULL,
  cultura_nome text,
  fase_recomendada text,
  objetivo_uso text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_microorganism_crop_recommendations_micro
  ON public.microorganism_crop_recommendations(microrganismo_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.microorganism_crop_recommendations TO authenticated;
GRANT ALL ON public.microorganism_crop_recommendations TO service_role;

-- ============================================================
-- 4. product_technical_profiles
-- ============================================================
CREATE TABLE public.product_technical_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  resumo_curto text,
  beneficio_combinado text,
  explicacao_tecnica text,
  explicacao_produtor text,
  explicacao_b2b text,
  indicacoes_uso text,
  janela_aplicacao text,
  cuidados_aplicacao text,
  compatibilidade text,
  observacoes_regulatorias text,
  status_validacao text NOT NULL DEFAULT 'rascunho'
    CHECK (status_validacao IN ('rascunho','em_revisao','aprovado','arquivado')),
  validado_por uuid,
  validado_em timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_product_technical_profiles_produto
  ON public.product_technical_profiles(produto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_technical_profiles TO authenticated;
GRANT ALL ON public.product_technical_profiles TO service_role;

-- ============================================================
-- 5. product_target_recommendations
-- ============================================================
CREATE TABLE public.product_target_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  alvo_nome text NOT NULL,
  alvo_tipo text NOT NULL
    CHECK (alvo_tipo IN ('praga','doenca','nematoide','nutricao','solo','estresse','crescimento')),
  descricao text,
  prioridade int NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_target_recommendations_produto
  ON public.product_target_recommendations(produto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_target_recommendations TO authenticated;
GRANT ALL ON public.product_target_recommendations TO service_role;

-- ============================================================
-- 6. product_crop_recommendations
-- ============================================================
CREATE TABLE public.product_crop_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produto_id uuid NOT NULL REFERENCES public.produtos(id) ON DELETE CASCADE,
  cultura_id uuid REFERENCES public.culturas(id) ON DELETE SET NULL,
  cultura_nome text,
  fase_recomendada text,
  objetivo_uso text,
  dose_recomendada text,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_product_crop_recommendations_produto
  ON public.product_crop_recommendations(produto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_crop_recommendations TO authenticated;
GRANT ALL ON public.product_crop_recommendations TO service_role;

-- ============================================================
-- 7. catalog_technical_audit_logs
-- ============================================================
CREATE TABLE public.catalog_technical_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade_tipo text NOT NULL,
  entidade_id uuid NOT NULL,
  acao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb,
  usuario_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_technical_audit_entity
  ON public.catalog_technical_audit_logs(entidade_tipo, entidade_id);
CREATE INDEX idx_catalog_technical_audit_user
  ON public.catalog_technical_audit_logs(usuario_id);

GRANT SELECT, INSERT ON public.catalog_technical_audit_logs TO authenticated;
GRANT ALL ON public.catalog_technical_audit_logs TO service_role;

-- ============================================================
-- 8. catalog_access_events (Fase 14)
-- ============================================================
CREATE TABLE public.catalog_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  role text,
  entidade_tipo text NOT NULL,
  entidade_id uuid NOT NULL,
  origem text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_catalog_access_events_entity
  ON public.catalog_access_events(entidade_tipo, entidade_id);
CREATE INDEX idx_catalog_access_events_user
  ON public.catalog_access_events(user_id);
CREATE INDEX idx_catalog_access_events_created
  ON public.catalog_access_events(created_at DESC);

GRANT SELECT, INSERT ON public.catalog_access_events TO authenticated;
GRANT ALL ON public.catalog_access_events TO service_role;

-- ============================================================
-- TRIGGERS — updated_at
-- ============================================================
CREATE TRIGGER trg_micro_tp_updated_at
  BEFORE UPDATE ON public.microorganism_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.catalog_set_updated_at();

CREATE TRIGGER trg_prod_tp_updated_at
  BEFORE UPDATE ON public.product_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.catalog_set_updated_at();

-- ============================================================
-- TRIGGERS — validação de aprovação
-- ============================================================
CREATE OR REPLACE FUNCTION public.validate_micro_profile_approval()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status_validacao = 'aprovado' THEN
    IF NEW.resumo_curto IS NULL OR length(trim(NEW.resumo_curto)) = 0
       OR NEW.explicacao_tecnica IS NULL OR length(trim(NEW.explicacao_tecnica)) = 0
       OR NEW.explicacao_produtor IS NULL OR length(trim(NEW.explicacao_produtor)) = 0 THEN
      RAISE EXCEPTION 'Ficha técnica não pode ser aprovada sem resumo_curto, explicacao_tecnica e explicacao_produtor';
    END IF;
    IF NEW.validado_em IS NULL THEN NEW.validado_em := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_micro_profile_approval
  BEFORE INSERT OR UPDATE ON public.microorganism_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_micro_profile_approval();

CREATE OR REPLACE FUNCTION public.validate_product_profile_approval()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status_validacao = 'aprovado' THEN
    IF NEW.resumo_curto IS NULL OR length(trim(NEW.resumo_curto)) = 0
       OR NEW.explicacao_tecnica IS NULL OR length(trim(NEW.explicacao_tecnica)) = 0
       OR NEW.explicacao_produtor IS NULL OR length(trim(NEW.explicacao_produtor)) = 0
       OR NEW.beneficio_combinado IS NULL OR length(trim(NEW.beneficio_combinado)) = 0 THEN
      RAISE EXCEPTION 'Ficha de produto não pode ser aprovada sem resumo_curto, explicacao_tecnica, explicacao_produtor e beneficio_combinado';
    END IF;
    IF NEW.validado_em IS NULL THEN NEW.validado_em := now(); END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_validate_product_profile_approval
  BEFORE INSERT OR UPDATE ON public.product_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.validate_product_profile_approval();

-- ============================================================
-- TRIGGERS — auditoria genérica
-- ============================================================
CREATE OR REPLACE FUNCTION public.catalog_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_entidade text := TG_ARGV[0];
  v_old jsonb;
  v_new jsonb;
  v_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_new := NULL; v_id := OLD.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_id := NEW.id;
  ELSE
    v_old := NULL; v_new := to_jsonb(NEW); v_id := NEW.id;
  END IF;

  INSERT INTO public.catalog_technical_audit_logs(entidade_tipo, entidade_id, acao, dados_anteriores, dados_novos, usuario_id)
  VALUES (v_entidade, v_id, lower(TG_OP), v_old, v_new, auth.uid());

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_micro_profile
  AFTER INSERT OR UPDATE OR DELETE ON public.microorganism_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.catalog_audit_log('ficha_microrganismo');

CREATE TRIGGER trg_audit_product_profile
  AFTER INSERT OR UPDATE OR DELETE ON public.product_technical_profiles
  FOR EACH ROW EXECUTE FUNCTION public.catalog_audit_log('ficha_produto');

CREATE TRIGGER trg_audit_micro_targets
  AFTER INSERT OR UPDATE OR DELETE ON public.microorganism_targets
  FOR EACH ROW EXECUTE FUNCTION public.catalog_audit_log('alvo_microrganismo');

CREATE TRIGGER trg_audit_product_targets
  AFTER INSERT OR UPDATE OR DELETE ON public.product_target_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.catalog_audit_log('alvo_produto');

CREATE TRIGGER trg_audit_micro_crops
  AFTER INSERT OR UPDATE OR DELETE ON public.microorganism_crop_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.catalog_audit_log('cultura_microrganismo');

CREATE TRIGGER trg_audit_product_crops
  AFTER INSERT OR UPDATE OR DELETE ON public.product_crop_recommendations
  FOR EACH ROW EXECUTE FUNCTION public.catalog_audit_log('cultura_produto');

-- ============================================================
-- FASE 2 — RLS
-- ============================================================

-- Helper para escrita por equipe técnica/admin
CREATE OR REPLACE FUNCTION public.can_manage_catalog_tecnico(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'administrador')
      OR public.has_role(_uid,'gestor')
      OR public.has_role(_uid,'consultor_tecnico')
      OR public.has_role(_uid,'tecnico_agronomo');
$$;

CREATE OR REPLACE FUNCTION public.can_view_catalog_internal(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_uid,'administrador')
      OR public.has_role(_uid,'gestor')
      OR public.has_role(_uid,'consultor_tecnico')
      OR public.has_role(_uid,'tecnico_agronomo')
      OR public.has_role(_uid,'gestor_comercial')
      OR public.has_role(_uid,'operador_onfarm')
      OR public.has_role(_uid,'producao')
      OR public.has_role(_uid,'administrativo')
      OR public.has_role(_uid,'financeiro');
$$;

-- ============== microorganism_technical_profiles ==============
ALTER TABLE public.microorganism_technical_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "micro_tp_read_internal" ON public.microorganism_technical_profiles
  FOR SELECT TO authenticated
  USING (
    public.can_view_catalog_internal(auth.uid())
    OR (
      status_validacao = 'aprovado'
      AND EXISTS (
        SELECT 1 FROM public.microrganismos m
        WHERE m.id = microrganismo_id AND m.ativo = true
          AND (
            public.has_role(auth.uid(),'cliente_produtor')
            OR (public.has_role(auth.uid(),'parceiro_b2b') AND m.b2b_enabled = true)
          )
      )
    )
  );

CREATE POLICY "micro_tp_insert_team" ON public.microorganism_technical_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalog_tecnico(auth.uid()));

CREATE POLICY "micro_tp_update_team" ON public.microorganism_technical_profiles
  FOR UPDATE TO authenticated
  USING (public.can_manage_catalog_tecnico(auth.uid()))
  WITH CHECK (public.can_manage_catalog_tecnico(auth.uid()));

CREATE POLICY "micro_tp_delete_admin" ON public.microorganism_technical_profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

-- ============== microorganism_targets ==============
ALTER TABLE public.microorganism_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "micro_targets_read" ON public.microorganism_targets
  FOR SELECT TO authenticated
  USING (
    public.can_view_catalog_internal(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.microrganismos m
      WHERE m.id = microrganismo_id AND m.ativo = true
        AND (
          public.has_role(auth.uid(),'cliente_produtor')
          OR (public.has_role(auth.uid(),'parceiro_b2b') AND m.b2b_enabled = true)
        )
    )
  );

CREATE POLICY "micro_targets_write" ON public.microorganism_targets
  FOR ALL TO authenticated
  USING (public.can_manage_catalog_tecnico(auth.uid()))
  WITH CHECK (public.can_manage_catalog_tecnico(auth.uid()));

-- ============== microorganism_crop_recommendations ==============
ALTER TABLE public.microorganism_crop_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "micro_crops_read" ON public.microorganism_crop_recommendations
  FOR SELECT TO authenticated
  USING (
    public.can_view_catalog_internal(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.microrganismos m
      WHERE m.id = microrganismo_id AND m.ativo = true
        AND (
          public.has_role(auth.uid(),'cliente_produtor')
          OR (public.has_role(auth.uid(),'parceiro_b2b') AND m.b2b_enabled = true)
        )
    )
  );

CREATE POLICY "micro_crops_write" ON public.microorganism_crop_recommendations
  FOR ALL TO authenticated
  USING (public.can_manage_catalog_tecnico(auth.uid()))
  WITH CHECK (public.can_manage_catalog_tecnico(auth.uid()));

-- ============== product_technical_profiles ==============
ALTER TABLE public.product_technical_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prod_tp_read_internal" ON public.product_technical_profiles
  FOR SELECT TO authenticated
  USING (
    public.can_view_catalog_internal(auth.uid())
    OR (
      status_validacao = 'aprovado'
      AND EXISTS (
        SELECT 1 FROM public.produtos p
        WHERE p.id = produto_id AND p.ativo = true
          AND (
            public.has_role(auth.uid(),'cliente_produtor')
            OR (public.has_role(auth.uid(),'parceiro_b2b') AND p.b2b_enabled = true)
          )
      )
    )
  );

CREATE POLICY "prod_tp_insert_team" ON public.product_technical_profiles
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_catalog_tecnico(auth.uid()));

CREATE POLICY "prod_tp_update_team" ON public.product_technical_profiles
  FOR UPDATE TO authenticated
  USING (
    public.can_manage_catalog_tecnico(auth.uid())
    OR (
      public.has_role(auth.uid(),'gestor_comercial')
      AND EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = produto_id AND p.b2b_enabled = true)
    )
  )
  WITH CHECK (
    public.can_manage_catalog_tecnico(auth.uid())
    OR (
      public.has_role(auth.uid(),'gestor_comercial')
      AND EXISTS (SELECT 1 FROM public.produtos p WHERE p.id = produto_id AND p.b2b_enabled = true)
    )
  );

CREATE POLICY "prod_tp_delete_admin" ON public.product_technical_profiles
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

-- ============== product_target_recommendations ==============
ALTER TABLE public.product_target_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prod_targets_read" ON public.product_target_recommendations
  FOR SELECT TO authenticated
  USING (
    public.can_view_catalog_internal(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_id AND p.ativo = true
        AND (
          public.has_role(auth.uid(),'cliente_produtor')
          OR (public.has_role(auth.uid(),'parceiro_b2b') AND p.b2b_enabled = true)
        )
    )
  );

CREATE POLICY "prod_targets_write" ON public.product_target_recommendations
  FOR ALL TO authenticated
  USING (public.can_manage_catalog_tecnico(auth.uid()))
  WITH CHECK (public.can_manage_catalog_tecnico(auth.uid()));

-- ============== product_crop_recommendations ==============
ALTER TABLE public.product_crop_recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prod_crops_read" ON public.product_crop_recommendations
  FOR SELECT TO authenticated
  USING (
    public.can_view_catalog_internal(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = produto_id AND p.ativo = true
        AND (
          public.has_role(auth.uid(),'cliente_produtor')
          OR (public.has_role(auth.uid(),'parceiro_b2b') AND p.b2b_enabled = true)
        )
    )
  );

CREATE POLICY "prod_crops_write" ON public.product_crop_recommendations
  FOR ALL TO authenticated
  USING (public.can_manage_catalog_tecnico(auth.uid()))
  WITH CHECK (public.can_manage_catalog_tecnico(auth.uid()));

-- ============== catalog_technical_audit_logs ==============
ALTER TABLE public.catalog_technical_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_audit_read_admin" ON public.catalog_technical_audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));

CREATE POLICY "catalog_audit_insert_any" ON public.catalog_technical_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ============== catalog_access_events ==============
ALTER TABLE public.catalog_access_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_access_insert_self" ON public.catalog_access_events
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "catalog_access_read_admin" ON public.catalog_access_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador') OR public.has_role(auth.uid(),'gestor'));
