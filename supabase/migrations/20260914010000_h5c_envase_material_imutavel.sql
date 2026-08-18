-- =====================================================================
-- H5c — H5-002 (item 7): fecha o bypass de sobre-envase por UPDATE/DELETE
-- Alvo EXCLUSIVO: staging ikaauvsflpmamgxmkhoq.
-- fn_validate_envase_volume roda apenas em INSERT; policies de UPDATE
-- (Admin/Gestor/Producao e OnFarm) permitiriam aumentar quantidade /
-- volume_por_unidade ou trocar o lote sem revalidar o saldo produzido.
-- Decisão: FAIL-CLOSED — envase registrado é imutável nos campos materiais
-- e não pode ser excluído; correção se faz por novo registro/estorno formal.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.fn_envase_material_imutavel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  -- Escape controlado apenas para manutenção/fixtures (nunca anon/authenticated).
  IF COALESCE(current_setting('app.estoque_purge_fixture', true), '') = 'on'
     AND current_user NOT IN ('anon','authenticated') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'ENVASE_IMUTAVEL: o envase % do lote % nao pode ser excluido. Registre um estorno/novo envase.', OLD.id, OLD.lote_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.lote_id IS DISTINCT FROM OLD.lote_id
     OR NEW.quantidade IS DISTINCT FROM OLD.quantidade
     OR NEW.volume_por_unidade IS DISTINCT FROM OLD.volume_por_unidade THEN
    RAISE EXCEPTION 'ENVASE_IMUTAVEL: lote/quantidade/volume_por_unidade do envase % nao podem ser alterados apos o registro.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_envase_material_imutavel ON public.envase;
CREATE TRIGGER trg_envase_material_imutavel
BEFORE UPDATE OR DELETE ON public.envase
FOR EACH ROW EXECUTE FUNCTION public.fn_envase_material_imutavel();

REVOKE ALL ON FUNCTION public.fn_envase_material_imutavel() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_envase_material_imutavel() FROM anon;

