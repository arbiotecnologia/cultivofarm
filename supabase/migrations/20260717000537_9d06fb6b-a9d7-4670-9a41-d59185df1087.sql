-- Fase 8: revogar mutations diretas em visitas_campo
REVOKE INSERT, UPDATE, DELETE ON public.visitas_campo FROM authenticated;
GRANT SELECT ON public.visitas_campo TO authenticated;
GRANT ALL ON public.visitas_campo TO service_role;

-- Trigger de proteção: impede alteração de campos-chave e força versao monotônica
CREATE OR REPLACE FUNCTION public.visitas_campo_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.registro_consultor_id IS DISTINCT FROM OLD.registro_consultor_id THEN
    RAISE EXCEPTION 'campo_imutavel_registro_consultor_id' USING ERRCODE = '42501';
  END IF;
  IF NEW.cliente_id IS DISTINCT FROM OLD.cliente_id THEN
    RAISE EXCEPTION 'campo_imutavel_cliente_id' USING ERRCODE = '42501';
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'campo_imutavel_created_by' USING ERRCODE = '42501';
  END IF;
  IF OLD.client_uuid IS NOT NULL AND NEW.client_uuid IS DISTINCT FROM OLD.client_uuid THEN
    RAISE EXCEPTION 'campo_imutavel_client_uuid' USING ERRCODE = '42501';
  END IF;
  IF NEW.versao <= OLD.versao THEN
    RAISE EXCEPTION 'versao_deve_incrementar' USING ERRCODE = '40001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_visitas_campo_guard ON public.visitas_campo;
CREATE TRIGGER trg_visitas_campo_guard
  BEFORE UPDATE ON public.visitas_campo
  FOR EACH ROW EXECUTE FUNCTION public.visitas_campo_guard();