
ALTER TABLE public.fazendas ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.talhoes ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT true;

DROP POLICY IF EXISTS "Admins can delete talhoes" ON public.talhoes;
CREATE POLICY "Admins can delete talhoes"
  ON public.talhoes FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'administrador'::app_role));

CREATE OR REPLACE FUNCTION public.check_cliente_dependencies(_cliente_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'fazendas',              (SELECT count(*) FROM fazendas WHERE cliente_id = _cliente_id),
    'talhoes',               (SELECT count(*) FROM talhoes t JOIN fazendas f ON f.id = t.fazenda_id WHERE f.cliente_id = _cliente_id),
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE cliente_id = _cliente_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE cliente_id = _cliente_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE cliente_id = _cliente_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE cliente_id = _cliente_id),
    'entregas',              (SELECT count(*) FROM entregas WHERE cliente_id = _cliente_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.check_fazenda_dependencies(_fazenda_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'talhoes',               (SELECT count(*) FROM talhoes WHERE fazenda_id = _fazenda_id),
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE fazenda_id = _fazenda_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE fazenda_id = _fazenda_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE fazenda_id = _fazenda_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE fazenda_id = _fazenda_id),
    'alertas_agronomicos',   (SELECT count(*) FROM alertas_agronomicos WHERE fazenda_id = _fazenda_id),
    'clima_dados',           (SELECT count(*) FROM clima_dados WHERE fazenda_id = _fazenda_id)
  )
$$;

CREATE OR REPLACE FUNCTION public.check_talhao_dependencies(_talhao_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE talhao_id = _talhao_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE talhao_id = _talhao_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE talhao_id = _talhao_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE talhao_id = _talhao_id),
    'alertas_agronomicos',   (SELECT count(*) FROM alertas_agronomicos WHERE talhao_id = _talhao_id)
  )
$$;
