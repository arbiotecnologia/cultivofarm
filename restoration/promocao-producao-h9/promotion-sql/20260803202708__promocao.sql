-- ============================================================================
-- ARTEFATO DERIVADO DE PROMOÇÃO — NÃO É MIGRATION HISTÓRICA, NÃO EDITE
-- Origem      : supabase/migrations/20260803202708_5f230644-c336-406d-973e-d9ffea526bfd.sql
-- SHA-256 orig: ad5a07fa44158cbf95d9a92f3ead0c5a962aa5ea14c1cabe33170c67ee10e0b3
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

-- =========================================================
-- Guard de ambiente: somente staging
-- =========================================================
-- [guarda de homologação removida pelo gerador de promoção]


-- =========================================================
-- 1) PERFIL DE CONFORMIDADE E ROTULAGEM VERSIONADO
-- =========================================================
CREATE TABLE IF NOT EXISTS public.produto_conformidade_perfis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_key text NOT NULL,
  produto_id uuid REFERENCES public.produtos(id) ON DELETE CASCADE,
  categoria text,
  versao integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'rascunho',
  vigencia_inicio date,
  vigencia_fim date,
  responsavel_informacao text,
  fonte_documento text,
  documento_referencia text,
  documento_validade date,
  campos_obrigatorios text[] NOT NULL DEFAULT ARRAY[]::text[],
  conservacao_texto text,
  transporte_texto text,
  uso_texto text,
  advertencias text[] NOT NULL DEFAULT ARRAY[]::text[],
  responsavel_tecnico_nome text,
  responsavel_tecnico_registro text,
  registro_mapa text,
  identificadores_regulatorios jsonb NOT NULL DEFAULT '{}'::jsonb,
  identificadores_fiscais jsonb NOT NULL DEFAULT '{}'::jsonb,
  politica_validade text,
  validade_meses integer,
  template_versao text,
  criado_por uuid,
  aprovado_por uuid,
  aprovado_em timestamptz,
  motivo_aprovacao text,
  inativado_por uuid,
  inativado_em timestamptz,
  motivo_inativacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcp_status_chk CHECK (status IN ('rascunho','em_revisao','aprovado','inativo')),
  CONSTRAINT pcp_escopo_chk CHECK (produto_id IS NOT NULL OR categoria IS NOT NULL),
  CONSTRAINT pcp_validade_meses_chk CHECK (validade_meses IS NULL OR validade_meses > 0)
);

GRANT SELECT, INSERT, UPDATE ON public.produto_conformidade_perfis TO authenticated;
GRANT ALL ON public.produto_conformidade_perfis TO service_role;
ALTER TABLE public.produto_conformidade_perfis ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS pcp_key_versao_uidx
  ON public.produto_conformidade_perfis (perfil_key, versao);
CREATE INDEX IF NOT EXISTS pcp_produto_status_idx
  ON public.produto_conformidade_perfis (produto_id, status);
CREATE INDEX IF NOT EXISTS pcp_categoria_status_idx
  ON public.produto_conformidade_perfis (categoria, status);
-- somente uma versão aprovada vigente por chave lógica
CREATE UNIQUE INDEX IF NOT EXISTS pcp_uma_aprovada_uidx
  ON public.produto_conformidade_perfis (perfil_key)
  WHERE status = 'aprovado';

DROP POLICY IF EXISTS pcp_select_interno ON public.produto_conformidade_perfis;
CREATE POLICY pcp_select_interno ON public.produto_conformidade_perfis
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
    OR public.has_role(auth.uid(),'operador_onfarm'::app_role)
    OR public.has_role(auth.uid(),'tecnico_agronomo'::app_role)
  );

DROP POLICY IF EXISTS pcp_write_gestao ON public.produto_conformidade_perfis;
CREATE POLICY pcp_write_gestao ON public.produto_conformidade_perfis
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
    OR public.has_role(auth.uid(),'producao'::app_role)
  );

DROP POLICY IF EXISTS pcp_update_gestao ON public.produto_conformidade_perfis;
CREATE POLICY pcp_update_gestao ON public.produto_conformidade_perfis
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(),'administrador'::app_role)
    OR public.has_role(auth.uid(),'gestor'::app_role)
  );

