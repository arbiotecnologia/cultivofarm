-- H7N ROLLBACK — P1 — restaura EXECUTE direto nos 42 helpers internos (estado pré-H7N)
-- Reverte EXATAMENTE a migration 20260904131239_h7n_p1_internal_helpers (staging ikaauvsflpmamgxmkhoq).
-- Estado anterior reconstruído a partir de restoration/homologacao-h7/97-h7n-p0p1-auditoria.md
-- e restoration/homologacao-h7/h7n-inventario/ (fn_inventory.tsv, viewdefs.sql).
-- Executar SOMENTE via guard-staging.sh + staging-psql.sh, dentro de transação.
-- NÃO executar em produção (navfzbwgwzruipouyfnk).
begin;

-- ACL anterior (fn_inventory.tsv): authenticated=X em todos os 42; nenhum com anon; PUBLIC sem EXECUTE.
-- fn_fiscal_invoice_eligibility(text,uuid,uuid) NÃO foi tocada pela forward (já era interna) e não é restaurada.
grant execute on function public._avancar_os_status(p_origem text, p_os_id uuid, p_alvo text) to authenticated;
grant execute on function public._entrega_seed_checklist(_entrega_id uuid) to authenticated;
grant execute on function public._notify_role(p_role app_role, p_tipo text, p_titulo text, p_mensagem text, p_link text) to authenticated;
grant execute on function public._portal_cliente_user_has_link(p_user uuid, p_cliente uuid) to authenticated;
grant execute on function public._validate_planning_integrity(p_partner_order_id uuid) to authenticated;
grant execute on function public.auto_reject_partner_orders_no_items(p_horas integer) to authenticated;
grant execute on function public.can_checkout_technical_visit(p_user_id uuid, p_registro_id uuid) to authenticated;
grant execute on function public.fn_avancar_etapa_esteira(p_origem text, p_os_id uuid, p_programacao_id uuid, p_etapa_destino text, p_usuario_id uuid) to authenticated;
grant execute on function public.fn_catalogo_litro_canonico(p_produto_id uuid, p_microrganismo_id uuid, OUT litro numeric, OUT tiers integer) to authenticated;
grant execute on function public.fn_catalogo_sync_mestre_preco(p_produto_id uuid, p_microrganismo_id uuid) to authenticated;
grant execute on function public.fn_conformidade_perfil_vigente(p_produto_id uuid, p_categoria text) to authenticated;
grant execute on function public.fn_cq_ultimo_resultado(p_lote_id uuid) to authenticated;
grant execute on function public.fn_cultura_em_uso(_cultura_id uuid) to authenticated;
grant execute on function public.fn_entrega_cobertura_v1(p_entrega_id uuid) to authenticated;
grant execute on function public.fn_estoque_ctx_force(p_ctx jsonb) to authenticated;
grant execute on function public.fn_fiscal_assert_debtor_recipient(_invoice_id uuid) to authenticated;
grant execute on function public.fn_fiscal_emitter_pendencies(_id uuid) to authenticated;
grant execute on function public.fn_fiscal_emitter_pendencies_row(r company_fiscal_settings) to authenticated;
grant execute on function public.fn_fiscal_emitter_status(_id uuid) to authenticated;
grant execute on function public.fn_fiscal_invoice_eligibility(_source_type text, _source_id uuid) to authenticated;
grant execute on function public.fn_fiscal_partner_fiscal_customer(_partner_id uuid) to authenticated;
grant execute on function public.fn_fiscal_recipient_pendencies_row(r customer_fiscal_profiles) to authenticated;
grant execute on function public.fn_fiscal_resolve_operation(_direction text, _origin_uf text, _destination_uf text, _crt text, _final_consumer boolean, _taxpayer_indicator text, _ncm text, _product_category text, _sales_channel text, _ref_date date) to authenticated;
grant execute on function public.fn_fiscal_resolve_tax_rule(_tax_kind text, _crt text, _origin_uf text, _destination_uf text, _ncm text, _product_category text, _final_consumer boolean, _taxpayer_indicator text, _ref_date date) to authenticated;
grant execute on function public.fn_fiscal_scenario_coverage() to authenticated;
grant execute on function public.fn_os_assert_staging_exato() to authenticated;
grant execute on function public.fn_run_financial_inconsistency_check() to authenticated;
grant execute on function public.fn_upsert_alerta_operacional(p_tipo text, p_origem text, p_titulo text, p_descricao text, p_gravidade text, p_referencia_tabela text, p_referencia_id uuid, p_cliente_id uuid, p_fazenda_id uuid, p_talhao_id uuid, p_consultor_id uuid, p_os_id uuid, p_registro_consultor_id uuid, p_solicitacao_id uuid, p_lote_id uuid, p_entrega_id uuid, p_proxima_acao text, p_metadata jsonb) to authenticated;
grant execute on function public.gerar_codigo_lote(_ano integer) to authenticated;
grant execute on function public.gerar_codigo_visita(_ano integer) to authenticated;
grant execute on function public.get_partner_papel(_user_id uuid) to authenticated;
grant execute on function public.get_visit_organization_id(p_registro_id uuid) to authenticated;
grant execute on function public.is_visit_responsible(p_user_id uuid, p_registro_id uuid) to authenticated;
grant execute on function public.lote_volume_envasado(_lote_id uuid) to authenticated;
grant execute on function public.partner_order_has_production(_order_id uuid) to authenticated;
grant execute on function public.partner_order_sla_status(p_order_id uuid) to authenticated;
grant execute on function public.proximo_codigo(_prefixo text, _tabela text) to authenticated;
grant execute on function public.recalc_partner_order_production(p_partner_order_id uuid) to authenticated;
grant execute on function public.refresh_partner_engagement(p_partner_id uuid) to authenticated;
grant execute on function public.rls_auto_enable() to authenticated;
grant execute on function public.rpc_b2b_check_governance_block(p_partner_id uuid, p_acao text) to authenticated;
grant execute on function public.rpc_recalcular_separacao_entrega(p_entrega_id uuid) to authenticated;
commit;
