-- H7N ROLLBACK — P1 — restaura EXECUTE direto nas 27 funções de trigger (estado pré-H7N)
-- Reverte EXATAMENTE a migration 20260904130758_h7n_p1_trigger_execute (staging ikaauvsflpmamgxmkhoq).
-- Estado anterior reconstruído a partir de restoration/homologacao-h7/97-h7n-p0p1-auditoria.md
-- e restoration/homologacao-h7/h7n-inventario/ (fn_inventory.tsv, viewdefs.sql).
-- Executar SOMENTE via guard-staging.sh + staging-psql.sh, dentro de transação.
-- NÃO executar em produção (navfzbwgwzruipouyfnk).
begin;

-- ACL anterior (fn_inventory.tsv): authenticated=X em todas; anon=X em 4; PUBLIC sem EXECUTE.
grant execute on function public.comunicacao_dlq_replay_audit_no_mutation() to authenticated;
grant execute on function public.enforce_checkin_immutability() to authenticated;
grant execute on function public.enforce_diagnostico_immutability() to authenticated;
grant execute on function public.enforce_visit_immutability() to authenticated;
grant execute on function public.fiscal_audit_trigger() to authenticated;
grant execute on function public.fiscal_audit_trigger_microorganism_profiles() to authenticated;
grant execute on function public.fn_b2b_guard_credit_approval_fields() to anon, authenticated;
grant execute on function public.fn_b2b_guard_order_items_immutable() to anon, authenticated;
grant execute on function public.fn_cq_autoria_servidor() to authenticated;
grant execute on function public.fn_cq_resultado_imutavel() to authenticated;
grant execute on function public.fn_envase_material_imutavel() to authenticated;
grant execute on function public.fn_estoque_produto_guard() to authenticated;
grant execute on function public.fn_ledger_append_only() to authenticated;
grant execute on function public.fn_regulatory_candidate_publication_guard() to authenticated;
grant execute on function public.fn_regulatory_ncm_source_guard() to authenticated;
grant execute on function public.fn_regulatory_published_candidate_guard() to authenticated;
grant execute on function public.regulatory_audit_trigger() to authenticated;
grant execute on function public.tg_b2b_block_receivable_before_approval() to authenticated;
grant execute on function public.tg_block_pofl_delete() to authenticated;
grant execute on function public.tg_commercial_price_rules_audit() to authenticated;
grant execute on function public.tg_culturas_block_delete_in_use() to authenticated;
grant execute on function public.tg_culturas_stamp_desativacao() to authenticated;
grant execute on function public.tg_monitoramento_avisos_set_dref() to authenticated;
grant execute on function public.tg_notify_payment_terms_pending() to authenticated;
grant execute on function public.tg_pcp_audit() to authenticated;
grant execute on function public.trg_catalogo_volumes_sync_mestre() to anon, authenticated;
grant execute on function public.trg_mestre_guard_preco_canonico() to anon, authenticated;
commit;
