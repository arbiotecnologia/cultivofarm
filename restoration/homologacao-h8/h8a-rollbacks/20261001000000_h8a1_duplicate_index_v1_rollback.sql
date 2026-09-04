-- H8-A1 ROLLBACK — recria, com a definição original exata, os 32 índices duplicados
-- removidos pela migration 20261001000000_h8a1_duplicate_index_v1.
-- Não remove a tabela de auditoria private.h8a_index_audit (registro histórico).
-- Uso somente no staging ikaauvsflpmamgxmkhoq.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS fi_idempotency_uq ON public.fiscal_invoices USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_alertas_notif_alerta ON public.alertas_notificacoes USING btree (alerta_id);
CREATE INDEX IF NOT EXISTS idx_api_due ON public.accounts_payable_installments USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_api_status ON public.accounts_payable_installments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_ari_due ON public.accounts_receivable_installments USING btree (due_date);
CREATE INDEX IF NOT EXISTS idx_ari_status ON public.accounts_receivable_installments USING btree (status);
CREATE INDEX IF NOT EXISTS idx_catalog_sources_entity ON public.catalog_technical_sources USING btree (entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_checkin_data ON public.visitas_checkin USING btree (data_hora_checkin DESC);
CREATE INDEX IF NOT EXISTS idx_checkin_solicitacao ON public.visitas_checkin USING btree (solicitacao_id);
CREATE INDEX IF NOT EXISTS idx_entregas_ordem_servico_id ON public.entregas USING btree (ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_entregas_ordem_servico_onfarm_id ON public.entregas USING btree (ordem_servico_onfarm_id);
CREATE INDEX IF NOT EXISTS idx_entregas_os ON public.entregas USING btree (ordem_servico_id);
CREATE INDEX IF NOT EXISTS idx_entregas_os_onfarm_id ON public.entregas USING btree (ordem_servico_onfarm_id);
CREATE INDEX IF NOT EXISTS idx_entregas_oso ON public.entregas USING btree (ordem_servico_onfarm_id);
CREATE INDEX IF NOT EXISTS idx_fd_owner ON public.financial_documents USING btree (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_fin_docs_owner ON public.financial_documents USING btree (owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_notif_op_usuario ON public.notificacoes_operacionais USING btree (usuario_id, lido, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_partner_orders_payment_status ON public.partner_orders USING btree (payment_condition_status, financial_approval_status);
CREATE INDEX IF NOT EXISTS idx_partner_users_user ON public.partner_users USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_portal_solicitacoes_consultor_status ON public.portal_solicitacoes USING btree (consultor_atribuido, status);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_envase_id ON public.produto_etiquetas USING btree (envase_id);
CREATE INDEX IF NOT EXISTS idx_produto_etiquetas_lote_id ON public.produto_etiquetas USING btree (lote_id);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_consultor_status ON public.registros_consultor USING btree (consultor_responsavel, status);
CREATE INDEX IF NOT EXISTS idx_registros_consultor_recomendacoes_registro_id ON public.registros_consultor_recomendacoes USING btree (registro_consultor_id);
CREATE INDEX IF NOT EXISTS idx_visita_diagnosticos_registro ON public.visita_diagnosticos USING btree (registro_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitas_checkin_client_uuid ON public.visitas_checkin USING btree (client_uuid) WHERE (client_uuid IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_visitas_checkin_registro_consultor_id ON public.visitas_checkin USING btree (registro_consultor_id);
CREATE INDEX IF NOT EXISTS idx_visitas_logs_registro ON public.visitas_logs USING btree (registro_consultor_id);
CREATE INDEX IF NOT EXISTS produto_etiquetas_trace_idx ON public.produto_etiquetas USING btree (trace_token);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_log_success ON public.recurring_generation_log USING btree (template_id, reference_date) WHERE (status = 'SUCCESS'::text);
CREATE UNIQUE INDEX IF NOT EXISTS ux_lotes_programacao_id ON public.lotes USING btree (programacao_id) WHERE (programacao_id IS NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS visitas_checkin_client_uuid_uniq ON public.visitas_checkin USING btree (client_uuid) WHERE (client_uuid IS NOT NULL);

COMMIT;