CREATE OR REPLACE FUNCTION public.tg_pcp_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  -- imutabilidade após aprovação: só permite transição para inativo
  IF TG_OP = 'UPDATE' AND OLD.status = 'aprovado' THEN
    IF NEW.status NOT IN ('aprovado','inativo') THEN
      RAISE EXCEPTION 'compliance_profile_immutable: perfil aprovado só pode ser inativado';
    END IF;
    IF NEW.status = 'aprovado' AND (
         NEW.conservacao_texto IS DISTINCT FROM OLD.conservacao_texto
      OR NEW.uso_texto IS DISTINCT FROM OLD.uso_texto
      OR NEW.transporte_texto IS DISTINCT FROM OLD.transporte_texto
      OR NEW.advertencias IS DISTINCT FROM OLD.advertencias
      OR NEW.validade_meses IS DISTINCT FROM OLD.validade_meses
      OR NEW.registro_mapa IS DISTINCT FROM OLD.registro_mapa
      OR NEW.responsavel_tecnico_registro IS DISTINCT FROM OLD.responsavel_tecnico_registro
      OR NEW.versao IS DISTINCT FROM OLD.versao
      OR NEW.perfil_key IS DISTINCT FROM OLD.perfil_key
    ) THEN
      RAISE EXCEPTION 'compliance_profile_immutable: conteúdo de perfil aprovado não pode ser alterado; crie nova versão';
    END IF;
    IF NEW.status = 'inativo' AND COALESCE(btrim(NEW.motivo_inativacao),'') = '' THEN
      RAISE EXCEPTION 'compliance_profile_reason_required: motivo de inativação obrigatório';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status <> 'aprovado' AND NEW.status = 'aprovado' THEN
    IF COALESCE(btrim(NEW.motivo_aprovacao),'') = '' THEN
      RAISE EXCEPTION 'compliance_profile_reason_required: motivo de aprovação obrigatório';
    END IF;
    NEW.aprovado_por := COALESCE(NEW.aprovado_por, auth.uid());
    NEW.aprovado_em := COALESCE(NEW.aprovado_em, now());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcp_touch ON public.produto_conformidade_perfis;
CREATE TRIGGER trg_pcp_touch
  BEFORE UPDATE ON public.produto_conformidade_perfis
  FOR EACH ROW EXECUTE FUNCTION public.tg_pcp_touch();

CREATE OR REPLACE FUNCTION public.tg_pcp_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('produto_conformidade_perfil', NEW.id,
            'COMPLIANCE_PROFILE_' || upper(NEW.status),
            jsonb_build_object('perfil_key', NEW.perfil_key, 'versao', NEW.versao,
                               'de', OLD.status, 'para', NEW.status),
            auth.uid(),
            COALESCE(NEW.motivo_inativacao, NEW.motivo_aprovacao, 'mudança de status'));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pcp_audit ON public.produto_conformidade_perfis;
CREATE TRIGGER trg_pcp_audit
  AFTER UPDATE ON public.produto_conformidade_perfis
  FOR EACH ROW EXECUTE FUNCTION public.tg_pcp_audit();

-- Resolução do perfil vigente (produto tem precedência sobre categoria)
CREATE OR REPLACE FUNCTION public.fn_conformidade_perfil_vigente(p_produto_id uuid, p_categoria text)
RETURNS public.produto_conformidade_perfis
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT *
  FROM public.produto_conformidade_perfis p
  WHERE p.status = 'aprovado'
    AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio <= CURRENT_DATE)
    AND (p.vigencia_fim IS NULL OR p.vigencia_fim >= CURRENT_DATE)
    AND (
      (p_produto_id IS NOT NULL AND p.produto_id = p_produto_id)
      OR (p.produto_id IS NULL AND p_categoria IS NOT NULL AND p.categoria = p_categoria)
    )
  ORDER BY (p.produto_id IS NOT NULL) DESC, p.versao DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.fn_conformidade_perfil_vigente(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_conformidade_perfil_vigente(uuid, text) TO authenticated, service_role;

-- =========================================================
-- 2) TEMPLATES CONFIGURÁVEIS DE ETIQUETA
-- =========================================================
CREATE TABLE IF NOT EXISTS public.etiqueta_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  versao integer NOT NULL DEFAULT 1,
  nome text NOT NULL,
  midia text NOT NULL DEFAULT 'termica',
  largura_mm numeric NOT NULL,
  altura_mm numeric NOT NULL,
  margem_topo_mm numeric NOT NULL DEFAULT 2,
  margem_direita_mm numeric NOT NULL DEFAULT 2,
  margem_base_mm numeric NOT NULL DEFAULT 2,
  margem_esquerda_mm numeric NOT NULL DEFAULT 2,
  orientacao text NOT NULL DEFAULT 'retrato',
  densidade_dpi integer NOT NULL DEFAULT 203,
  colunas integer NOT NULL DEFAULT 1,
  linhas integer NOT NULL DEFAULT 1,
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT et_midia_chk CHECK (midia IN ('termica','a4')),
  CONSTRAINT et_orientacao_chk CHECK (orientacao IN ('retrato','paisagem')),
  CONSTRAINT et_dim_chk CHECK (largura_mm > 0 AND altura_mm > 0),
  CONSTRAINT et_grid_chk CHECK (colunas > 0 AND linhas > 0)
);

