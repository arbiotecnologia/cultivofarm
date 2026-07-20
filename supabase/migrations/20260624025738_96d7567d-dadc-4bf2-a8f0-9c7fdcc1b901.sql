
-- 1) Tabela de sequências por prefixo
CREATE TABLE IF NOT EXISTS public.codigo_sequencias (
  prefixo TEXT PRIMARY KEY,
  proximo_numero INT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.codigo_sequencias TO authenticated;
GRANT ALL ON public.codigo_sequencias TO service_role;

ALTER TABLE public.codigo_sequencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "codigo_sequencias leitura autenticada" ON public.codigo_sequencias;
CREATE POLICY "codigo_sequencias leitura autenticada"
  ON public.codigo_sequencias FOR SELECT TO authenticated USING (true);

-- 2) Mapeamento tipo -> prefixo
CREATE OR REPLACE FUNCTION public.prefixo_para_produto(_tipo TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_tipo,''))
    WHEN 'solo' THEN 'SOLO'
    WHEN 'inseticida' THEN 'INS'
    WHEN 'fungicida' THEN 'FUNG'
    WHEN 'inoculante' THEN 'INO'
    WHEN 'solubilizador' THEN 'SOLB'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.prefixo_para_microrganismo(_tipo TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_tipo,''))
    WHEN 'bacteria' THEN 'BAC'
    WHEN 'fungo' THEN 'FUN'
    WHEN 'levedura' THEN 'LEV'
    WHEN 'consorcio' THEN 'CON'
    ELSE NULL
  END;
$$;

-- 3) Função geradora atômica
CREATE OR REPLACE FUNCTION public.proximo_codigo(_prefixo TEXT, _tabela TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max INT;
  v_seed INT;
  v_next INT;
BEGIN
  IF _prefixo IS NULL OR _prefixo = '' THEN
    RAISE EXCEPTION 'prefixo obrigatório';
  END IF;

  INSERT INTO public.codigo_sequencias(prefixo, proximo_numero)
  VALUES (_prefixo, 1)
  ON CONFLICT (prefixo) DO NOTHING;

  -- adquire row lock no contador
  UPDATE public.codigo_sequencias
    SET proximo_numero = proximo_numero
    WHERE prefixo = _prefixo
    RETURNING proximo_numero INTO v_seed;

  -- garante alinhamento com o MAX(N) atual da tabela alvo
  IF _tabela = 'produtos' THEN
    SELECT COALESCE(MAX((regexp_match(codigo, '^' || _prefixo || '-(\d+)$'))[1]::int), 0) + 1
      INTO v_max FROM public.produtos;
  ELSIF _tabela = 'microrganismos' THEN
    SELECT COALESCE(MAX((regexp_match(codigo, '^' || _prefixo || '-(\d+)$'))[1]::int), 0) + 1
      INTO v_max FROM public.microrganismos;
  ELSE
    RAISE EXCEPTION 'tabela inválida: %', _tabela;
  END IF;

  v_next := GREATEST(v_seed, v_max);

  UPDATE public.codigo_sequencias
    SET proximo_numero = v_next + 1,
        updated_at = now()
    WHERE prefixo = _prefixo;

  RETURN _prefixo || '-' || v_next;
END;
$$;

-- 4) Triggers em produtos
CREATE OR REPLACE FUNCTION public.set_codigo_produto()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefixo TEXT;
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    v_prefixo := public.prefixo_para_produto(NEW.tipo::text);
    IF v_prefixo IS NULL THEN
      RAISE EXCEPTION 'Tipo de produto sem prefixo definido: %', NEW.tipo;
    END IF;
    NEW.codigo := public.proximo_codigo(v_prefixo, 'produtos');
  ELSE
    NEW.codigo := btrim(NEW.codigo);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_codigo_produto_ins ON public.produtos;
CREATE TRIGGER trg_set_codigo_produto_ins
  BEFORE INSERT ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_codigo_produto();

DROP TRIGGER IF EXISTS trg_set_codigo_produto_upd ON public.produtos;
CREATE TRIGGER trg_set_codigo_produto_upd
  BEFORE UPDATE OF codigo ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_codigo_produto();

-- 5) Triggers em microrganismos
CREATE OR REPLACE FUNCTION public.set_codigo_microrganismo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefixo TEXT;
BEGIN
  IF NEW.codigo IS NULL OR btrim(NEW.codigo) = '' THEN
    v_prefixo := public.prefixo_para_microrganismo(NEW.tipo::text);
    IF v_prefixo IS NULL THEN
      RAISE EXCEPTION 'Tipo de microrganismo sem prefixo definido: %', NEW.tipo;
    END IF;
    NEW.codigo := public.proximo_codigo(v_prefixo, 'microrganismos');
  ELSE
    NEW.codigo := btrim(NEW.codigo);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_codigo_micro_ins ON public.microrganismos;
CREATE TRIGGER trg_set_codigo_micro_ins
  BEFORE INSERT ON public.microrganismos
  FOR EACH ROW EXECUTE FUNCTION public.set_codigo_microrganismo();

DROP TRIGGER IF EXISTS trg_set_codigo_micro_upd ON public.microrganismos;
CREATE TRIGGER trg_set_codigo_micro_upd
  BEFORE UPDATE OF codigo ON public.microrganismos
  FOR EACH ROW EXECUTE FUNCTION public.set_codigo_microrganismo();

-- 6) Unicidade do código de microrganismos
ALTER TABLE public.microrganismos
  DROP CONSTRAINT IF EXISTS microrganismos_codigo_key;
ALTER TABLE public.microrganismos
  ADD CONSTRAINT microrganismos_codigo_key UNIQUE (codigo);

-- 7) Seed da tabela de sequências com base nos códigos existentes
INSERT INTO public.codigo_sequencias(prefixo, proximo_numero)
SELECT p, COALESCE(MAX(n),0)+1 AS proximo
FROM (
  SELECT 'SOLO'::text AS p, (regexp_match(codigo,'^SOLO-(\d+)$'))[1]::int AS n FROM public.produtos
  UNION ALL SELECT 'INS',   (regexp_match(codigo,'^INS-(\d+)$'))[1]::int FROM public.produtos
  UNION ALL SELECT 'FUNG',  (regexp_match(codigo,'^FUNG-(\d+)$'))[1]::int FROM public.produtos
  UNION ALL SELECT 'INO',   (regexp_match(codigo,'^INO-(\d+)$'))[1]::int FROM public.produtos
  UNION ALL SELECT 'SOLB',  (regexp_match(codigo,'^SOLB-(\d+)$'))[1]::int FROM public.produtos
  UNION ALL SELECT 'BAC',   (regexp_match(codigo,'^BAC-(\d+)$'))[1]::int FROM public.microrganismos
  UNION ALL SELECT 'FUN',   (regexp_match(codigo,'^FUN-(\d+)$'))[1]::int FROM public.microrganismos
  UNION ALL SELECT 'LEV',   (regexp_match(codigo,'^LEV-(\d+)$'))[1]::int FROM public.microrganismos
  UNION ALL SELECT 'CON',   (regexp_match(codigo,'^CON-(\d+)$'))[1]::int FROM public.microrganismos
) t
GROUP BY p
ON CONFLICT (prefixo) DO UPDATE
  SET proximo_numero = GREATEST(public.codigo_sequencias.proximo_numero, EXCLUDED.proximo_numero),
      updated_at = now();
