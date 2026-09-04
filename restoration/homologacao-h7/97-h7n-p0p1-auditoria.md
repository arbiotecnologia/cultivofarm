# H7n — Auditoria P0/P1 (somente leitura) — staging ikaauvsflpmamgxmkhoq

Estado: AUDITORIA CONCLUÍDA, NENHUMA ALTERAÇÃO APLICADA (banco, código, Edge Functions e produção intocados).
Binding restaurado do baseline c75bb87f; guard-staging.sh e check-frontend-binding.sh PASS.

## P0 — 5 views `security_definer_view`
Todas: owner=postgres, security_invoker=false, SELECT para authenticated, sem SELECT para anon.
- `vw_os_integridade_esteira`: SEM predicado de chamador; lê ~15 tabelas RLS. Consumidores: `_src_vw_esteira_laboratorio` -> `mv_esteira_laboratorio`
  (refresh por funções SECURITY DEFINER/pg_cron como postgres, que tem BYPASSRLS) e `rpc_validar_integridade_esteira` (2 overloads). Nenhum consumo direto no frontend.
  Estratégia: `ALTER VIEW ... SET (security_invoker=true)` puro — RLS das tabelas passa a valer para o chamador. Efeito colateral documentável:
  papéis sem SELECT em partner_accounts/partner_orders (gestor, producao) veem partner_nome NULL ao ler a view crua (cockpit usa a MV, inalterada).
- `vw_esteira_laboratorio` (lê `mv_esteira_laboratorio`) e `vw_fluxo_visita_tecnica` (lê `mv_fluxo_visita_tecnica`): predicado por papel/cliente já embutido.
  MVs não têm RLS nem grants para authenticated/anon. security_invoker direto quebraria a aplicação; conceder SELECT nas MVs exporia a MV via PostgREST (bypass do predicado) — REJEITADO.
  Estratégia equivalente e segura: função SECURITY DEFINER em schema NÃO exposto pela API (`private`), owner postgres, `search_path=public`, EXECUTE apenas
  para authenticated/service_role, com o MESMO predicado; a view passa a `security_invoker=true` selecionando dessa função. Nomes/colunas/contratos preservados.
- `vw_catalogo_ficha_produtos` / `vw_catalogo_ficha_microrganismos`: security_invoker puro MUDARIA a semântica (cliente_produtor não tem policy em produtos;
  para B2B, perfis técnicos não aprovados ficariam invisíveis e o `NOT EXISTS` passaria a mostrar itens pendentes). Mesma estratégia da função `private` com predicado idêntico.
Rollback: restaurar definições originais (salvas em `h7n-inventario/viewdefs.sql`) + `security_invoker=false` + DROP das funções `private`.

## P1 — inventário (catálogo do staging, 04/09/2026)
- 466 funções SECURITY DEFINER executáveis por authenticated (bate com o Advisor); 27 são funções de trigger, TODAS efetivamente usadas por triggers
  (lista em `h7n-inventario/fn_inventory.tsv`, coluna is_trigger_fn). EXECUTE só é checado no CREATE TRIGGER, não no disparo -> revogar de PUBLIC/anon/authenticated é seguro.
  4 delas também têm EXECUTE para anon: fn_b2b_guard_credit_approval_fields, fn_b2b_guard_order_items_immutable, trg_catalogo_volumes_sync_mestre, trg_mestre_guard_preco_canonico.
- 6 funções anon: as 4 triggers acima + `rpc_validar_comprovante_entrega(uuid)` e `rpc_validar_rastreio_produto(uuid)` — públicas por design (QR/validação),
  token uuid imprevisível, retorno mínimo, flags de habilitação/expiração; rastreio tem rate-limit 60/h por etiqueta; comprovante NÃO tem rate-limit em banco (P2, exigiria tabela nova).
