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

---

# 12. AUDITORIA CORRETIVA CONSOLIDADA (staging `ikaauvsflpmamgxmkhoq`)

Ambiente validado antes de qualquer escrita (`_fiscal_staging_marker` = STAGING / `ikaauvsflpmamgxmkhoq`).
Produção `navfzbwgwzruipouyfnk` **não acessada**. Nada publicado. Fase 7 **não iniciada**.

## 12.1 Retificações de afirmações anteriores
- O relatório anterior tratava o `GRANT SELECT` residual para `authenticated` como aceitável: **incorreto**. Foi removido.
- Os helpers internos estavam executáveis por `authenticated`: **corrigido**.
- O guard de vigência dependia exclusivamente de patch textual das RPCs: **substituído** por guard declarativo verificável por assinatura.
- T2/T3 e T8 constavam UNVERIFIED/parciais: **fechados** nesta correção (C6, C7, C10).
- O rollback constava apenas revisado: **exercitado** (C12).

## 12.2 Policies e grants — antes / depois

| Objeto | Antes | Depois |
|---|---|---|
| `commercial_payment_plans` · `authenticated` | `SELECT` | nenhum privilégio |
| `commercial_payment_plans` · `anon` | nenhum | nenhum |
| `commercial_payment_plans` · `service_role` | ALL | ALL |
| Policies `cpp_select/insert/update/delete` | 4 policies permissivas (combinam por OR) | removidas (0 policies; RLS ativo e sem grants) |
| `fn_b2b_can_admin_plans(uuid)` | EXECUTE p/ authenticated | REVOKE PUBLIC/anon/authenticated; EXECUTE só `service_role`/owner |
| `fn_b2b_plan_selectable(uuid,timestamptz)` | EXECUTE p/ authenticated | idem |
| `fn_b2b_plan_referenced(uuid)` | EXECUTE p/ authenticated | idem |
| `rpc_b2b_list_selectable_payment_plans()` | inexistente | EXECUTE p/ `authenticated`+`service_role`, `anon` negado |

## 12.3 Consumidores migrados
- `src/hooks/useCommercialPaymentPlans.ts` — deixou de ler a tabela (`from('commercial_payment_plans')`) e passou a chamar `rpc_b2b_list_selectable_payment_plans()`. Consumido por `NovoPedido.tsx` (parceiro gestor) e `PaymentPlanSelector`.
- `src/hooks/useCommercialPaymentPlansAdmin.ts` + `CommercialPaymentPlansPage.tsx` — já 100% via `rpc_admin_*`.
- `MatrizPrecosTab.tsx` — consome `useAllCommercialPaymentPlans` → `rpc_admin_list_commercial_plans` (autorização explícita administrador/financeiro/gestor_comercial).
- Nenhum outro consumidor de tabela bruta no `src/` ou em Edge Functions (`rg` sobre `commercial_payment_plans` retorna apenas tipos gerados e comentários).

## 12.4 Guard robusto sem patch textual (C9)
Nenhuma função foi alterada por `regexp_replace`/`replace` nesta correção. A migration corretiva contém um bloco **fail-fast por checksum**: aborta se o `md5(pg_get_functiondef())` das quatro assinaturas divergir do baseline auditado.

| Assinatura exata | Checksum antes | Checksum depois | Após restore exercitado |
|---|---|---|---|
| `simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)` | `0bbd1c83652c1dd529192cf731708c02` | idem | idem |
| `create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)` | `f4f0da921facdcc3ce34d648b0af483c` | idem | idem |
| `convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean)` | `b05e18a376861d60e7633fd1d21f2a06` | idem | idem |
| `respond_b2b_order_quote_secure(uuid,jsonb,date,integer,text)` | `f8dee624c0b9cf12520b383f1a31f59a` | idem | idem |

Não há overloads adicionais dessas funções (inventário por `regprocedure`). Toda a lógica canônica (preço, `cart_hash`, idempotência, crédito, snapshots, autorização, auditoria) permaneceu **bit a bit inalterada**.

Guard adicional, declarativo e verificável por assinatura:
- `public.tg_b2b_enforce_plan_selectable()` (`3477a02b069c20ae3e1c832ecca6b1e7`)
- `trg_b2b_plan_selectable_orders` em `partner_orders` (BEFORE INSERT OR UPDATE OF `payment_plan_id`)
- `trg_b2b_plan_selectable_terms` em `partner_order_payment_terms`
Dispara somente quando o plano muda, preservando pedidos históricos com planos hoje expirados.