GRANT SELECT ON public.etiqueta_templates TO authenticated;
GRANT ALL ON public.etiqueta_templates TO service_role;
ALTER TABLE public.etiqueta_templates ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS et_codigo_versao_uidx
  ON public.etiqueta_templates (codigo, versao);

DROP POLICY IF EXISTS et_select_auth ON public.etiqueta_templates;
CREATE POLICY et_select_auth ON public.etiqueta_templates
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS et_manage_admin ON public.etiqueta_templates;
CREATE POLICY et_manage_admin ON public.etiqueta_templates
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'gestor'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'gestor'::app_role));

INSERT INTO public.etiqueta_templates (codigo, versao, nome, midia, largura_mm, altura_mm, orientacao, densidade_dpi, colunas, linhas)
VALUES
  ('etiqueta-produto-principal', 1, 'Principal 100x60mm (térmica)', 'termica', 100, 60, 'paisagem', 203, 1, 1),
  ('etiqueta-produto-reduzida', 1, 'Reduzida 50x30mm (térmica)', 'termica', 50, 30, 'paisagem', 203, 1, 1),
  ('etiqueta-produto-a4-grid', 1, 'A4 folha 3x8 (laser)', 'a4', 70, 37, 'retrato', 300, 3, 8)
ON CONFLICT (codigo, versao) DO NOTHING;

-- =========================================================
-- 3) UNICIDADE 1:1 ETIQUETA ATIVA POR EMBALAGEM + TIPO
-- =========================================================
CREATE UNIQUE INDEX IF NOT EXISTS produto_etiquetas_embalagem_tipo_ativa_uidx
  ON public.produto_etiquetas (embalagem_id, tipo_etiqueta)
  WHERE embalagem_id IS NOT NULL AND status <> 'cancelada';

CREATE INDEX IF NOT EXISTS produto_etiquetas_trace_idx
  ON public.produto_etiquetas (trace_token);