- 81 funções não-trigger sem indício textual de guarda (heurística própria; o relatório anterior contou 83). Classificação em `h7n-inventario/noguard_usage.tsv` e `other_refs.tsv`:
  - MANTER (usadas em RLS/policies de storage/views/callers SECURITY INVOKER): has_role, get_cliente_id_for_user, get_cliente_ids_for_user, is_executivo,
    is_active_visit_participant, fn_onfarm_scope_lote, fn_regulatory_storage_can_read/write/delete, fn_catalogo_preco_canonico, fn_fiscal_company_crt, fn_microorganism_regulatory_facts.
  - REVOGAR (uso exclusivamente interno por funções SECURITY DEFINER, sem uso direto/cron/policy comprovado): _avancar_os_status, _entrega_seed_checklist, _notify_role,
    _portal_cliente_user_has_link, _validate_planning_integrity, can_checkout_technical_visit, fn_catalogo_litro_canonico, fn_catalogo_sync_mestre_preco,
    fn_conformidade_perfil_vigente, fn_cultura_em_uso, fn_entrega_cobertura_v1, fn_estoque_ctx_force, fn_fiscal_assert_debtor_recipient, fn_fiscal_emitter_pendencies,
    fn_fiscal_emitter_pendencies_row, fn_fiscal_invoice_eligibility, fn_fiscal_partner_fiscal_customer, fn_fiscal_recipient_pendencies_row, fn_fiscal_resolve_operation,
    fn_fiscal_resolve_tax_rule, fn_fiscal_scenario_coverage, fn_upsert_alerta_operacional, gerar_codigo_lote, gerar_codigo_visita, get_visit_organization_id,
    is_visit_responsible, lote_volume_envasado, partner_order_has_production, partner_order_sla_status, proximo_codigo, recalc_partner_order_production,
    refresh_partner_engagement, rpc_recalcular_separacao_entrega, rls_auto_enable (event trigger) e órfãs: auto_reject_partner_orders_no_items, fn_avancar_etapa_esteira,
    fn_cq_ultimo_resultado, fn_fiscal_emitter_status, fn_os_assert_staging_exato, fn_run_financial_inconsistency_check, get_partner_papel, rpc_b2b_check_governance_block.
  - GUARDA NECESSÁRIA (RPC chamada pelo frontend, SECURITY DEFINER, sem autorização — exposição cross-tenant/econômica a qualquer authenticated, inclusive parceiro/produtor):
    rpc_b2b_aging, rpc_b2b_aging_detalhado, rpc_b2b_carteira_kpis, rpc_b2b_executive_alerts, rpc_b2b_executive_dashboard, rpc_b2b_governance_kpis,
    rpc_b2b_partner_profitability, rpc_b2b_revenue_forecast (papéis por src/lib/permissions.ts: administrador, gestor, financeiro, gestor_comercial, administrativo);
    rpc_b2b_capacity_kpis (administrador, gestor, producao, gestor_comercial); fn_mark_financial_overdue (administrador, gestor, financeiro);
    generate_b2b_receivable_secure (administrador, gestor, financeiro; liberar quando pg_trigger_depth()>0 para tg_auto_b2b_receivable);
    rpc_message_set_status e rpc_partner_message_counters (administrador/gestor_comercial OU pedido do próprio parceiro via get_user_partner_id()).
    rpc_b2b_aging e rpc_b2b_partner_profitability são LANGUAGE sql -> converter para plpgsql com RETURN QUERY/RETURN, rollback com definição original.
  - P2 documentar: rpc_validar_integridade_esteira(text,uuid) (retorno booleano por uuid), check_*_dependencies (apenas contagens).
- Allowlist explícita de RPCs: gerar arquivo versionado com todas as funções `public` executáveis por anon/authenticated após as revogações + postcheck que falha em drift.

## Próximos passos (não iniciados)
1. Migration forward `supabase/migrations/20260930000000_h7n_views_invoker_v1.sql` + rollback `restoration/homologacao-h7/99-h7n-rollback.sql`, aplicadas SOMENTE via guard-staging.sh + staging-psql.sh.
2. Snapshots por papel (antes/depois) das 5 views e chamadas diretas negativas às funções revogadas; usuários por papel já existem no staging (user_roles).
3. Advisor antes/depois; typecheck, build, vitest fiscal, varredura de segredos; atualizar docs/auditorias/homologacao-h7-fiscal.md.