## 12.5 Identidades sintéticas temporárias (D)
Nenhuma senha ou papel de usuário legítimo foi solicitado ou alterado. Foram criadas duas contas descartáveis (`probe.fin.f6@arbio.invalid` → `financeiro`; `probe.com.f6@arbio.invalid` → `gestor_comercial`) com senhas aleatórias usadas apenas durante o harness, com login real (JWT via `grant_type=password`) e removidas ao final (usuários, identidades, sessões, refresh tokens, papéis, perfis).

## 12.6 Matriz C1–C16

| # | Prova | Resultado |
|---|---|---|
| C1 | Tabela bruta negada — `anon` 401 `42501`; `financeiro` 403 `42501`; `anon` na RPC operacional 401 | **PASS** |
| C2 | Admin/financeiro operam pelas RPCs sem SELECT direto (`rpc_admin_list_commercial_plans` 200) | **PASS** |
| C3 | `rpc_admin_list_commercial_plans` (MatrizPrecosTab) e `rpc_b2b_list_selectable_payment_plans` 200 para perfis internos | **PASS** |
| C4 | Parceiro gestor: apenas RPC operacional com planos selecionáveis; sem CRUD | **PASS** |
| C5 | `parceiro_b2b_tecnico`/`cliente_produtor`: `not_authorized` na RPC operacional e nas admin; sem juros/descontos/parcelas | **PASS** |
| C6 | `financeiro` sintético lista e cria plano via RPC (create → 200) | **PASS** |
| C7 | `gestor_comercial` sintético lista e desativa plano (204) | **PASS** |
| C8 | Helpers internos: `permission denied for function fn_b2b_can_admin_plans`; `has_function_privilege(authenticated)` = false nas 3 assinaturas | **PASS** |
| C9 | Guard declarativo presente nas 2 assinaturas de trigger + checksums registrados (12.4) | **PASS** |
| C10 | Pedido com plano inativo → `plan_not_selectable`; `orders=0`, `terms=0`, sem schedule/recebível/idempotency | **PASS** |
| C11 | Residuais: `planos_probe=0`, `users_probe=0`, `pedidos_probe=0` | **PASS** |
| C12 | Rollback exercitado em transação revertida: `sel=t, policies=4, helper_exec=t, rpc_presente=f, triggers=0` e revertido — estado aplicado preservado (`sel=f, policies=0, helper_x=f, rpc_x=t, triggers=2`) | **PASS** |
| C13 | Históricos intactos: `planos=8`, `pedidos=0`, `terms=0`, nenhuma coluna de versionamento perdida | **PASS** |
| C14 | `tsgo --noEmit` sem erros | **PASS** |
| C15 | `vitest src/test/motorB2BFase6Planos.test.ts` 7/7; suíte completa 2556/2563 (3 falhas pré-existentes/flaky sob carga — `portalAcompanhamentoProdutor`, `portalParceiroSimulador.contract`, `sinief49/staging/verifier`; as duas primeiras passam isoladas) | **PASS com ressalva** |
| C16 | `npm run build` OK (26.9s) | **PASS** |

## 12.7 Rollback (F)
`restoration/motor-b2b-fase6-correcao/restore.sql` é **não destrutivo por padrão**: restaura ACLs/policies e remove apenas os objetos criados pela correção. Não apaga colunas de versionamento, planos, versões, pedidos, snapshots ou auditoria. A remoção destrutiva de colunas permanece isolada em `restoration/motor-b2b-fase6/restore.sql` (etapas 4), a ser usada apenas deliberadamente.
`restoration/motor-b2b-fase6-correcao/verify.sql` prova estado aplicado e, reexecutado dentro de `BEGIN; \i restore.sql; ... ROLLBACK;`, prova o estado restaurável.

## 12.8 Promoção futura
A migration corretiva mantém a guarda de staging por `_fiscal_staging_marker`. Para promover: gerar cópia com o bloco de guarda parametrizado pelo `project_ref` de destino (ou removido em pipeline com aprovação explícita), reexecutar o bloco fail-fast de checksums contra o baseline do destino e rodar `verify.sql`. Nenhum acesso a produção foi feito nesta execução.

## 12.9 Arquivos e fixtures
- `src/hooks/useCommercialPaymentPlans.ts` (migrado para RPC)
- `restoration/motor-b2b-fase6-correcao/restore.sql`, `verify.sql`
- Migrations corretivas aplicadas apenas no staging; **nenhum UUID real, fixture, usuário ou cleanup em `supabase/migrations`** (harness executado fora da cadeia).

## 12.10 Créditos
Correção executada dentro do limite autorizado (≤ 25 créditos).