-- =========================================================
-- 4) MOTOR CANÔNICO: gate de conformidade + validade validada
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpc_gerar_etiqueta_produto(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_lote_id uuid := NULLIF(p_payload->>'lote_id','')::uuid;
  v_produto_id uuid := NULLIF(p_payload->>'produto_id','')::uuid;
  v_envase_id uuid := NULLIF(p_payload->>'envase_id','')::uuid;
  v_envase_item_id uuid := NULLIF(p_payload->>'envase_item_id','')::uuid;
  v_estoque_item_id uuid := NULLIF(p_payload->>'estoque_item_id','')::uuid;
  v_embalagem_id uuid := NULLIF(p_payload->>'embalagem_id','')::uuid;
  v_entrega_id uuid := NULLIF(p_payload->>'entrega_id','')::uuid;
  v_entrega_item_id uuid := NULLIF(p_payload->>'entrega_item_id','')::uuid;
  v_cliente_id uuid := NULLIF(p_payload->>'cliente_id','')::uuid;
  v_fazenda_id uuid := NULLIF(p_payload->>'fazenda_id','')::uuid;
  v_tipo text := COALESCE(NULLIF(p_payload->>'tipo_etiqueta',''), 'principal');
  v_volume numeric := NULLIF(p_payload->>'volume','')::numeric;
  v_unidade text := NULLIF(p_payload->>'unidade','');
  v_qtd_emb integer := NULLIF(p_payload->>'quantidade_embalagens','')::integer;
  v_conservacao text := NULLIF(p_payload->>'conservacao','');
  v_uso text := NULLIF(p_payload->>'uso_recomendado','');
  v_obs text := NULLIF(p_payload->>'observacoes','');
  v_substitui uuid := NULLIF(p_payload->>'substitui_etiqueta_id','')::uuid;
  v_template_codigo text := NULLIF(p_payload->>'template_codigo','');
  v_comercial boolean;
  v_produto_nome text;
  v_produto_tipo text;
  v_lote_codigo text;
  v_lote_status text;
  v_cq_liberado boolean;
  v_cepas text[];
  v_fabricado_em date;
  v_validade_em date;
  v_validade_origem text;
  v_perfil public.produto_conformidade_perfis;
  v_tpl public.etiqueta_templates;
  v_seq bigint;
  v_codigo text;
  v_trace_token uuid := gen_random_uuid();
  v_trace_hash text;
  v_id uuid := gen_random_uuid();
  v_qr_payload text;
  v_snapshot jsonb;
  v_template text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.has_role(v_uid,'administrador'::app_role)
    OR public.has_role(v_uid,'gestor'::app_role)
    OR public.has_role(v_uid,'producao'::app_role)
    OR public.has_role(v_uid,'operador_onfarm'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para gerar etiqueta';
  END IF;

  v_comercial := v_tipo NOT IN ('interna','amostra');

  -- embalagem como origem unitária canônica
  IF v_embalagem_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('etiqueta_embalagem:' || v_embalagem_id::text, 0));
    SELECT eb.lote_id, COALESCE(v_produto_id, eb.produto_id), COALESCE(v_envase_id, eb.envase_id),
           COALESCE(v_volume, eb.volume), COALESCE(v_unidade, eb.unidade), eb.validade_em
      INTO v_lote_id, v_produto_id, v_envase_id, v_volume, v_unidade, v_validade_em
    FROM public.estoque_embalagens eb WHERE eb.id = v_embalagem_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'label_package_not_found: embalagem inexistente'; END IF;
    IF v_validade_em IS NOT NULL THEN v_validade_origem := 'embalagem'; END IF;
    v_qtd_emb := COALESCE(v_qtd_emb, 1);
  END IF;

  IF v_envase_id IS NOT NULL AND v_lote_id IS NULL THEN
    SELECT e.lote_id, COALESCE(v_volume, e.volume_por_unidade), COALESCE(v_qtd_emb, e.quantidade)
      INTO v_lote_id, v_volume, v_qtd_emb
    FROM public.envase e WHERE e.id = v_envase_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Envase não encontrado'; END IF;
  ELSIF v_envase_id IS NOT NULL THEN
    SELECT COALESCE(v_volume, e.volume_por_unidade), COALESCE(v_qtd_emb, e.quantidade)
      INTO v_volume, v_qtd_emb
    FROM public.envase e WHERE e.id = v_envase_id;
  END IF;

  IF v_lote_id IS NULL THEN
    RAISE EXCEPTION 'Lote obrigatório';
  END IF;

  SELECT l.codigo_lote, COALESCE(v_produto_id, l.produto_id), l.data_producao, l.status::text
    INTO v_lote_codigo, v_produto_id, v_fabricado_em, v_lote_status
  FROM public.lotes l WHERE l.id = v_lote_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lote não encontrado'; END IF;

  v_cq_liberado := (v_lote_status = 'aprovado');

  IF NOT v_cq_liberado AND v_comercial THEN
    RAISE EXCEPTION 'label_cq_not_approved: etiqueta % bloqueada, lote % com status de qualidade "%"',
      v_tipo, v_lote_codigo, v_lote_status;
  END IF;

  IF v_produto_id IS NOT NULL THEN
    SELECT p.nome, p.tipo::text INTO v_produto_nome, v_produto_tipo
    FROM public.produtos p WHERE p.id = v_produto_id;
  END IF;
  IF v_produto_nome IS NULL THEN v_produto_nome := 'Bioinsumo AR Bio'; END IF;

  -- Perfil de conformidade vigente
  v_perfil := public.fn_conformidade_perfil_vigente(v_produto_id, v_produto_tipo);

  IF v_comercial AND v_perfil.id IS NULL THEN
    RAISE EXCEPTION 'label_compliance_profile_missing: não há perfil de conformidade aprovado vigente para o produto %', v_produto_nome;
  END IF;

  IF v_comercial AND v_perfil.campos_obrigatorios IS NOT NULL THEN
    IF 'responsavel_tecnico' = ANY(v_perfil.campos_obrigatorios)
       AND COALESCE(btrim(v_perfil.responsavel_tecnico_registro),'') = '' THEN
      RAISE EXCEPTION 'label_compliance_field_missing: responsavel_tecnico não validado no perfil de conformidade';
    END IF;
    IF 'registro_mapa' = ANY(v_perfil.campos_obrigatorios)
       AND COALESCE(btrim(v_perfil.registro_mapa),'') = '' THEN
      RAISE EXCEPTION 'label_compliance_field_missing: registro_mapa não validado no perfil de conformidade';
    END IF;
  END IF;

  SELECT array_remove(ARRAY[m.nome], NULL)
    INTO v_cepas
  FROM public.lotes l
  LEFT JOIN public.microrganismos m ON m.id = l.microrganismo_id
  WHERE l.id = v_lote_id;

  -- Resolução de validade: embalagem > estoque > política do perfil. Sem fallback estimado.
  IF v_validade_em IS NULL THEN
    SELECT MIN(ep.validade) INTO v_validade_em
    FROM public.estoque_produto ep WHERE ep.lote_id = v_lote_id;
    IF v_validade_em IS NOT NULL THEN v_validade_origem := 'estoque'; END IF;
  END IF;

  IF v_validade_em IS NULL AND v_perfil.validade_meses IS NOT NULL AND v_fabricado_em IS NOT NULL THEN
    v_validade_em := (v_fabricado_em + make_interval(months => v_perfil.validade_meses))::date;
    v_validade_origem := 'perfil_conformidade';
  END IF;

  IF v_validade_em IS NULL THEN
    IF v_comercial THEN
      RAISE EXCEPTION 'label_expiry_not_validated: validade não validada para o lote % — defina validade em estoque/embalagem ou política de validade no perfil de conformidade aprovado',
        v_lote_codigo;
    END IF;
    v_validade_origem := 'nao_validada';
  END IF;

  IF v_unidade IS NULL AND v_volume IS NOT NULL THEN
    v_unidade := 'ml';
  END IF;

  -- Template configurável
  IF v_template_codigo IS NULL THEN
    v_template_codigo := CASE WHEN v_tipo = 'reduzida' THEN 'etiqueta-produto-reduzida'
                              ELSE 'etiqueta-produto-principal' END;
  END IF;
  SELECT * INTO v_tpl FROM public.etiqueta_templates
   WHERE codigo = v_template_codigo AND ativo
   ORDER BY versao DESC LIMIT 1;
  IF v_tpl.id IS NULL THEN
    RAISE EXCEPTION 'label_template_not_found: template % inexistente ou inativo', v_template_codigo;
  END IF;
  v_template := v_tpl.codigo || '@v' || v_tpl.versao;

  SELECT nextval('public.produto_etiqueta_seq') INTO v_seq;
  v_codigo := 'AR-LB-' || lpad(v_seq::text, 6, '0');

  v_trace_hash := encode(digest(v_trace_token::text || '|' || v_codigo, 'sha256'), 'hex');
  v_qr_payload := '/rastrear-produto/' || v_trace_token::text;

  v_conservacao := COALESCE(v_conservacao, v_perfil.conservacao_texto);
  v_uso := COALESCE(v_uso, v_perfil.uso_texto);

  IF v_comercial AND (COALESCE(btrim(v_conservacao),'') = '' OR COALESCE(btrim(v_uso),'') = '') THEN
    RAISE EXCEPTION 'label_compliance_field_missing: textos de conservação/uso não validados no perfil de conformidade';
  END IF;

  v_snapshot := jsonb_build_object(
    'template_versao', v_template,
    'template', jsonb_build_object(
      'codigo', v_tpl.codigo, 'versao', v_tpl.versao, 'midia', v_tpl.midia,
      'largura_mm', v_tpl.largura_mm, 'altura_mm', v_tpl.altura_mm,
      'orientacao', v_tpl.orientacao, 'densidade_dpi', v_tpl.densidade_dpi,
      'colunas', v_tpl.colunas, 'linhas', v_tpl.linhas,
      'margens_mm', jsonb_build_object('topo', v_tpl.margem_topo_mm, 'direita', v_tpl.margem_direita_mm,
                                       'base', v_tpl.margem_base_mm, 'esquerda', v_tpl.margem_esquerda_mm)
    ),
    'conformidade', CASE WHEN v_perfil.id IS NULL THEN NULL ELSE jsonb_build_object(
      'perfil_id', v_perfil.id, 'perfil_key', v_perfil.perfil_key, 'versao', v_perfil.versao,
      'aprovado_em', v_perfil.aprovado_em,
      'responsavel_informacao', v_perfil.responsavel_informacao,
      'fonte_documento', v_perfil.fonte_documento,
      'responsavel_tecnico_nome', v_perfil.responsavel_tecnico_nome,
      'responsavel_tecnico_registro', v_perfil.responsavel_tecnico_registro,
      'registro_mapa', v_perfil.registro_mapa,
      'identificadores_regulatorios', v_perfil.identificadores_regulatorios,
      'identificadores_fiscais', v_perfil.identificadores_fiscais,
      'advertencias', to_jsonb(v_perfil.advertencias),
      'transporte_texto', v_perfil.transporte_texto,
      'politica_validade', v_perfil.politica_validade
    ) END,
    'origem_dados', jsonb_build_object(
      'validade', v_validade_origem,
      'conservacao', CASE WHEN NULLIF(p_payload->>'conservacao','') IS NOT NULL THEN 'payload' ELSE 'perfil_conformidade' END,
      'uso_recomendado', CASE WHEN NULLIF(p_payload->>'uso_recomendado','') IS NOT NULL THEN 'payload' ELSE 'perfil_conformidade' END,
      'produto', 'cadastro_produtos',
      'lote', 'lotes',
      'embalagem', CASE WHEN v_embalagem_id IS NOT NULL THEN 'estoque_embalagens' ELSE NULL END
    ),
    'codigo_etiqueta', v_codigo,
    'tipo_etiqueta', v_tipo,
    'produto_nome', v_produto_nome,
    'lote_codigo', v_lote_codigo,
    'cepas', to_jsonb(COALESCE(v_cepas, ARRAY[]::text[])),
    'volume', v_volume,
    'unidade', v_unidade,
    'quantidade_embalagens', v_qtd_emb,
    'fabricado_em', v_fabricado_em,
    'validade_em', v_validade_em,
    'validade_origem', v_validade_origem,
    'conservacao', v_conservacao,
    'uso_recomendado', v_uso,
    'observacoes', v_obs,
    'cq_liberado', v_cq_liberado,
    'lote_status_na_emissao', v_lote_status,
    'emitida_em', now(),
    'emitida_por', v_uid
  );

  INSERT INTO public.produto_etiquetas (
    id, codigo_etiqueta, tipo_etiqueta, status,
    lote_id, produto_id, envase_id, envase_item_id, estoque_item_id, embalagem_id,
    entrega_id, entrega_item_id, cliente_id, fazenda_id,
    produto_nome, lote_codigo, volume, unidade, quantidade_embalagens, cepas,
    fabricado_em, validade_em, conservacao, uso_recomendado, observacoes,
    trace_token, trace_hash, qr_code_payload, qr_code_generated_at,
    gerada_por, gerada_em,
    snapshot, template_versao, cq_liberado, lote_status_na_emissao, substitui_etiqueta_id
  ) VALUES (
    v_id, v_codigo, v_tipo, 'gerada',
    v_lote_id, v_produto_id, v_envase_id, v_envase_item_id, v_estoque_item_id, v_embalagem_id,
    v_entrega_id, v_entrega_item_id, v_cliente_id, v_fazenda_id,
    v_produto_nome, v_lote_codigo, v_volume, v_unidade, v_qtd_emb, v_cepas,
    v_fabricado_em, v_validade_em, v_conservacao, v_uso, v_obs,
    v_trace_token, v_trace_hash, v_qr_payload, now(),
    v_uid, now(),
    v_snapshot, v_template, v_cq_liberado, v_lote_status, v_substitui
  );

  IF v_substitui IS NOT NULL THEN
    UPDATE public.produto_etiquetas SET substituida_por_id = v_id WHERE id = v_substitui;
  END IF;

  IF v_embalagem_id IS NOT NULL THEN
    UPDATE public.estoque_embalagens SET etiqueta_id = v_id, updated_at = now()
     WHERE id = v_embalagem_id;
  END IF;

  IF v_envase_id IS NOT NULL THEN
    UPDATE public.envase
       SET etiqueta_gerada = true,
           etiqueta_id = v_id,
           etiqueta_gerada_em = now(),
           etiqueta_gerada_por = v_uid
     WHERE id = v_envase_id;
  END IF;

  IF v_entrega_id IS NOT NULL THEN
    INSERT INTO public.entrega_etiquetas (entrega_id, etiqueta_id, created_by)
      VALUES (v_entrega_id, v_id, v_uid)
      ON CONFLICT DO NOTHING;
  END IF;

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, descricao, user_id, metadata)
    VALUES (v_id, 'etiqueta_gerada', 'Etiqueta gerada', v_uid,
            jsonb_build_object('tipo', v_tipo, 'codigo', v_codigo, 'cq_liberado', v_cq_liberado,
                               'template', v_template, 'validade_origem', v_validade_origem));

  INSERT INTO public.financial_audit_log(entity_type, entity_id, action, new_data, performed_by, reason)
    VALUES ('produto_etiqueta', v_id, 'LABEL_GENERATED',
            jsonb_build_object('codigo', v_codigo, 'tipo', v_tipo, 'lote_id', v_lote_id,
                               'envase_id', v_envase_id, 'embalagem_id', v_embalagem_id,
                               'cq_liberado', v_cq_liberado, 'template', v_template),
            v_uid, 'Geração de etiqueta de produto');

  RETURN jsonb_build_object(
    'success', true,
    'etiqueta_id', v_id,
    'codigo_etiqueta', v_codigo,
    'trace_token', v_trace_token,
    'trace_url', v_qr_payload,
    'qr_code_payload', v_qr_payload,
    'cq_liberado', v_cq_liberado,
    'validade_origem', v_validade_origem,
    'template_versao', v_template
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_gerar_etiqueta_produto(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_gerar_etiqueta_produto(jsonb) TO authenticated;

-- =========================================================
-- 5) GERAÇÃO EM LOTE 1:1 POR EMBALAGEM (delegando ao motor canônico)
-- =========================================================
CREATE OR REPLACE FUNCTION public.rpc_gerar_etiquetas_embalagens_lote(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ids uuid[] := COALESCE(
    (SELECT array_agg((x)::uuid) FROM jsonb_array_elements_text(COALESCE(p_payload->'embalagem_ids','[]'::jsonb)) AS t(x)),
    ARRAY[]::uuid[]);
  v_tipo text := COALESCE(NULLIF(p_payload->>'tipo_etiqueta',''), 'principal');
  v_template text := NULLIF(p_payload->>'template_codigo','');
  v_emb uuid;
  v_existing uuid;
  v_res jsonb;
  v_geradas jsonb := '[]'::jsonb;
  v_reaproveitadas jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF array_length(v_ids,1) IS NULL THEN
    RAISE EXCEPTION 'label_batch_empty: informe ao menos uma embalagem';
  END IF;
  IF array_length(v_ids,1) > 500 THEN
    RAISE EXCEPTION 'label_batch_too_large: máximo de 500 embalagens por execução';
  END IF;

  FOREACH v_emb IN ARRAY v_ids LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('etiqueta_embalagem:' || v_emb::text, 0));

    SELECT id INTO v_existing FROM public.produto_etiquetas
     WHERE embalagem_id = v_emb AND tipo_etiqueta = v_tipo AND status <> 'cancelada'
     LIMIT 1;

    IF v_existing IS NOT NULL THEN
      -- idempotente: já existe etiqueta ativa desse tipo para a embalagem
      v_reaproveitadas := v_reaproveitadas || jsonb_build_object('embalagem_id', v_emb, 'etiqueta_id', v_existing);
      CONTINUE;
    END IF;

    v_res := public.rpc_gerar_etiqueta_produto(jsonb_strip_nulls(jsonb_build_object(
      'embalagem_id', v_emb,
      'tipo_etiqueta', v_tipo,
      'template_codigo', v_template
    )));

    v_geradas := v_geradas || jsonb_build_object(
      'embalagem_id', v_emb,
      'etiqueta_id', v_res->>'etiqueta_id',
      'codigo_etiqueta', v_res->>'codigo_etiqueta');
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'tipo_etiqueta', v_tipo,
    'total_solicitado', array_length(v_ids,1),
    'total_geradas', jsonb_array_length(v_geradas),
    'total_reaproveitadas', jsonb_array_length(v_reaproveitadas),
    'geradas', v_geradas,
    'reaproveitadas', v_reaproveitadas
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_gerar_etiquetas_embalagens_lote(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_gerar_etiquetas_embalagens_lote(jsonb) TO authenticated;

-- =========================================================
-- 6) RASTREIO PÚBLICO: log mínimo + rate limit
-- =========================================================
CREATE TABLE IF NOT EXISTS public.produto_etiqueta_consultas (
  id bigserial PRIMARY KEY,
  etiqueta_id uuid REFERENCES public.produto_etiquetas(id) ON DELETE SET NULL,
  consultado_em timestamptz NOT NULL DEFAULT now(),
  resultado text NOT NULL,
  janela_hora timestamptz NOT NULL DEFAULT date_trunc('hour', now())
);

GRANT ALL ON public.produto_etiqueta_consultas TO service_role;
ALTER TABLE public.produto_etiqueta_consultas ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS pec_etiqueta_janela_idx
  ON public.produto_etiqueta_consultas (etiqueta_id, janela_hora);

DROP POLICY IF EXISTS pec_select_interno ON public.produto_etiqueta_consultas;
CREATE POLICY pec_select_interno ON public.produto_etiqueta_consultas
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'administrador'::app_role) OR public.has_role(auth.uid(),'gestor'::app_role));

