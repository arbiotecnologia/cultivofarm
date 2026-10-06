# Limites estruturados e isolamento do back-office — 2026-10-06

Projeto: `swzpzcwiasxmjutrmvkm`. Base: commit `49623c5e`.
Migração: `supabase/migrations/20261006203913_86ba5af8-2a95-44e2-9e0b-8b1c8558183c.sql` (aplicada).

## A. Definições de limite criadas (sem valores)
Todas `value_type=integer`, vínculo `required=false`, nenhum valor em rascunho/versão.

| key | Feature | Fonte de medição |
|---|---|---|
| ordens_producao_mes | ordens_producao | `ordens_servico` (organization_id, created_at) |
| lotes_mes | lotes_qualidade | `lotes` (organization_id, created_at) |
| envases_mes | envase | `envase` (organization_id, created_at) |
| contas_receber_mes | contas_receber | `accounts_receivable` (organization_id, created_at) |
| contas_pagar_mes | contas_pagar | `accounts_payable` (organization_id, created_at) |
| documentos_fiscais_mes | emissao_nfe_nfse | `fiscal_invoices` (organization_id, created_at) |

Observação: são definições de medidor. Não existe ainda aplicação (enforcement) de limite em runtime.

## Features sem medidor confiável
- estoque_embalagens, recomendacoes_alertas, fichas_tecnicas, pedidos_b2b, simulacoes, envios_automaticos: tabelas-fonte sem `organization_id` determinístico (`estoque_embalagens`, `alertas_agronomicos`, `ficha_tecnica_versoes`, `partner_orders`, `partner_simulations`, `comunicacao_outbox`).
- catalogo_precos, fluxo_caixa, paineis_executivos, relatorios_operacionais: consultas/derivados, sem entidade contável própria.
- visitas_tecnicas: tabela-fonte não comprovada com tenant determinístico nesta auditoria.

## B. Isolamento das simulações
Gate central `platform_private.assert_b2b_partner_scope(_uid, _partner)` (SECURITY DEFINER, search_path fixo, sem EXECUTE para PUBLIC/anon/authenticated), reutilizando `platform_private.b2b_actor_scope`:
- exige `_uid = auth.uid()`; parceiro ativo e `deleted_at IS NULL`;
- Platform Superadmin: qualquer parceiro válido;
- técnico B2B: negado; perfil/empresa inativos: negado;
- administrador/financeiro/gestor_comercial: somente `organizations.partner_account_id` da própria empresa;
- parceiro_b2b: `partner_users` único, igual ao parceiro da empresa.

Aplicado em: `rpc_resolve_commercial_prices` (parceiro ignora partner_id do cliente), `rpc_cc_simulate_price` (escopo produtor/cliente negado), `simulate_b2b_payment_plan_secure`, `create_partner_order_secure`, `convert_partner_simulation_to_order_secure`. Rotinas internas de preço continuam sem EXECUTE para authenticated (verificado: 0).

## RLS / grants
- `saas_limit_definitions` e `saas_feature_limit_definitions`: leitura apenas Platform Superadmin (policies existentes); escrita direta revogada de anon/authenticated (cadastro só por migração). Não há tela de CRUD do catálogo de limites.

## Provas (transação com rollback, produção)
1 Superadmin simula parceiro válido: OK · 2/6 admin com partner_id forjado: negado (`forbidden_partner`) · 3 admin sem parceiro: negado (`buyer_required`) · simulação de plano de pagamento pelo admin: negado · 4 parceiro incoerente: negado · 5 inativo, técnico, parceiro excluído, anon: negados · 7 6 definições, 0 obrigatórias, 0 versões com limites · 9 assinaturas/publicações inalteradas.

## Validações
Suíte completa 5.535 passed / 4 skipped (379 arquivos), typecheck, lint focado, build e scanner de segredos: PASS. Advisor: 466 achados preexistentes, nenhum novo.

## Estado final
1 DRAFT, 0 PUBLISHED, 5 assinaturas sem versão, 0 overrides, pagamentos OFF.

## Rollback
Forward-fix preferível. Reversão: desativar as 6 definições (`active=false`) e recriar as funções a partir das migrações anteriores (gate injetado logo após a checagem `auth_required`).

## Riscos
- Nenhuma empresa tem `partner_account_id`: equipe interna de tenant não simula nada até vínculo explícito (fail-closed intencional).
- Prova comercial positiva (parceiro coerente com preço) NÃO executada.
- Limites ainda não são aplicados em runtime.

## GO/NO-GO
- Isolamento das simulações: GO.
- Catálogo de limites (definições): GO.
- Aplicação de limites em runtime e publicação comercial: NO-GO.