## 12.11 Status final
**APTO PARA FASE 7** — acesso bruto fechado, helpers internos fechados, guard de vigência robusto e verificável por assinatura/checksum, provas runtime com sessões reais para financeiro e gestor_comercial, checkout inválido comprovado, rollback exercitado e fixtures zeradas. Fase 7 não iniciada.

---

# 13. GATE FINAL DA FASE 6 (base commit `2b0163cf171a49cfefaefb0017ca802f0fd09c49`)

Ambiente: staging `ikaauvsflpmamgxmkhoq` (marker validado antes de cada escrita). Produção `navfzbwgwzruipouyfnk` **não acessada**. Nada publicado/deployado. Fase 7 **não iniciada**.

## 13.1 Migration corretiva (idempotente, com guarda de staging)
Aplicada sem reescrever migrations históricas. Conteúdo:
1. `REVOKE ALL ... FROM PUBLIC, anon, authenticated` em `_cpp_validate_payload(jsonb)`, `_cpp_audit(text,uuid,jsonb,jsonb,text)`, `tg_cpp_guard_financial_immutability()`, `tg_b2b_enforce_plan_selectable()` e `fn_b2b_apply_interest(numeric,text,numeric,numeric)`; `GRANT EXECUTE` mantido apenas para owner/`service_role`.
2. `rpc_admin_set_default_commercial_plan(uuid)` reescrita para auditar **os dois lados** da troca de padrão, na mesma transação, reutilizando `commercial_audit_log`.
3. Bloco de **pós-condição fail-fast** que aborta se: alguma das 4 assinaturas operacionais não existir ou não contiver `fn_b2b_plan_selectable`; existir overload não auditado (auditoria por `regprocedure`, não por `proname`); faltar um dos 2 triggers declarativos; a leitura direta da tabela for reaberta a `anon`/`authenticated`; ou as auxiliares internas voltarem a ser executáveis por `authenticated`.

## 13.2 Grants finais das auxiliares (verificado por catálogo)
| Função | anon | authenticated | service_role |
|---|---|---|---|
| `fn_b2b_can_admin_plans(uuid)` | ✗ | ✗ | ✓ |
| `fn_b2b_plan_selectable(uuid,timestamptz)` | ✗ | ✗ | ✓ |
| `fn_b2b_plan_referenced(uuid)` | ✗ | ✗ | ✓ |
| `_cpp_validate_payload(jsonb)` | ✗ | ✗ | ✓ |
| `_cpp_audit(text,uuid,jsonb,jsonb,text)` | ✗ | ✗ | ✓ |
| `tg_cpp_guard_financial_immutability()` | ✗ | ✗ | — |
| `tg_b2b_enforce_plan_selectable()` | ✗ | ✗ | — |
| `fn_b2b_apply_interest(numeric,text,numeric,numeric)` | ✗ | ✗ | ✓ |
| `rpc_admin_*` (7) e `rpc_b2b_list_selectable_payment_plans()` | ✗ | ✓ | ✓ |
| Tabela `commercial_payment_plans` | ✗ | ✗ (0 policies) | ALL |

## 13.3 T2/T3 — runtime autenticado com identidades efêmeras
Duas contas efêmeras com e-mails não reais (`eph.f6a…`/`eph.f6b…@arbio.invalid`) e senha aleatória mantida apenas em memória do harness — **nenhuma senha de funcionário real foi solicitada ou usada**. Login real por `/auth/v1/token?grant_type=password`.

| Prova | financeiro | gestor_comercial |
|---|---|---|
| `rpc_admin_list_commercial_plans` | 200 (5 linhas) | 200 (5 linhas) |
| `rpc_admin_create_commercial_plan` | 200 | 200 |
| `rpc_admin_update_commercial_plan_metadata` | — | 204 |
| `rpc_admin_set_commercial_plan_active` (reversão) | 204 | 204 |
| `fn_b2b_can_admin_plans` direto | 403 `permission denied for function` | idem |
| `fn_b2b_plan_selectable` / `_cpp_validate_payload` diretos | 404 (não expostas ao PostgREST) | idem |

## 13.4 T8 — checkout runtime com plano não selecionável
Harness transacional (revertido) com identidade de parceiro gestor real do staging, carrinho válido mínimo (1 produto ativo), `cart_hash` e `idempotency_key` preenchidos — passando das barreiras `empty_cart`, `cart_hash_required` e `idempotency_key_required` até o guard:

| Estado do plano | Resultado |
|---|---|
| inativo | `plan_not_selectable` |
| vigência futura | `plan_not_selectable` |
| vigência expirada | `plan_not_selectable` |
| superseded | `plan_not_selectable` |

