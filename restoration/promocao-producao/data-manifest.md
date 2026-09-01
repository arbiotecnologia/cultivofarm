# Manifesto de Dados — Staging → Produção

Contagens medidas somente-leitura no staging `ikaauvsflpmamgxmkhoq`.
227 relações com estatística; 118 com linhas > 0.

## Achado central (P1)

**Os dados transacionais do staging são sintéticos.** Das 11 linhas de `clientes`,
10 são resíduo de harness (`H6B-20260818… CLIENTE`) e 1 é `Fazenda Homologação LTDA`.
Toda a cadeia dependente (43 `partner_orders`, 42 `entregas`, 58 `accounts_receivable`,
46 `estoque_movimentacoes`, 2 `ordens_servico`, 12 `lotes`) é massa de homologação.
Conclusão: a promoção de dados deve se limitar a **dados mestres, fiscais/regulatórios e
de configuração**. Nada transacional e nenhuma trilha de auditoria deve ser copiada.

## Classe A — PROMOVER (dados mestres / regulatórios / configuração)

| Tabela | Linhas | Nota |
|---|---|---|
| `microrganismos` | 25 | Reais (`Bacillus…`, `Trichoderma…`) |
| `microorganism_fiscal_profiles` | 26 | Matriz Fiscal Mestre v1 |
| `microorganism_ncm_candidates` | 26 | Preservar status da máquina de estados (H7h) |
| `microorganism_regulatory_dossiers` | 25 | |
| `microorganism_regulatory_presentations` | 73 | |
| `microorganism_regulatory_checklist` | 300 | |
| `microorganism_technical_profiles` | 17 | |
| `microorganism_targets` | 85 | |
| `produtos` | 8 | Revisar com o negócio antes de promover |
| `product_fiscal_profiles` | 2 | |
| `formulacoes` | 23 | |
| `catalogo_alvos` / `catalogo_problemas` / `catalogo_volumes` | 72 / 25 / 64 | Catálogo técnico unificado |
| `catalog_technical_sources` | 32 | |
| `ficha_tecnica_versoes` | 60 | Confirmar versão publicada |
| `culturas` | 4 | |
| `fiscal_tax_rules` | 6 | |
| `fiscal_operation_policies` | 3 | |
| `fiscal_official_sources` | 8 | |
| `fiscal_xsd_registry` | 7 | Bundle XSD NF-e 4.00 |
| `fiscal_document_series` | 1 | **Numeração deve reiniciar em produção** |
| `comunicacao_templates` | 37 | Flags de entrega OFF |
| `comunicacao_regras` | 11 | |
| `etiqueta_templates` | 3 | |
| `financial_categories` / `payment_methods` / `bank_accounts` | 15 / 16 / 10 | Validar com o financeiro |
| `financial_governance_rules` | 4 | |
| `alertas_regras` / `alertas_sla_config` / `alertas_notificacao_config` | 13 / 5 / 2 | |
| `sla_configuracoes` / `partner_order_sla_config` | 3 / 6 | |
| `estoque_politicas` / `estoque_embalagens` | 1 / 20 | |
| `financial_settings` / `configuracoes_sistema` | 1 / 1 | Revisar campo a campo |
| `company_fiscal_settings` | 1 | **Reconfigurar em produção**; `tpAmb` decidido no gate fiscal |
| `organizations` | 1 | |
| `codigo_sequencias` | 9 | **Zerar/reiniciar em produção** |
| `fiscal_matrix_load_ledger` | 20 | Recarregar via processo oficial, não copiar |

## Classe B — NÃO PROMOVER (transacional / sintético)

