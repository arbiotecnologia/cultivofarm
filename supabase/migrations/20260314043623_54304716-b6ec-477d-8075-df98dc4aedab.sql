
-- Add cliente_id to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

-- Security definer function to get cliente_id for current user
CREATE OR REPLACE FUNCTION public.get_cliente_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- Enum for notification type
CREATE TYPE public.tipo_notificacao_portal AS ENUM (
  'informativo','alerta','entrega','recomendacao','aplicacao','sistema'
);

-- Portal notifications
CREATE TABLE public.portal_notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  mensagem text,
  tipo public.tipo_notificacao_portal NOT NULL DEFAULT 'informativo',
  lido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_notificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portal users can read own notifications"
ON public.portal_notificacoes FOR SELECT TO authenticated
USING (cliente_id = public.get_cliente_id_for_user(auth.uid()));

CREATE POLICY "Portal users can update own notifications"
ON public.portal_notificacoes FOR UPDATE TO authenticated
USING (cliente_id = public.get_cliente_id_for_user(auth.uid()));

CREATE POLICY "Admins can manage all notifications"
ON public.portal_notificacoes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

-- Portal service requests
CREATE TABLE public.portal_solicitacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  fazenda_id uuid REFERENCES public.fazendas(id),
  talhao_id uuid REFERENCES public.talhoes(id),
  tipo_demanda text NOT NULL,
  descricao text,
  urgencia text NOT NULL DEFAULT 'media',
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_solicitacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portal users can read own requests"
ON public.portal_solicitacoes FOR SELECT TO authenticated
USING (cliente_id = public.get_cliente_id_for_user(auth.uid()));

CREATE POLICY "Portal users can insert own requests"
ON public.portal_solicitacoes FOR INSERT TO authenticated
WITH CHECK (cliente_id = public.get_cliente_id_for_user(auth.uid()));

CREATE POLICY "Admins can manage all requests"
ON public.portal_solicitacoes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'administrador'));

CREATE POLICY "Authenticated can read all requests"
ON public.portal_solicitacoes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'gestor') OR public.has_role(auth.uid(), 'administrador'));