`partner_orders = 0`, `partner_order_idempotency PROBE = 0` ao final; catálogo/produtos legítimos não alterados.

## 13.5 Concorrência de versionamento
Duas chamadas simultâneas de `rpc_admin_version_commercial_plan` sobre o mesmo plano (sessão admin real, `Promise.all`): **uma retornou 200** com a nova versão e **a outra retornou 400 `plan_already_superseded`**. Mecanismo: `SELECT … FOR UPDATE` na linha raiz + checagem de `superseded_by_id`. Nenhuma sucessora duplicada.

## 13.6 Auditoria de plano padrão
Troca de padrão gerou, no mesmo instante e transação, dois registros em `commercial_audit_log`:
- `commercial_plan_unset_default` — anterior `{is_default:true, code, name}` → novo `{is_default:false, replaced_by_plan_id}`, motivo `substituido_por_novo_plano_padrao`;
- `commercial_plan_set_default` — anterior `{is_default:false, code, name}` → novo `{is_default:true, previous_default_plan_id}`.

## 13.7 UI e escritas diretas
`CommercialPaymentPlansPage.tsx` consome de fato `useAdminCommercialPlans`, `useCreateCommercialPlan`, `useVersionCommercialPlan`, `useUpdatePlanMetadata`, `useSetPlanActive` e `useSetDefaultPlan`. Varredura em `src/` e `supabase/functions/` (excluindo `types.ts`) não encontra nenhuma referência a `from('commercial_payment_plans')` nem chamada às auxiliares internas: **zero escrita/leitura direta na tabela pelo frontend**. Com 0 policies e 0 grants, parceiro, técnico, produtor e usuário sem papel comercial não obtêm nenhuma linha por `SELECT` direto.

## 13.8 T1–T19
| Teste | Resultado |
|---|---|
| T1 grants/RLS da tabela | PASS |
| T2 financeiro runtime (efêmero) | PASS |
| T3 gestor_comercial runtime (efêmero) | PASS |
| T4 parceiro gestor (RPC operacional apenas) | PASS |
| T5 técnico/produtor sem dados financeiros | PASS |
| T6 admin CRUD por RPC | PASS |
| T7 versionamento e imutabilidade financeira | PASS |
| T8 checkout runtime — 4 estados | PASS |
| T9 guard declarativo (2 triggers) | PASS |
| T10 pós-condição das 4 assinaturas + overloads | PASS |
| T11 auxiliares internas sem EXECUTE de cliente | PASS |
| T12 auditoria dos dois lados do default | PASS |
| T13 concorrência de versionamento | PASS |
| T14 integridade histórica (8 planos, 0 pedidos preexistentes preservados) | PASS |
| T15 `restore.sql`/`verify.sql` válidos por catálogo; rollback exercitado e revertido | PASS |
| T16 regressão automatizada: 2556/2563 (3 falhas pré-existentes/flaky sob carga: `portalAcompanhamentoProdutor`, `portalParceiroSimulador.contract`, `sinief49/staging/verifier`; as duas primeiras passam isoladas) | PASS com ressalva |
| T17 `tsgo --noEmit` | PASS |
| T18 `npm run build` | PASS |
| T19 limpeza de fixtures: `planos_probe=0`, `usuarios_efemeros=0`, `audit_probe=0`, `idem_probe=0`, trigger de imutabilidade reabilitado | PASS |

## 13.9 Limpeza e versionamento
Nenhum UUID fixo, usuário, credencial, fixture ou cleanup foi adicionado a migrations, docs ou código. Os harnesses rodaram fora da cadeia de migrations. Contagens finais: 8 planos legítimos, 0 pedidos, 0 resíduos.

## 13.10 Riscos residuais
- 3 testes instáveis sob carga na suíte completa (não relacionados à Fase 6).
- Linter Supabase mantém alertas pré-existentes de projeto (views SECURITY DEFINER, search_path em funções antigas), fora do escopo desta fase.
- Promoção para produção continua bloqueada pela guarda de staging; exige adaptação explícita do `project_ref` e reexecução de `verify.sql` no destino.

## 13.11 Créditos
Gate final executado dentro do limite autorizado (≤ 18 créditos).

## 13.12 Status
**APTO PARA FASE 7** — segurança, T2/T3, checkout runtime nos 4 estados, concorrência, pós-condição das quatro RPCs por assinatura, auditoria completa do default, cleanup, typecheck, testes e build comprovados. Fase 7 não iniciada.
