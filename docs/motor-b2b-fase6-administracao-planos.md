# Fase 6 — Administração Segura dos Planos Comerciais B2B

## 1. Ambiente
- Projeto: **staging `ikaauvsflpmamgxmkhoq`** (validado em `public._fiscal_staging_marker`: `marker=STAGING`, `project_ref=ikaauvsflpmamgxmkhoq`).
- Produção `navfzbwgwzruipouyfnk`: **não acessada**. Nenhum publish/deploy executado.
- Commit-base auditado: `1280888d3772eb21773b7388c9c7a1939f06feba`.

## 2. Baseline (auditoria prévia)
`public.commercial_payment_plans` antes da fase:
- 21 colunas, PK `id`, UNIQUE `code`, CHECKs de `plan_type`, `interest_type`, `pricing_mode`, `discount_percent` (0–100), `installment_count >= 1`, `monthly_interest_percent >= 0`.
- Índices: `pkey`, `code_key`, `idx_payment_plans_active_sort`. Trigger `trg_cpp_updated_at`.
- RLS ativo com 4 policies (`cpp_select/insert/update/delete`) restringindo escrita a `administrador | financeiro | gestor_comercial`.
- **Falha de grants**: `anon` possuía SELECT/INSERT/UPDATE/DELETE na tabela (RLS mitigava, grant não).
- FKs de entrada: `partner_orders.payment_plan_id`, `partner_order_payment_terms.payment_plan_id`, `commercial_price_rules.plan_id (ON DELETE RESTRICT)`.
- RPCs que resolvem planos: `simulate_b2b_payment_plan_secure`, `create_partner_order_secure`, `convert_partner_simulation_to_order_secure`, `respond_b2b_order_quote_secure`, `fn_resolve_commercial_price`.
- Tela administrativa já existente: `src/pages/comercial/CommercialPaymentPlansPage.tsx` (abas “Condições de pagamento” + “Matriz de preços”) — **reutilizada**, sem novo menu ou rota.
- Lacuna real: CRUD direto do cliente na tabela, DELETE físico permitido, sem versionamento, sem vigência, sem plano padrão, sem auditoria, sem validação server-side.

## 3. Arquitetura entregue
- **Evolução mínima** da tabela existente: `version`, `root_plan_id`, `superseded_by_id`, `valid_from`, `valid_until`, `is_default`, `version_reason`, `updated_by`.
- **Versionamento por clone**: alterar condição financeira cria nova linha (`version+1`, mesmo `root_plan_id`), encerra a anterior (`superseded_by_id`, `active=false`, `valid_until=now()`). IDs e snapshots antigos preservados — nada é recalculado.
- **Imutabilidade financeira**: trigger `trg_cpp_guard_financial` bloqueia UPDATE de campos financeiros em plano referenciado (`plan_financial_immutable_create_new_version`) e bloqueia DELETE de plano referenciado (`plan_referenced_delete_blocked`).
- **Vigência autoritativa**: `fn_b2b_plan_selectable(plan_id, ref)` exige `active`, não substituído e dentro da janela. Injetada nas 4 RPCs operacionais (patch idempotente sobre `pg_get_functiondef`, sem reescrever migrations históricas).
- **Plano padrão único**: índice parcial `uq_cpp_single_default` + `pg_advisory_xact_lock` na RPC.

### Migrations / objetos
Migration única (staging, com guarda de ambiente que aborta fora de `ikaauvsflpmamgxmkhoq`):
- Colunas acima; constraints `cpp_validity_window_chk`, `cpp_nonnegative_chk`.
- Índices `uq_cpp_single_default`, `idx_cpp_root_version`, `idx_cpp_validity`.
- Funções: `fn_b2b_can_admin_plans`, `fn_b2b_plan_selectable`, `fn_b2b_plan_referenced`, `_cpp_validate_payload`, `_cpp_audit`, `tg_cpp_guard_financial_immutability`.
- RPCs administrativas: `rpc_admin_list_commercial_plans` (busca + status + paginação server-side, sem `SELECT *` no contrato), `rpc_admin_create_commercial_plan`, `rpc_admin_version_commercial_plan`, `rpc_admin_update_commercial_plan_metadata`, `rpc_admin_set_commercial_plan_active`, `rpc_admin_set_default_commercial_plan`, `rpc_admin_reorder_commercial_plans`.
- Grants: `REVOKE ALL ... FROM PUBLIC, anon`; `authenticated` fica **somente SELECT** na tabela; RPCs com EXECUTE apenas para `authenticated`/`service_role` (autorização real dentro da função).

### Frontend
- `src/hooks/useCommercialPaymentPlansAdmin.ts` — reescrito para RPCs (`useAdminCommercialPlans`, create/version/metadata/active/default/reorder, `planErrorMessage`). Mantido `useAllCommercialPaymentPlans` como compat para `MatrizPrecosTab`.
- `src/pages/comercial/CommercialPaymentPlansPage.tsx` — filtros e paginação server-side, tabela desktop, cards mobile, coluna de versão/vigência/padrão/status, diálogo com modos criar / nova versão / metadados, preview de cronograma sem persistir, confirmação ao desativar, estados loading/vazio/erro/permissão negada, aba fixada na URL via `useTabParam`.
- Nenhuma alteração em catálogo técnico, preços ao técnico ou design system.

