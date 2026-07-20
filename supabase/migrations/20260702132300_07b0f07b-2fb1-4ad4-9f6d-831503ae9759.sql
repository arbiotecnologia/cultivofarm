CREATE OR REPLACE FUNCTION public.notify_managers_on_simulation_sent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_manager uuid;
BEGIN
  IF NEW.status = 'enviada_gestor'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    FOR v_manager IN
      SELECT DISTINCT pu.user_id
      FROM public.partner_users pu
      JOIN public.user_roles ur ON ur.user_id = pu.user_id
      WHERE pu.partner_id = NEW.partner_id
        AND ur.role IN ('parceiro_b2b','administrador','gestor_comercial')
        AND pu.user_id <> NEW.created_by
    LOOP
      INSERT INTO public.notificacoes_operacionais (
        usuario_id, tipo, titulo, mensagem, link
      ) VALUES (
        v_manager,
        'simulacao_enviada',
        'Nova simulação enviada',
        COALESCE('Simulação: ' || NEW.titulo, 'Uma simulação técnica foi enviada para revisão.'),
        '/portal-parceiro/simulacoes-equipe'
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_managers_on_simulation_sent ON public.partner_simulations;
CREATE TRIGGER trg_notify_managers_on_simulation_sent
AFTER INSERT OR UPDATE OF status ON public.partner_simulations
FOR EACH ROW
EXECUTE FUNCTION public.notify_managers_on_simulation_sent();