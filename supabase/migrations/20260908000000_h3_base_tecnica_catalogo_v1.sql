-- FASE H3 — Base Técnica, dados mestres e catálogo (staging ikaauvsflpmamgxmkhoq)
-- 1) Arredondamento monetário determinístico nos volumes de catálogo
-- 2) Fechamento da leitura ampla de produtos/microrganismos (colunas internas)
-- 3) Views canônicas de ficha pública (colunas seguras) para produtor/parceiro

BEGIN;

-- 1) Trigger de cálculo com arredondamento monetário determinístico (2 casas)
CREATE OR REPLACE FUNCTION public.sync_catalogo_volumes_calc()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.volume_ml IS NOT NULL AND NEW.volume_ml > 0 AND NEW.preco_brl IS NOT NULL THEN
    NEW.preco_litro_brl := round(NEW.preco_brl / (NEW.volume_ml / 1000.0), 2);
    NEW.valor_dose_100ml_brl := round(NEW.preco_litro_brl / 10.0, 2);
  ELSE
    NEW.preco_litro_brl := NULL;
    NEW.valor_dose_100ml_brl := NULL;
  END IF;
  IF NEW.volume_ml IS NOT NULL AND NEW.volume_ml > 0 THEN
    NEW.doses_por_volume := round(NEW.volume_ml / 100.0, 4);
  ELSE
    NEW.doses_por_volume := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;

-- Backfill determinístico (reexecuta o trigger em todas as linhas)
UPDATE public.catalogo_volumes SET preco_brl = preco_brl;

-- 2) Leitura de produtos/microrganismos restrita a papéis internos.
--    Parceiro B2B continua coberto por produtos_b2b_read / micros_b2b_read.
--    Cliente produtor passa a ler apenas as views de ficha pública.
DROP POLICY IF EXISTS "Authenticated users can read produtos" ON public.produtos;
DROP POLICY IF EXISTS "ReadOnly global products" ON public.produtos;
DROP POLICY IF EXISTS "Authenticated users can read microrganismos" ON public.microrganismos;

CREATE POLICY produtos_select_internal ON public.produtos
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role) OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  OR has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'aplicador'::app_role) OR has_role(auth.uid(), 'operador_onfarm'::app_role)
);

CREATE POLICY microrganismos_select_internal ON public.microrganismos
FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'administrador'::app_role) OR has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'gestor_comercial'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role)
  OR has_role(auth.uid(), 'consultor_tecnico'::app_role) OR has_role(auth.uid(), 'tecnico_agronomo'::app_role)
  OR has_role(auth.uid(), 'producao'::app_role) OR has_role(auth.uid(), 'administrativo'::app_role)
  OR has_role(auth.uid(), 'aplicador'::app_role) OR has_role(auth.uid(), 'operador_onfarm'::app_role)
);

-- 3) Views canônicas de ficha pública — somente colunas não sensíveis.
--    Nunca expõem fornecedor, meio_cultivo, observacoes internas ou preco_tabela.
CREATE OR REPLACE VIEW public.vw_catalogo_ficha_produtos AS
SELECT p.id, p.nome, p.codigo, p.tipo, p.descricao, p.ativo,
       p.valor_dose_brl, p.valor_litro_brl, p.valor_ha_brl, p.dose_ml_ha
FROM public.produtos p;

CREATE OR REPLACE VIEW public.vw_catalogo_ficha_microrganismos AS
SELECT m.id, m.nome, m.nome_cientifico, m.funcao_agronomica, m.ativo,
       m.valor_dose_brl, m.valor_litro_brl, m.dose_ml_ha
FROM public.microrganismos m;

REVOKE ALL ON public.vw_catalogo_ficha_produtos FROM PUBLIC, anon;
REVOKE ALL ON public.vw_catalogo_ficha_microrganismos FROM PUBLIC, anon;
GRANT SELECT ON public.vw_catalogo_ficha_produtos TO authenticated;
GRANT SELECT ON public.vw_catalogo_ficha_microrganismos TO authenticated;
GRANT SELECT ON public.vw_catalogo_ficha_produtos TO service_role;
GRANT SELECT ON public.vw_catalogo_ficha_microrganismos TO service_role;

COMMIT;
