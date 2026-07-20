-- Adicionar coluna de duração em portal_solicitacoes
ALTER TABLE public.portal_solicitacoes 
ADD COLUMN IF NOT EXISTS duracao_estimada INTEGER;

-- Adicionar coluna de duração em registros_consultor
ALTER TABLE public.registros_consultor 
ADD COLUMN IF NOT EXISTS duracao_estimada INTEGER;

-- Atualizar a função de validação para incluir check de sobreposição
CREATE OR REPLACE FUNCTION public.validate_retorno_tecnico_consistency()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    has_overlap BOOLEAN;
    visit_duration INTEGER;
BEGIN
    -- Se tem data e consultor, validar sobreposição (independente do tipo de demanda)
    IF NEW.data_prevista_atendimento IS NOT NULL AND NEW.consultor_atribuido IS NOT NULL THEN
        
        -- Duração padrão de 120 min se não informado
        visit_duration := COALESCE(NEW.duracao_estimada, 120);

        -- Verificar sobreposições
        -- Consideramos que uma visita ocupa o intervalo [data, data + duracao]
        SELECT EXISTS (
            SELECT 1 FROM portal_solicitacoes
            WHERE consultor_atribuido = NEW.consultor_atribuido
            AND id <> NEW.id -- desconsiderar a própria
            AND data_prevista_atendimento IS NOT NULL
            AND status NOT IN ('concluida', 'cancelada')
            AND (
                -- Caso A: Nova visita começa DURANTE uma existente
                (NEW.data_prevista_atendimento >= data_prevista_atendimento AND NEW.data_prevista_atendimento < (data_prevista_atendimento + (COALESCE(duracao_estimada, 120) || ' minutes')::interval))
                OR
                -- Caso B: Visita existente começa DURANTE a nova
                (data_prevista_atendimento >= NEW.data_prevista_atendimento AND data_prevista_atendimento < (NEW.data_prevista_atendimento + (visit_duration || ' minutes')::interval))
            )
        ) INTO has_overlap;

        IF has_overlap THEN
            RAISE EXCEPTION 'CONFLITO_AGENDA: Já existe uma visita agendada para este consultor neste horário ou intervalo.';
        END IF;
    END IF;

    -- Validações específicas para o tipo 'retorno_tecnico'
    IF NEW.tipo_demanda = 'retorno_tecnico' THEN
        -- Validar data obrigatória e no futuro (tolerância de 1h)
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
        
        -- Validar duração
        IF NEW.duracao_estimada IS NULL OR NEW.duracao_estimada <= 0 THEN
             RAISE EXCEPTION 'Duração estimada é obrigatória para retornos técnicos.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
