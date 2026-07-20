-- FASE 1 — Índices para reduzir Disk I/O (leituras). Idempotente, sem CONCURRENTLY.

-- ordens_servico: filtros comuns por status + ordenação por created_at desc
CREATE INDEX IF NOT EXISTS idx_ordens_servico_status_created
  ON public.ordens_servico (status, created_at DESC);

-- ordens_servico_onfarm: listagem principal
CREATE INDEX IF NOT EXISTS idx_oso_created_at
  ON public.ordens_servico_onfarm (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oso_status_created
  ON public.ordens_servico_onfarm (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oso_cliente_id
  ON public.ordens_servico_onfarm (cliente_id);

-- clima_dados: sem índice além do PK; consultas por fazenda+data
CREATE INDEX IF NOT EXISTS idx_clima_dados_fazenda_data
  ON public.clima_dados (fazenda_id, data_hora DESC);

-- laboratorio_esteira_eventos: timeline por OS/lote
CREATE INDEX IF NOT EXISTS idx_lab_esteira_os_created
  ON public.laboratorio_esteira_eventos (os_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_esteira_lote_created
  ON public.laboratorio_esteira_eventos (lote_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_esteira_created
  ON public.laboratorio_esteira_eventos (created_at DESC);

-- notificacoes_operacionais: badge de não-lidas do usuário
CREATE INDEX IF NOT EXISTS idx_notif_op_usuario_lido_created
  ON public.notificacoes_operacionais (usuario_id, lido, created_at DESC);

-- portal_notificacoes: badge do portal do cliente
CREATE INDEX IF NOT EXISTS idx_portal_notif_cliente_lido_created
  ON public.portal_notificacoes (cliente_id, lido, created_at DESC);

-- portal_solicitacoes: listagem por cliente / status
CREATE INDEX IF NOT EXISTS idx_portal_solic_cliente_created
  ON public.portal_solicitacoes (cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_solic_status_created
  ON public.portal_solicitacoes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_portal_solic_consultor
  ON public.portal_solicitacoes (consultor_atribuido, status);

-- sync_log: filas de sync por usuário
CREATE INDEX IF NOT EXISTS idx_sync_log_user_status_created
  ON public.sync_log (user_id, status, created_at DESC);

-- alertas_notificacoes: reprocessamento por status/created_at
CREATE INDEX IF NOT EXISTS idx_alertas_notif_status_created
  ON public.alertas_notificacoes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alertas_notif_alerta
  ON public.alertas_notificacoes (alerta_id);

-- audit_senha_log: só tem PK, listagem por data
CREATE INDEX IF NOT EXISTS idx_audit_senha_log_created
  ON public.audit_senha_log (created_at DESC);

-- accounts_receivable: filtros de dashboard financeiro
CREATE INDEX IF NOT EXISTS idx_ar_status_due
  ON public.accounts_receivable (status, first_due_date);
CREATE INDEX IF NOT EXISTS idx_ar_customer_status
  ON public.accounts_receivable (customer_id, status);
CREATE INDEX IF NOT EXISTS idx_ar_created_at
  ON public.accounts_receivable (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ar_origin
  ON public.accounts_receivable (origin_type, origin_id);

-- accounts_payable: idem
CREATE INDEX IF NOT EXISTS idx_ap_status_due
  ON public.accounts_payable (status, first_due_date);
CREATE INDEX IF NOT EXISTS idx_ap_supplier_status
  ON public.accounts_payable (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_ap_created_at
  ON public.accounts_payable (created_at DESC);

-- estoque_produto: buscas por reserva/OS
CREATE INDEX IF NOT EXISTS idx_estoque_produto_status
  ON public.estoque_produto (status);
CREATE INDEX IF NOT EXISTS idx_estoque_produto_reservado_os
  ON public.estoque_produto (reservado_para_os_id) WHERE reservado_para_os_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_estoque_produto_produto_status
  ON public.estoque_produto (produto_id, status);

-- estoque_embalagens: consultas por status/validade
CREATE INDEX IF NOT EXISTS idx_estoque_emb_status_validade
  ON public.estoque_embalagens (status, validade_em);

ANALYZE public.ordens_servico;
ANALYZE public.ordens_servico_onfarm;
ANALYZE public.clima_dados;
ANALYZE public.laboratorio_esteira_eventos;
ANALYZE public.notificacoes_operacionais;
ANALYZE public.portal_notificacoes;
ANALYZE public.portal_solicitacoes;
ANALYZE public.sync_log;
ANALYZE public.alertas_notificacoes;
ANALYZE public.accounts_receivable;
ANALYZE public.accounts_payable;
ANALYZE public.estoque_produto;
ANALYZE public.estoque_embalagens;
