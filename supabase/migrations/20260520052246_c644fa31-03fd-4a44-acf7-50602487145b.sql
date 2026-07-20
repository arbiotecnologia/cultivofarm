-- Function to validate CQ before envase
CREATE OR REPLACE FUNCTION public.fn_validate_envase_cq()
RETURNS TRIGGER AS $$
DECLARE
    v_lote_status TEXT;
    v_cq_resultado TEXT;
BEGIN
    -- Check batch status
    SELECT status INTO v_lote_status
    FROM public.lotes
    WHERE id = NEW.lote_id;

    -- Check CQ result explicitly
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
$$ LANGUAGE plpgsql;

-- Trigger to validate envase
CREATE TRIGGER trg_validate_envase_cq
BEFORE INSERT ON public.envase
FOR EACH ROW
EXECUTE FUNCTION public.fn_validate_envase_cq();
