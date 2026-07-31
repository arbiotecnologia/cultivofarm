-- 1) Colunas de desativação
ALTER TABLE public.culturas
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS desativada_em timestamptz,
  ADD COLUMN IF NOT EXISTS desativada_por uuid;

-- 2) Proteção case-insensitive contra duplicidade
CREATE UNIQUE INDEX IF NOT EXISTS culturas_nome_ci_uidx
  ON public.culturas (lower(btrim(nome)));

-- 3) Cultura em uso?
CREATE OR REPLACE FUNCTION public.fn_cultura_em_uso(_cultura_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.talhoes t WHERE t.cultura_id = _cultura_id)
      OR EXISTS (SELECT 1 FROM public.talhao_safras ts WHERE ts.cultura_id = _cultura_id)
      OR EXISTS (SELECT 1 FROM public.visitas_campo v WHERE v.cultura_id = _cultura_id)
      OR EXISTS (SELECT 1 FROM public.registros_consultor r WHERE r.cultura_id = _cultura_id)
      OR EXISTS (SELECT 1 FROM public.ordens_servico_onfarm o WHERE o.cultura_id = _cultura_id)
      OR EXISTS (SELECT 1 FROM public.product_crop_recommendations p WHERE p.cultura_id = _cultura_id)
      OR EXISTS (SELECT 1 FROM public.microorganism_crop_recommendations m WHERE m.cultura_id = _cultura_id)
      OR EXISTS (SELECT 1 FROM public.objetivos_visita_sugestoes ov WHERE ov.cultura_id = _cultura_id);
$$;

REVOKE ALL ON FUNCTION public.fn_cultura_em_uso(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.fn_cultura_em_uso(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_cultura_em_uso(uuid) TO service_role;

-- 4) Guarda de exclusão física
CREATE OR REPLACE FUNCTION public.tg_culturas_block_delete_in_use()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.fn_cultura_em_uso(OLD.id) THEN
    RAISE EXCEPTION 'Cultura em uso nao pode ser excluida. Desative a cultura em vez de excluir.'
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_culturas_block_delete_in_use ON public.culturas;
CREATE TRIGGER trg_culturas_block_delete_in_use
  BEFORE DELETE ON public.culturas
  FOR EACH ROW EXECUTE FUNCTION public.tg_culturas_block_delete_in_use();

-- 5) Auditoria de desativacao
CREATE OR REPLACE FUNCTION public.tg_culturas_stamp_desativacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    IF NEW.ativo = false THEN
      NEW.desativada_em := now();
      NEW.desativada_por := auth.uid();
    ELSE
      NEW.desativada_em := NULL;
      NEW.desativada_por := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_culturas_stamp_desativacao ON public.culturas;
CREATE TRIGGER trg_culturas_stamp_desativacao
  BEFORE UPDATE ON public.culturas
  FOR EACH ROW EXECUTE FUNCTION public.tg_culturas_stamp_desativacao();