CREATE OR REPLACE FUNCTION public.rpc_validar_rastreio_produto(p_trace_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.produto_etiquetas%ROWTYPE;
  v_msg text;
  v_status text;
  v_hits integer;
  v_limite constant integer := 60;
BEGIN
  SELECT * INTO v_row FROM public.produto_etiquetas WHERE trace_token = p_trace_token;
  IF NOT FOUND THEN
    INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (NULL, 'nao_encontrada');
    RETURN jsonb_build_object('valido', false, 'mensagem', 'Etiqueta não encontrada ou indisponível.');
  END IF;

  -- rate limit por etiqueta/hora
  SELECT count(*) INTO v_hits
  FROM public.produto_etiqueta_consultas
  WHERE etiqueta_id = v_row.id AND janela_hora = date_trunc('hour', now());

  IF v_hits >= v_limite THEN
    INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (v_row.id, 'rate_limited');
    RETURN jsonb_build_object('valido', false, 'status', 'rate_limited',
      'mensagem', 'Muitas consultas para esta etiqueta. Tente novamente mais tarde.');
  END IF;

  IF NOT v_row.public_trace_enabled THEN
    INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (v_row.id, 'revogada');
    RETURN jsonb_build_object('valido', false, 'status', 'revogada',
      'mensagem', 'Rastreio público desabilitado para esta etiqueta.');
  END IF;

  IF v_row.trace_expires_at IS NOT NULL AND v_row.trace_expires_at < now() THEN
    INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (v_row.id, 'expirada');
    RETURN jsonb_build_object('valido', false, 'status', 'expirado', 'mensagem', 'Rastreio expirado.');
  END IF;

  IF v_row.status = 'cancelada' THEN
    v_status := CASE WHEN v_row.substituida_por_id IS NOT NULL THEN 'substituida' ELSE 'cancelada' END;
    v_msg := CASE WHEN v_row.substituida_por_id IS NOT NULL
                  THEN 'Etiqueta substituída por nova emissão. Confirme com a AR Bio.'
                  ELSE 'Etiqueta cancelada ou substituída. Confirme com a AR Bio.' END;
  ELSIF v_row.validade_em IS NOT NULL AND v_row.validade_em < CURRENT_DATE THEN
    v_status := 'vencido';
    v_msg := 'Produto com validade expirada. Confirme condições com a AR Bio.';
  ELSE
    v_status := 'ativo';
    v_msg := 'Produto registrado no sistema AR Bio.';
  END IF;

  INSERT INTO public.produto_etiqueta_consultas(etiqueta_id, resultado) VALUES (v_row.id, v_status);

  INSERT INTO public.produto_etiqueta_eventos(etiqueta_id, evento, descricao, metadata)
    VALUES (v_row.id, 'qr_validado', 'Validação pública via QR Code', jsonb_build_object('status', v_status));

  IF v_status IN ('cancelada','substituida') THEN
    RETURN jsonb_build_object('valido', false, 'status', v_status, 'mensagem', v_msg,
                              'codigo_etiqueta', v_row.codigo_etiqueta);
  END IF;

  RETURN jsonb_build_object(
    'valido', true,
    'status', v_status,
    'codigo_etiqueta', v_row.codigo_etiqueta,
    'produto_nome', v_row.produto_nome,
    'lote_codigo', v_row.lote_codigo,
    'fabricado_em', v_row.fabricado_em,
    'validade_em', v_row.validade_em,
    'volume', v_row.volume,
    'unidade', v_row.unidade,
    'tipo_etiqueta', v_row.tipo_etiqueta,
    'mensagem', v_msg
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rpc_validar_rastreio_produto(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_validar_rastreio_produto(uuid) TO anon, authenticated;