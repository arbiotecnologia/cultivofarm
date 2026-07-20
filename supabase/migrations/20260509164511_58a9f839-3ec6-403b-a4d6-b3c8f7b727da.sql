CREATE OR REPLACE FUNCTION public.validate_retorno_tecnico_consistency()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tipo_demanda = 'retorno_tecnico' THEN
        -- Validar data obrigatória e no futuro
        IF NEW.data_prevista_atendimento IS NULL THEN
            RAISE EXCEPTION 'Data prevista é obrigatória para retornos técnicos.';
        END IF;

        IF NEW.data_prevista_atendimento < now() - interval '1 hour' THEN
            RAISE EXCEPTION 'A data do retorno não pode ser no passado.';
        END IF;

        -- Validar descrição/motivo
        IF NEW.descricao IS NULL OR length(trim(NEW.descricao)) < 5 THEN
            RAISE EXCEPTION 'O motivo do retorno deve ser detalhado na descrição.';
        END IF;

        -- Validar consultor
        IF NEW.consultor_atribuido IS NULL THEN
            RAISE EXCEPTION 'Um consultor deve estar atribuído ao retorno.';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trigger_validate_retorno_tecnico
BEFORE INSERT OR UPDATE ON public.portal_solicitacoes
FOR EACH ROW
EXECUTE FUNCTION public.validate_retorno_tecnico_consistency();