`clientes` (11), `fazendas` (1), `talhoes` (3), `partner_accounts` (15),
`partner_clients`, `partner_users`, `partner_orders` (43), `partner_order_items` (41),
`partner_order_payment_terms` (43), `partner_order_payment_schedule`,
`partner_order_financial_links`, `partner_order_idempotency`, `partner_risk_scores`,
`partner_engagement_metrics`, `partner_financial_settings`, `partner_product_prices`,
`ordens_servico`, `programacao_producao`, `production_planning`,
`production_timeline_events`, `laboratorio_esteira_eventos`, `lotes`, `envase`,
`controle_qualidade`, `estoque_produto`, `estoque_movimentacoes`, `entregas`,
`entrega_conferencia_itens`, `entrega_checklist`, `entrega_termos`,
`entrega_comprovantes`, `entrega_reconciliacoes`, `accounts_receivable(+installments)`,
`receivable_payments`, `accounts_payable(+installments)`, `payable_payments`,
`registros_consultor(+arquivos)`, `visitas_checkin`, `visitas_logs`,
`visita_diagnosticos`, `comunicacao_eventos` (140), `notificacoes_operacionais` (727),
`cockpit_operacao_idempotencia`, `commercial_payment_plans` (18) e
`commercial_payment_plan_assignments` (4) — planos são massa `HML-B2B-*`,
`commercial_price_rules` (9), `commercial_condition_item_prices` (9).

## Classe C — NÃO PROMOVER (trilhas de auditoria, append-only)

`fiscal_audit_log` (1268), `financial_audit_log` (859), `partner_order_audit_logs` (331),
`clientes_audit_log` (287), `catalog_technical_audit_logs` (273),
`financial_governance_audit_log` (226), `commercial_audit_log` (147),
`comunicacao_audit_log` (140), `partner_audit_logs` (86),
`commercial_condition_audit_log` (62), `user_context_access_logs` (18),
`communication_provider_settings_audit` (3), `audit_senha_log` (1).
Produção deve iniciar com trilha própria.

## Classe D — STAGING-ONLY (excluir explicitamente)

`_f42_harness_fixtures` (14), `_fiscal_staging_marker` (1),
`_motor_b2b_pre_phase1_snapshot` (17), `estoque_movimentacoes_orfaos_backup` (4),
`fiscal_environment_marker` (1).

## Auth (18 usuários)

- **14 reais** `@arbio.com`, todos com `profiles` e `user_roles`
  (`administrador`, `gestor`, `gestor_comercial`, `financeiro`, `tecnico_agronomo`,
  `producao`, `administrativo`, `consultor_tecnico`, `aplicador`, `operador_onfarm`,
  `cliente_produtor`, `parceiro_b2b`, `parceiro_b2b_tecnico`).
  Apenas 5 possuem identidade Auth (`auth.identities`); 9 foram criados por harness.
- **4 sintéticos** `@arbio-staging.test`, sem `profiles` e sem papel → **excluir**.
- Regra P2: recriar usuários em produção por convite/e-mail real. **Não** copiar
  `auth.users` nem hashes. Papéis somente em `public.user_roles`.

## Storage

14 buckets (13 privados, `logos` público). Objetos existentes: 27 em
`consultor-arquivos` (285.628 bytes) e 2 em `fiscal-xml` (7.606 bytes).
Promover **estrutura de buckets e políticas**, nenhum objeto: os arquivos de
`consultor-arquivos` pertencem à massa de homologação e os XML são de ambiente
`tpAmb=2`. `fiscal-certificates` deve permanecer vazio até o gate do certificado A1.

## Ordem de carga sugerida (fase P3, sob autorização)

1. `organizations`, `configuracoes_sistema`, `company_fiscal_settings` (reconfigurada)
2. `culturas`, `microrganismos`, `formulacoes`, `produtos`
3. Perfis fiscais/regulatórios de microrganismo e produto
4. Catálogo técnico (`catalogo_*`, `catalog_technical_sources`, fichas)
5. Configuração fiscal (`fiscal_tax_rules`, `fiscal_operation_policies`,
   `fiscal_official_sources`, `fiscal_xsd_registry`)
6. Financeiro de configuração, SLA/alertas, comunicação (flags OFF)
7. Séries/sequências **reiniciadas**, nunca copiadas
