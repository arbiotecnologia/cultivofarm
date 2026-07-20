
-- 1. Nova tabela N:N user_clientes
CREATE TABLE IF NOT EXISTS public.user_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  principal boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, cliente_id)
);

CREATE INDEX IF NOT EXISTS idx_user_clientes_user ON public.user_clientes(user_id);
CREATE INDEX IF NOT EXISTS idx_user_clientes_cliente ON public.user_clientes(cliente_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_clientes_principal
  ON public.user_clientes(user_id) WHERE principal = true;

ALTER TABLE public.user_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_clientes self select"
  ON public.user_clientes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "user_clientes staff select"
  ON public.user_clientes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
  );

CREATE POLICY "user_clientes admin manage"
  ON public.user_clientes FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
  );

-- 2. Backfill a partir de profiles.cliente_id
INSERT INTO public.user_clientes (user_id, cliente_id, principal)
SELECT user_id, cliente_id, true
  FROM public.profiles
 WHERE cliente_id IS NOT NULL
ON CONFLICT (user_id, cliente_id) DO NOTHING;

-- 3. Função que retorna array de clientes do usuário
CREATE OR REPLACE FUNCTION public.get_cliente_ids_for_user(_user_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(cliente_id), ARRAY[]::uuid[])
    FROM public.user_clientes
   WHERE user_id = _user_id
$$;

-- 4. Atualizar get_cliente_id_for_user para usar a tabela nova (principal > primeiro)
CREATE OR REPLACE FUNCTION public.get_cliente_id_for_user(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cliente_id
    FROM public.user_clientes
   WHERE user_id = _user_id
   ORDER BY principal DESC, created_at ASC
   LIMIT 1
$$;

-- 5. Trigger: garantir um único principal por usuário e sincronizar profiles.cliente_id
CREATE OR REPLACE FUNCTION public.sync_user_cliente_principal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid;
  v_principal uuid;
BEGIN
  v_user := COALESCE(NEW.user_id, OLD.user_id);

  -- Se inseriu/atualizou marcando principal, desmarca os demais
  IF TG_OP IN ('INSERT','UPDATE') AND NEW.principal THEN
    UPDATE public.user_clientes
       SET principal = false
     WHERE user_id = v_user
       AND id <> NEW.id
       AND principal = true;
  END IF;

  -- Garante que sempre exista um principal se houver linhas
  IF NOT EXISTS (
    SELECT 1 FROM public.user_clientes WHERE user_id = v_user AND principal = true
  ) THEN
    UPDATE public.user_clientes
       SET principal = true
     WHERE id = (
       SELECT id FROM public.user_clientes
        WHERE user_id = v_user
        ORDER BY created_at ASC LIMIT 1
     );
  END IF;

  -- Sincroniza profiles.cliente_id com o principal atual
  SELECT cliente_id INTO v_principal
    FROM public.user_clientes
   WHERE user_id = v_user AND principal = true
   LIMIT 1;

  UPDATE public.profiles
     SET cliente_id = v_principal
   WHERE user_id = v_user
     AND COALESCE(cliente_id::text,'') IS DISTINCT FROM COALESCE(v_principal::text,'');

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_user_clientes_sync ON public.user_clientes;
CREATE TRIGGER trg_user_clientes_sync
AFTER INSERT OR UPDATE OR DELETE ON public.user_clientes
FOR EACH ROW EXECUTE FUNCTION public.sync_user_cliente_principal();

-- 6. Atualizar enforce_cliente_id_for_produtor para considerar user_clientes
CREATE OR REPLACE FUNCTION public.enforce_cliente_id_for_produtor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  IF TG_TABLE_NAME = 'user_roles' AND NEW.role = 'cliente_produtor' THEN
    SELECT count(*) INTO v_count FROM public.user_clientes WHERE user_id = NEW.user_id;
    IF v_count = 0 THEN
      RAISE EXCEPTION 'Para a função "Produtor (Portal)" é obrigatório vincular o usuário a pelo menos um cliente.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- Não exige mais profiles.cliente_id; vínculo é via user_clientes
  RETURN NEW;
END;
$$;

-- 7. Substituir políticas RLS que filtravam por get_cliente_id_for_user(auth.uid())
-- portal_solicitacoes
DROP POLICY IF EXISTS "Portal users can insert own requests" ON public.portal_solicitacoes;
CREATE POLICY "Portal users can insert own requests"
  ON public.portal_solicitacoes FOR INSERT TO authenticated
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

DROP POLICY IF EXISTS "Portal users can read own requests" ON public.portal_solicitacoes;
CREATE POLICY "Portal users can read own requests"
  ON public.portal_solicitacoes FOR SELECT TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

-- clientes
DROP POLICY IF EXISTS "Clients can view their own record" ON public.clientes;
CREATE POLICY "Clients can view their own record"
  ON public.clientes FOR SELECT TO authenticated
  USING (id = ANY(get_cliente_ids_for_user(auth.uid())));

-- fazendas
DROP POLICY IF EXISTS "Users can only view their own farms" ON public.fazendas;
CREATE POLICY "Users can only view their own farms"
  ON public.fazendas FOR SELECT TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

-- cliente_contatos
DROP POLICY IF EXISTS "Users delete own contacts" ON public.cliente_contatos;
CREATE POLICY "Users delete own contacts"
  ON public.cliente_contatos FOR DELETE TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

DROP POLICY IF EXISTS "Users insert own contacts" ON public.cliente_contatos;
CREATE POLICY "Users insert own contacts"
  ON public.cliente_contatos FOR INSERT TO authenticated
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

DROP POLICY IF EXISTS "Users update own contacts" ON public.cliente_contatos;
CREATE POLICY "Users update own contacts"
  ON public.cliente_contatos FOR UPDATE TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())))
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

DROP POLICY IF EXISTS "Users view own contacts" ON public.cliente_contatos;
CREATE POLICY "Users view own contacts"
  ON public.cliente_contatos FOR SELECT TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

-- cliente_documentos
DROP POLICY IF EXISTS "Users can delete their own client documents" ON public.cliente_documentos;
CREATE POLICY "Users can delete their own client documents"
  ON public.cliente_documentos FOR DELETE TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

DROP POLICY IF EXISTS "Users can insert their own client documents" ON public.cliente_documentos;
CREATE POLICY "Users can insert their own client documents"
  ON public.cliente_documentos FOR INSERT TO authenticated
  WITH CHECK (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

DROP POLICY IF EXISTS "Users can only view their own client documents" ON public.cliente_documentos;
CREATE POLICY "Users can only view their own client documents"
  ON public.cliente_documentos FOR SELECT TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

DROP POLICY IF EXISTS "Users can update their own client documents" ON public.cliente_documentos;
CREATE POLICY "Users can update their own client documents"
  ON public.cliente_documentos FOR UPDATE TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

-- portal_notificacoes
DROP POLICY IF EXISTS "Portal users can read own notifications" ON public.portal_notificacoes;
CREATE POLICY "Portal users can read own notifications"
  ON public.portal_notificacoes FOR SELECT TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));

DROP POLICY IF EXISTS "Portal users can update own notifications" ON public.portal_notificacoes;
CREATE POLICY "Portal users can update own notifications"
  ON public.portal_notificacoes FOR UPDATE TO authenticated
  USING (cliente_id = ANY(get_cliente_ids_for_user(auth.uid())));