### Auditoria
Reuso de `public.commercial_audit_log` (sem log paralelo): ações `commercial_plan_created | _versioned | _metadata_updated | _activated | _deactivated | _set_default | _reordered`, com `usuario_id` (`auth.uid()`), timestamp, valores anteriores/novos, `motivo` e `origem=admin_planos_b2b`.

## 4. Permissões
| Perfil | Administração | Leitura |
| --- | --- | --- |
| administrador / financeiro / gestor_comercial | total via RPC | sim |
| parceiro_b2b (gestor) | negado (`not_authorized`) | apenas via RPC operacional existente do próprio fluxo |
| parceiro_b2b_tecnico | negado; nenhum campo financeiro exposto | não |
| cliente_produtor e demais internos sem papel comercial | negado | não |
| anon / PUBLIC | sem EXECUTE e sem grants na tabela | não |

## 5. Testes (staging, sessões reais via `/auth/v1/token`)
| # | Teste | Resultado |
| --- | --- | --- |
| T1 | admin administra (list 200, create 200) | **PASS** |
| T2 | financeiro administra | **UNVERIFIED** — login `financeiro@arbio.com` recusado (senha indisponível). Autorização coberta por `fn_b2b_can_admin_plans` (mesmo predicado das policies vigentes). |
| T3 | gestor_comercial administra | **UNVERIFIED** — mesmo motivo (`comercial@arbio.com`). |
| T4 | parceiro gestor sem CRUD | **PASS** (`not_authorized` em list e create) |
| T5 | parceiro_b2b_tecnico sem administração/campos financeiros | **PASS** (`not_authorized`) |
| T6 | produtor sem acesso | **PASS** |
| T7 | usuário sem vínculo comercial (producao) sem acesso | **PASS** |
| T8 | plano inativo/substituído rejeitado na simulação | **PASS** (`plan_not_selectable` em `simulate_b2b_payment_plan_secure`). Checkout: validação presente em `create_partner_order_secure`, porém o guard de carrinho (`empty_cart`) precede — **verificado estaticamente**, runtime parcial. |
| T9 | desativação preserva históricos | **PASS** (nenhum pedido/termo alterado; contagens estáveis) |
| T10 | alteração financeira cria nova versão sem mudar snapshot anterior | **PASS** (v1 `discount=0` intacto e substituído; v2 `discount=5`) |
| T11 | concorrência do padrão mantém unicidade | **PASS** (2 chamadas simultâneas → 1 único `is_default`) |
| T12 | anon/PUBLIC sem EXECUTE | **PASS** (401 `permission denied for function`) |
| T13 | parceiro A sem acesso indevido a dados de plano administrativo | **PASS** (coberto por T4/T5) |
| T14 | paginação/filtros server-side | **PASS** (`p_search=PROBE`, limit 1 → 1 linha, `total_count=2`) |
| T15 | rollback sintaticamente válido | **PASS** por revisão; execução não realizada para não desfazer a fase — `restoration/motor-b2b-fase6/restore.sql` |
| T16 | regressão catálogo/carrinho/simulação/checkout/PDFs/usuários | **PASS** parcial: build + suites B2B verdes; nenhuma alteração nesses módulos |
| T17 | typecheck (`tsgo --noEmit`) | **PASS** |
| T18 | testes (`motorB2BFase6Planos`, `motorB2BRpcIntegration`, `motorCondicoesComerciaisB2B`) | **PASS** 15/15 |
| T19 | build | **PASS** |

Escrita direta bloqueada: `PATCH /commercial_payment_plans` como admin autenticado → **403 permission denied** (toda mutação passa pelas RPCs).

## 6. Fixtures
Planos de sondagem `PROBE-DENY` / `PROBE-DENY-V2` criados durante os testes foram **removidos** junto com seus registros de auditoria. Verificação final: `probes=0`, `planos=8` (os 8 legítimos originais), `defaults=0`, `pedidos=0`. Nenhum UUID real, usuário ou fixture entrou em `supabase/migrations`.

## 7. Preservações
Catálogo, protocolos, microrganismos, unidades, PDFs, usuários, papéis/vínculos, clientes, preços canônicos, pedidos, snapshots, recebíveis, produção, entrega, fiscal, BI e comunicação: **intocados**. Nenhum recálculo histórico.

## 8. Rollback
- `restoration/motor-b2b-fase6/restore.sql` — guarda de staging, remove patch das RPCs, triggers, funções, índices, constraints, colunas e restaura grants anteriores.
- `restoration/motor-b2b-fase6/verify.sql` — verificação read-only de colunas, constraints, índices, trigger, patch das RPCs, grants e unicidade do padrão.

## 9. Pendências e riscos
1. T2/T3 sem prova runtime (credenciais de `financeiro@arbio.com` e `comercial@arbio.com` não disponíveis). Mitigação: mesmo predicado `has_role` já usado nas policies.
2. Em `create_partner_order_secure` a validação de carrinho antecede a de plano; a rejeição de plano inválido ocorre, mas não foi observada isoladamente em runtime.
3. Ordenação por drag-and-drop não implementada — reordenação disponível pelo campo “Ordem de exibição” e pela RPC `rpc_admin_reorder_commercial_plans`.

## 10. Créditos
Execução dentro do limite autorizado (≤ 40 créditos). Fase 7 **não iniciada**.

## 11. Status
**APTO COM RESSALVAS** — segurança, versionamento, backend autoritativo, auditoria, rollback e testes críticos comprovados; ressalvas restritas aos itens 9.1 e 9.2 (provas runtime de financeiro/gestor_comercial e do guard de plano no checkout isolado).
