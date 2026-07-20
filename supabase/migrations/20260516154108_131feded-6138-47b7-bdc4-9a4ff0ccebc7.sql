-- Remover a constraint que impede a exclusão do cliente devido ao log de auditoria
ALTER TABLE public.clientes_audit_log 
DROP CONSTRAINT IF EXISTS clientes_audit_log_cliente_id_fkey;

-- Garantir que a coluna possa ser nula ou mantida apenas como referência UUID
ALTER TABLE public.clientes_audit_log 
ALTER COLUMN cliente_id DROP NOT NULL;

-- Atualizar a função de verificação de dependências do cliente para incluir profiles (usuários do portal)
CREATE OR REPLACE FUNCTION public.check_cliente_dependencies(_cliente_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'fazendas',              (SELECT count(*) FROM fazendas WHERE cliente_id = _cliente_id),
    'talhoes',               (SELECT count(*) FROM talhoes t JOIN fazendas f ON f.id = t.fazenda_id WHERE f.cliente_id = _cliente_id),
    'ordens_servico',        (SELECT count(*) FROM ordens_servico WHERE cliente_id = _cliente_id),
    'ordens_servico_onfarm', (SELECT count(*) FROM ordens_servico_onfarm WHERE cliente_id = _cliente_id),
    'registros_consultor',   (SELECT count(*) FROM registros_consultor WHERE cliente_id = _cliente_id),
    'portal_solicitacoes',   (SELECT count(*) FROM portal_solicitacoes WHERE cliente_id = _cliente_id),
    'entregas',              (SELECT count(*) FROM entregas WHERE cliente_id = _cliente_id),
    'usuarios',              (SELECT count(*) FROM profiles WHERE cliente_id = _cliente_id)
  )
$$;
