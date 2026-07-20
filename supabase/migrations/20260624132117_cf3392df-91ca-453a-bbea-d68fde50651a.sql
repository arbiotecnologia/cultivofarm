
-- 1. Catalogo global de alvos
CREATE TABLE public.catalogo_alvos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  nome_normalizado TEXT NOT NULL,
  tipo TEXT NOT NULL,
  nome_cientifico TEXT,
  descricao TEXT,
  sinonimos TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT true,
  criado_por UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT catalogo_alvos_nome_tipo_uk UNIQUE (nome_normalizado, tipo)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogo_alvos TO authenticated;
GRANT ALL ON public.catalogo_alvos TO service_role;

ALTER TABLE public.catalogo_alvos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read catalogo_alvos"
  ON public.catalogo_alvos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Tech roles can insert catalogo_alvos"
  ON public.catalogo_alvos FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR public.has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  );

CREATE POLICY "Tech roles can update catalogo_alvos"
  ON public.catalogo_alvos FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'administrador'::app_role)
    OR public.has_role(auth.uid(), 'gestor'::app_role)
    OR public.has_role(auth.uid(), 'consultor_tecnico'::app_role)
    OR public.has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  );

CREATE POLICY "Admin can delete catalogo_alvos"
  ON public.catalogo_alvos FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

CREATE TRIGGER trg_catalogo_alvos_updated
  BEFORE UPDATE ON public.catalogo_alvos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_catalogo_alvos_tipo ON public.catalogo_alvos(tipo) WHERE ativo;
CREATE INDEX idx_catalogo_alvos_nome_norm ON public.catalogo_alvos(nome_normalizado);

-- 2. Vinculo nas tabelas de fichas
ALTER TABLE public.product_target_recommendations
  ADD COLUMN catalogo_alvo_id UUID REFERENCES public.catalogo_alvos(id) ON DELETE SET NULL;

ALTER TABLE public.microorganism_targets
  ADD COLUMN catalogo_alvo_id UUID REFERENCES public.catalogo_alvos(id) ON DELETE SET NULL;

-- 3. Helper de normalização
CREATE OR REPLACE FUNCTION public.normalizar_alvo(p_nome TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(trim(regexp_replace(coalesce(p_nome,''), '\s+', ' ', 'g')));
$$;

-- 4. Seed a partir dos alvos existentes
INSERT INTO public.catalogo_alvos (nome, nome_normalizado, tipo, descricao)
SELECT DISTINCT ON (public.normalizar_alvo(alvo_nome), alvo_tipo)
  alvo_nome, public.normalizar_alvo(alvo_nome), alvo_tipo, NULLIF(MIN(descricao), '')
FROM (
  SELECT alvo_nome, alvo_tipo, descricao FROM public.product_target_recommendations WHERE alvo_nome IS NOT NULL
  UNION ALL
  SELECT alvo_nome, alvo_tipo, descricao FROM public.microorganism_targets WHERE alvo_nome IS NOT NULL
) s
WHERE trim(alvo_nome) <> ''
GROUP BY alvo_nome, alvo_tipo
ON CONFLICT (nome_normalizado, tipo) DO NOTHING;

-- Vincula registros existentes ao catalogo
UPDATE public.product_target_recommendations p
SET catalogo_alvo_id = c.id
FROM public.catalogo_alvos c
WHERE c.nome_normalizado = public.normalizar_alvo(p.alvo_nome)
  AND c.tipo = p.alvo_tipo
  AND p.catalogo_alvo_id IS NULL;

UPDATE public.microorganism_targets m
SET catalogo_alvo_id = c.id
FROM public.catalogo_alvos c
WHERE c.nome_normalizado = public.normalizar_alvo(m.alvo_nome)
  AND c.tipo = m.alvo_tipo
  AND m.catalogo_alvo_id IS NULL;

-- 5. RPC bulk_inserir_alvos
CREATE OR REPLACE FUNCTION public.bulk_inserir_alvos(
  p_kind TEXT,
  p_parent_id UUID,
  p_alvos JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_item JSONB;
  v_nome TEXT;
  v_tipo TEXT;
  v_prio INT;
  v_desc TEXT;
  v_norm TEXT;
  v_cat_id UUID;
  v_criados INT := 0;
  v_vinculados INT := 0;
  v_ignorados INT := 0;
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'administrador'::app_role)
    OR public.has_role(v_uid, 'gestor'::app_role)
    OR public.has_role(v_uid, 'consultor_tecnico'::app_role)
    OR public.has_role(v_uid, 'tecnico_agronomo'::app_role)
  ) THEN
    RAISE EXCEPTION 'Sem permissão para inserir alvos';
  END IF;

  IF p_kind NOT IN ('produto', 'micro') THEN
    RAISE EXCEPTION 'p_kind inválido (use produto ou micro)';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_alvos) LOOP
    v_nome := trim(coalesce(v_item->>'nome', ''));
    v_tipo := coalesce(v_item->>'tipo', 'praga');
    v_prio := coalesce((v_item->>'prioridade')::INT, 5);
    v_desc := NULLIF(trim(coalesce(v_item->>'descricao', '')), '');

    IF v_nome = '' THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    v_norm := public.normalizar_alvo(v_nome);

    -- upsert no catalogo
    INSERT INTO public.catalogo_alvos (nome, nome_normalizado, tipo, descricao, criado_por)
    VALUES (v_nome, v_norm, v_tipo, v_desc, v_uid)
    ON CONFLICT (nome_normalizado, tipo) DO UPDATE SET ativo = true
    RETURNING id INTO v_cat_id;

    IF FOUND AND (SELECT created_at = updated_at FROM public.catalogo_alvos WHERE id = v_cat_id) THEN
      v_criados := v_criados + 1;
    END IF;

    -- evita duplicar na ficha
    IF p_kind = 'produto' THEN
      SELECT EXISTS(
        SELECT 1 FROM public.product_target_recommendations
        WHERE produto_id = p_parent_id AND ativo = true
          AND (catalogo_alvo_id = v_cat_id OR public.normalizar_alvo(alvo_nome) = v_norm)
      ) INTO v_exists;

      IF v_exists THEN
        v_ignorados := v_ignorados + 1;
      ELSE
        INSERT INTO public.product_target_recommendations
          (produto_id, alvo_nome, alvo_tipo, descricao, prioridade, ativo, catalogo_alvo_id)
        VALUES (p_parent_id, v_nome, v_tipo, v_desc, v_prio, true, v_cat_id);
        v_vinculados := v_vinculados + 1;
      END IF;
    ELSE
      SELECT EXISTS(
        SELECT 1 FROM public.microorganism_targets
        WHERE microrganismo_id = p_parent_id AND ativo = true
          AND (catalogo_alvo_id = v_cat_id OR public.normalizar_alvo(alvo_nome) = v_norm)
      ) INTO v_exists;

      IF v_exists THEN
        v_ignorados := v_ignorados + 1;
      ELSE
        INSERT INTO public.microorganism_targets
          (microrganismo_id, alvo_nome, alvo_tipo, descricao, prioridade, ativo, catalogo_alvo_id)
        VALUES (p_parent_id, v_nome, v_tipo, v_desc, v_prio, true, v_cat_id);
        v_vinculados := v_vinculados + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'criados_no_catalogo', v_criados,
    'vinculados', v_vinculados,
    'ignorados', v_ignorados
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_inserir_alvos(TEXT, UUID, JSONB) TO authenticated;
