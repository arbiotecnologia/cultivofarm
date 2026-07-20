-- Adicionar campo de confirmação à tabela de solicitações
ALTER TABLE public.portal_solicitacoes 
ADD COLUMN IF NOT EXISTS confirmacao_produtor text DEFAULT 'pendente';

-- Criar trigger de notificação para o consultor
CREATE OR REPLACE FUNCTION public.notify_consultor_on_confirmacao_produtor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cliente_nome text;
BEGIN
  -- Só dispara se for um retorno técnico e o status de confirmação mudou
  IF NEW.tipo_demanda = 'retorno_tecnico' AND OLD.confirmacao_produtor IS DISTINCT FROM NEW.confirmacao_produtor THEN
    
    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;

    INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
    VALUES (
      NEW.consultor_atribuido,
      'confirmacao_retorno',
      CASE 
        WHEN NEW.confirmacao_produtor = 'confirmada' THEN 'Retorno confirmado pelo produtor'
        WHEN NEW.confirmacao_produtor = 'remarcacao_solicitada' THEN 'Remarcação solicitada pelo produtor'
        ELSE 'Status de retorno alterado'
      END,
      'Cliente ' || COALESCE(v_cliente_nome,'') || ' — ' || 
      CASE 
        WHEN NEW.confirmacao_produtor = 'confirmada' THEN 'confirmou a visita para ' || to_char(NEW.data_prevista_atendimento, 'DD/MM')
        WHEN NEW.confirmacao_produtor = 'remarcacao_solicitada' THEN 'pediu para remarcar a visita de ' || to_char(NEW.data_prevista_atendimento, 'DD/MM')
        ELSE 'atualizou o status'
      END,
      '/agenda-tecnica?id=' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notify_consultor_confirmacao
AFTER UPDATE ON public.portal_solicitacoes
FOR EACH ROW
EXECUTE FUNCTION public.notify_consultor_on_confirmacao_produtor();
