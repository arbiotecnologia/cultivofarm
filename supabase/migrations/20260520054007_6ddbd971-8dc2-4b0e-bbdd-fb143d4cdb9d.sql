CREATE TABLE IF NOT EXISTS public.reservas_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  usuario_id uuid DEFAULT auth.uid(),
  estoque_produto_id uuid,
  lote_id uuid,
  envase_id uuid,
  ordem_servico_id uuid,
  os_tipo text,
  cliente_id uuid,
  entrega_id uuid,
  quantidade_solicitada numeric,
  resultado text NOT NULL,
  motivo text,
  status_estoque_no_momento text,
  reservado_para_os_id_existente uuid,
  reservado_por_existente uuid
);

CREATE INDEX IF NOT EXISTS idx_reservas_audit_item ON public.reservas_auditoria(estoque_produto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservas_audit_os ON public.reservas_auditoria(ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_reservas_audit_user ON public.reservas_auditoria(usuario_id, created_at DESC);

ALTER TABLE public.reservas_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated insert audit"
  ON public.reservas_auditoria FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() OR usuario_id IS NULL);

CREATE POLICY "Staff read audit"
  ON public.reservas_auditoria FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'administrador'::app_role)
    OR has_role(auth.uid(), 'gestor'::app_role)
    OR has_role(auth.uid(), 'administrativo'::app_role)
  );

CREATE POLICY "Audit immutable update"
  ON public.reservas_auditoria FOR UPDATE TO authenticated USING (false);

CREATE POLICY "Audit immutable delete"
  ON public.reservas_auditoria FOR DELETE TO authenticated USING (false);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'estoque_produto'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.estoque_produto;
  END IF;
END $$;

ALTER TABLE public.estoque_produto REPLICA IDENTITY FULL;