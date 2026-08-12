-- =====================================================================
-- FASE 5 — determinismo do laudo CQ no TRIGGER de envase.
-- Terceiro sítio com o mesmo defeito de desempate (ORDER BY created_at
-- DESC sem critério secundário): com dois laudos no mesmo instante o
-- trigger podia ler o REPROVADO e bloquear indevidamente um lote aprovado.
-- Também fixa search_path = public, pg_temp.
-- Guard fail-closed: staging ikaauvsflpmamgxmkhoq. Produção RECUSADA.
-- =====================================================================
DO $guard$
BEGIN
  IF current_database() = 'navfzbwgwzruipouyfnk'
     OR coalesce(current_setting('lovable.project_ref', true), '') = 'navfzbwgwzruipouyfnk' THEN
    RAISE EXCEPTION 'ABORT_PRODUCAO: migration proibida em navfzbwgwzruipouyfnk';
  END IF;
  IF to_regclass('public._fiscal_staging_marker') IS NULL
     OR NOT EXISTS (SELECT 1 FROM public._fiscal_staging_marker
                     WHERE marker = 'STAGING' AND project_ref = 'ikaauvsflpmamgxmkhoq') THEN
    RAISE EXCEPTION 'ABORT_AMBIENTE: alvo nao e o staging ikaauvsflpmamgxmkhoq';
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.fn_validate_envase_cq()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_lote_status TEXT;
    v_cq_resultado TEXT;
BEGIN
    SELECT status INTO v_lote_status FROM public.lotes WHERE id = NEW.lote_id;

    SELECT resultado::text INTO v_cq_resultado
      FROM public.controle_qualidade
     WHERE lote_id = NEW.lote_id
     ORDER BY created_at DESC, ctid DESC
     LIMIT 1;

    IF v_lote_status <> 'aprovado' OR v_cq_resultado IS NULL OR v_cq_resultado <> 'aprovado' THEN
        RAISE EXCEPTION 'O lote % não possui Controle de Qualidade aprovado. O envase não é permitido.',
            (SELECT codigo_lote FROM public.lotes WHERE id = NEW.lote_id);
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_validate_envase_cq() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_validate_envase_cq() FROM anon;
