
-- 1) Enrich portal_solicitacoes
ALTER TABLE public.portal_solicitacoes
  ADD COLUMN IF NOT EXISTS numero_solicitacao text,
  ADD COLUMN IF NOT EXISTS origem_solicitacao text DEFAULT 'portal_produtor',
  ADD COLUMN IF NOT EXISTS data_prevista_atendimento timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE SEQUENCE IF NOT EXISTS public.solicitacoes_numero_seq;

CREATE OR REPLACE FUNCTION public.gen_numero_solicitacao()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year text;
  v_seq bigint;
BEGIN
  IF NEW.numero_solicitacao IS NULL OR NEW.numero_solicitacao = '' THEN
    v_year := to_char(now(), 'YYYY');
    v_seq := nextval('public.solicitacoes_numero_seq');
    NEW.numero_solicitacao := 'SOL-' || v_year || '-' || lpad(v_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gen_numero_solicitacao ON public.portal_solicitacoes;
CREATE TRIGGER trg_gen_numero_solicitacao
  BEFORE INSERT ON public.portal_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.gen_numero_solicitacao();

-- Backfill existing rows
DO $$
DECLARE
  r record;
  v_year text;
  v_seq bigint;
BEGIN
  FOR r IN SELECT id, created_at FROM public.portal_solicitacoes WHERE numero_solicitacao IS NULL ORDER BY created_at LOOP
    v_year := to_char(r.created_at, 'YYYY');
    v_seq := nextval('public.solicitacoes_numero_seq');
    UPDATE public.portal_solicitacoes
      SET numero_solicitacao = 'SOL-' || v_year || '-' || lpad(v_seq::text, 6, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.portal_solicitacoes
  ADD CONSTRAINT portal_solicitacoes_numero_solicitacao_key UNIQUE (numero_solicitacao);

CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_data_prevista ON public.portal_solicitacoes(data_prevista_atendimento);
CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_consultor ON public.portal_solicitacoes(consultor_atribuido);
CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_status ON public.portal_solicitacoes(status);

-- 2) solicitacoes_timeline
CREATE TABLE IF NOT EXISTS public.solicitacoes_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitacao_id uuid NOT NULL,
  tipo_evento text NOT NULL,
  descricao text,
  usuario_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_timeline_solicitacao ON public.solicitacoes_timeline(solicitacao_id, created_at DESC);

ALTER TABLE public.solicitacoes_timeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_select_solicitacoes_timeline"
  ON public.solicitacoes_timeline FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_insert_solicitacoes_timeline"
  ON public.solicitacoes_timeline FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin_delete_solicitacoes_timeline"
  ON public.solicitacoes_timeline FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- 3) notificacoes_operacionais
CREATE TABLE IF NOT EXISTS public.notificacoes_operacionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  mensagem text,
  link text,
  lido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_op_usuario ON public.notificacoes_operacionais(usuario_id, lido, created_at DESC);

ALTER TABLE public.notificacoes_operacionais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_select_own_notif_op"
  ON public.notificacoes_operacionais FOR SELECT TO authenticated
  USING (usuario_id = auth.uid());

CREATE POLICY "user_update_own_notif_op"
  ON public.notificacoes_operacionais FOR UPDATE TO authenticated
  USING (usuario_id = auth.uid());

CREATE POLICY "auth_insert_notif_op"
  ON public.notificacoes_operacionais FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "admin_delete_notif_op"
  ON public.notificacoes_operacionais FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'administrador'::app_role));

-- 4) Trigger: auto-advance status on visitas_checkin
CREATE OR REPLACE FUNCTION public.auto_advance_solicitacao_on_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
      SET status = 'checkin_realizado', updated_at = now()
      WHERE id = NEW.solicitacao_id
        AND status NOT IN ('concluida','cancelada','aguardando_os','aguardando_recomendacao');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_advance_solicitacao_checkin ON public.visitas_checkin;
CREATE TRIGGER trg_auto_advance_solicitacao_checkin
  AFTER INSERT ON public.visitas_checkin
  FOR EACH ROW EXECUTE FUNCTION public.auto_advance_solicitacao_on_checkin();

-- 5) Trigger: auto-advance on registros_consultor changes
CREATE OR REPLACE FUNCTION public.auto_advance_solicitacao_on_registro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.solicitacao_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- hora_inicio set => em_visita
  IF TG_OP = 'UPDATE' AND OLD.hora_inicio IS NULL AND NEW.hora_inicio IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
      SET status = 'em_visita', updated_at = now()
      WHERE id = NEW.solicitacao_id
        AND status NOT IN ('concluida','cancelada');
  END IF;

  -- status convertido_os => concluida
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status::text = 'convertido_os' THEN
    UPDATE public.portal_solicitacoes
      SET status = 'concluida', updated_at = now()
      WHERE id = NEW.solicitacao_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_advance_solicitacao_registro ON public.registros_consultor;
CREATE TRIGGER trg_auto_advance_solicitacao_registro
  AFTER UPDATE ON public.registros_consultor
  FOR EACH ROW EXECUTE FUNCTION public.auto_advance_solicitacao_on_registro();

-- 6) Trigger: when an OS onfarm is created from a registro, set solicitation to aguardando_os
CREATE OR REPLACE FUNCTION public.auto_advance_solicitacao_on_os()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitacao_id uuid;
BEGIN
  IF NEW.registro_consultor_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT solicitacao_id INTO v_solicitacao_id
    FROM public.registros_consultor WHERE id = NEW.registro_consultor_id;
  IF v_solicitacao_id IS NOT NULL THEN
    UPDATE public.portal_solicitacoes
      SET status = 'aguardando_os', updated_at = now()
      WHERE id = v_solicitacao_id
        AND status NOT IN ('concluida','cancelada');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_advance_solicitacao_os ON public.ordens_servico_onfarm;
CREATE TRIGGER trg_auto_advance_solicitacao_os
  AFTER INSERT ON public.ordens_servico_onfarm
  FOR EACH ROW EXECUTE FUNCTION public.auto_advance_solicitacao_on_os();

-- 7) Trigger: notify consultor when assigned (notificacoes_operacionais)
CREATE OR REPLACE FUNCTION public.notify_consultor_atribuido_op()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cliente_nome text;
BEGIN
  IF NEW.consultor_atribuido IS NULL THEN
    RETURN NEW;
  END IF;

  IF (TG_OP = 'INSERT')
     OR (TG_OP = 'UPDATE' AND COALESCE(OLD.consultor_atribuido::text,'') IS DISTINCT FROM NEW.consultor_atribuido::text) THEN

    SELECT nome INTO v_cliente_nome FROM public.clientes WHERE id = NEW.cliente_id;

    INSERT INTO public.notificacoes_operacionais (usuario_id, tipo, titulo, mensagem, link)
    VALUES (
      NEW.consultor_atribuido,
      CASE WHEN NEW.urgencia = 'critica' THEN 'urgencia_critica' ELSE 'nova_solicitacao' END,
      CASE WHEN NEW.urgencia = 'critica' THEN 'Solicitação CRÍTICA atribuída' ELSE 'Nova solicitação atribuída' END,
      'Cliente ' || COALESCE(v_cliente_nome,'') || ' — ' || COALESCE(NEW.tipo_demanda,''),
      '/solicitacoes?id=' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_consultor_atribuido_op ON public.portal_solicitacoes;
CREATE TRIGGER trg_notify_consultor_atribuido_op
  AFTER INSERT OR UPDATE OF consultor_atribuido ON public.portal_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.notify_consultor_atribuido_op();
