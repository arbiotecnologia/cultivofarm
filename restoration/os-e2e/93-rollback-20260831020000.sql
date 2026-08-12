-- ROLLBACK EXATO de 13-migration-20260831020000_envase_cq_trigger_determinismo.sql
DO $guard$
BEGIN
  IF current_database() = 'navfzbwgwzruipouyfnk'
     OR coalesce(current_setting('lovable.project_ref', true), '') = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.fn_validate_envase_cq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
    v_lote_status TEXT;
    v_cq_resultado TEXT;
BEGIN
    SELECT status INTO v_lote_status
    FROM public.lotes
    WHERE id = NEW.lote_id;

    SELECT resultado::text INTO v_cq_resultado
    FROM public.controle_qualidade
    WHERE lote_id = NEW.lote_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_lote_status <> 'aprovado' OR v_cq_resultado IS NULL OR v_cq_resultado <> 'aprovado' THEN
        RAISE EXCEPTION 'O lote % não possui Controle de Qualidade aprovado. O envase não é permitido.',
            (SELECT codigo_lote FROM public.lotes WHERE id = NEW.lote_id);
    END IF;

    RETURN NEW;
END;
$function$;
