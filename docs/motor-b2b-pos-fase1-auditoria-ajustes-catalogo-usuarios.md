# Checkpoint de auditoria e correção pós-Fase 1 — Motor B2B

**Ambiente:** exclusivamente staging `ikaauvsflpmamgxmkhoq` (marker `_fiscal_staging_marker` validado antes de qualquer escrita).
**Produção `navfzbwgwzruipouyfnk`:** não conectada, não consultada, não alterada. Nenhum deploy/publicação executado.
**Baseline:** `37b4da99568fddca19b50e916603ea365abae03f..2c5da4ab2afa1fccc4aa66df39df4c799dbaf24f`.
**Escopo:** auditoria + correção. Fase 2 **não** iniciada.

---

## 1. Baseline (37b4da9..HEAD)

42 arquivos alterados. Frontend: unidades/formatação canônicas (`src/lib/catalogo/unidades.ts`, `formatUnidades.ts`), `useTabParam`, identidade do usuário no portal B2B, PDFs. Backend: 4 migrations.

| Migration | Conteúdo | Veredito inicial |
|---|---|---|
| `20260729112758` | `handle_new_user` sem atribuição de papel | OK |
| `20260729193425` | `can_user_access_cliente`, políticas On-Farm/Aplicador, política gestor comercial, **INSERTs de vínculo com UUIDs fixos** | ACHADO A3 + A4 |
| `20260729201118` | `get_partner_catalog_tecnico_secure` com valores financeiros | ACHADO A2 |
| `20260729202644` | `get_partner_catalog_secure` com fórmula de preço duplicada | ACHADO A1 |

Auto cadastro (verificado em `pg_get_functiondef`): `handle_new_user` cria apenas `profiles`; **nenhum papel** é concedido → usuário fica pendente (`/acesso-pendente`). Checksum `6f3c5072b776329ac5ff9f8bbf6fd7b2`.

---

## 2. Achados e correções aplicadas

### A1 — Catálogo B2B com fonte de preço não autoritativa (CRÍTICO, corrigido)
`get_partner_catalog_secure(uuid)` recalculava preço a partir de `partner_accounts.desconto_padrao` e `partner_product_prices` (legados), com fórmula duplicada e `COALESCE(...,0)` — produzindo **fallback zero**.

Correção: função reescrita mantendo a assinatura, consumindo **somente** `fn_resolve_commercial_price` (motor canônico da Fase 1, `docs/commercial-pricing-precedence.md`). Sem preço resolvido ou com `quote_required` → colunas de valor `NULL` e `unidade_preco_principal='sob_consulta'` (nunca zero). Bloqueio explícito para `parceiro_b2b_tecnico`. `desconto_percentual` passa a ser derivado do resolvedor (`1 - final/base`), não do legado.

### A2 — Vazamento financeiro ao técnico B2B (CRÍTICO, corrigido)
`get_partner_catalog_tecnico_secure()` devolvia `valor_dose_brl`, `valor_litro_brl`, `valor_ha_brl` e `preco_tabela_*` diretamente das tabelas de produto/microrganismo, para todos os papéis autorizados — inclusive `parceiro_b2b_tecnico`.

Correção: assinatura preservada; para `parceiro_b2b_tecnico` **todas as colunas financeiras retornam NULL** e a unidade vira `sob_consulta`. Para gestor B2B (`parceiro_b2b` com parceiro vinculado) os valores vêm do resolvedor canônico do próprio parceiro. Admin/gestor comercial sem contexto de parceiro também recebem NULL (sem preço de tabela cru).

### A3 — RLS On-Farm/Aplicador global por papel (ALTO, corrigido)
As políticas `FOR ALL USING (has_role(...,'operador_onfarm'))` em `lotes`, `controle_qualidade`, `envase`, `programacao_producao`, `estoque_produto`, `estoque_movimentacoes` davam acesso **irrestrito** a todo o dado de produção, incluindo DELETE; `ordens_servico`/`ordens_servico_onfarm` liberavam SELECT global por OR de papéis.

Correção (modelo de escopo existente = carteira `user_clientes`):
- helpers `fn_onfarm_scope_cliente(uuid)` e `fn_onfarm_scope_lote(uuid)` (SECURITY DEFINER, `search_path` fixo, sem EXECUTE para `anon`/PUBLIC);
- cadeia de escopo: `lote → programacao_producao → ordens_servico|ordens_servico_onfarm → cliente_id ∈ carteira do usuário`;
- comandos separados (SELECT / INSERT / UPDATE); **DELETE não concedido** em nenhuma das tabelas; `estoque_movimentacoes` fica append-only para On-Farm (sem UPDATE);
- `ordens_servico` e `ordens_servico_onfarm`: SELECT apenas de clientes da carteira (vale para On-Farm e Aplicador);
- as políticas globais anteriores foram removidas (sem liberação redundante por OR de papel).

### A4 — Fixtures com UUIDs fixos dentro de `supabase/migrations` (ALTO, corrigido forward-only)
O bloco 5 da migration `20260729193425` inseria vínculos reais/fixture (`user_clientes`, `partner_clients`, `partner_user_clients`) com UUIDs literais.

Correção: bloco movido para `scripts/tests/onfarm-b2b-fixtures/vinculos-homologacao.sql`, com guarda de staging obrigatória, marker `ARBIO_FIXTURE_HOMOLOGACAO` e cleanup comentado. O arquivo de migration mantém apenas comentário explicativo (correção forward-only — nada é reexecutado, nada é revertido no banco). **Os vínculos já existentes no staging foram preservados**; apenas a reaplicação/promoção futura fica impedida.

### Sem alteração (auditado, conforme)
- `can_user_access_cliente`: ampliação para papéis internos é coerente com o modelo de carteira; B2B e técnico continuam restritos ao próprio parceiro.
- Rotas: Portal do Produtor permanece em `/portal/*`; `/app/*` é o app móvel do técnico/consultor pré-existente, não um portal paralelo do produtor; `/portal/meus-pedidos` continua desativado para B2B; simulações internas não expostas ao produtor.
- Documentação canônica permanece em `docs/` (independentemente de `.lovable/plan.md`).
- Nenhum papel privilegiado concedido por auto cadastro; nenhuma RPC sensível executável por `anon`/PUBLIC.

---

## 3. Dados preservados

Nada foi apagado, desativado ou recalculado: catálogo, produtos, microrganismos, doses/volumes/custos ajustados, protocolos, fichas técnicas, PDFs, usuários, papéis, `partner_users`, `user_clientes`, `partner_user_clients`, `partner_clients`, snapshots de pedidos, parcelas, recebíveis, produção, entregas, fiscal, BI e comunicação. A migração deste checkpoint contém **apenas DDL de funções e políticas** — zero DML de negócio.

---

## 4. Testes executados

| Prova | Resultado |
|---|---|
| Guarda de ambiente (`project_ref` + marker) antes da escrita | PASS (`ikaauvsflpmamgxmkhoq`) |
| Migration aplicada (DDL idempotente) | PASS |
| `anon`/PUBLIC sem EXECUTE nas RPCs sensíveis (12 funções) | PASS |
| `handle_new_user` sem concessão de papel | PASS (definição inspecionada) |
| Migrations sem fixtures com UUIDs específicos (`rg` sobre `supabase/migrations`) | PASS |
| Rotas do produtor (`/portal/*`, sem `/app/*` paralelo, `/portal/meus-pedidos` inativo) | PASS |
| `tsgo --noEmit` (typecheck) | PASS |
| Vitest catálogo + navegação (8 arquivos / 97 casos) | PASS |
| Renderização "Sob consulta" para preço ausente (`PrecoComDesconto`) | PASS (estático) |

### UNVERIFIED (sem evidência inventada)
Não há, nesta sessão, credencial de sessão de usuário (`LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged`), `psql` (`PGHOST` ausente) nem permissão de `SET ROLE` no executor SQL. Portanto **não foi possível** executar as provas de runtime com sessões reais:
- técnico B2B sem dados financeiros (validado apenas por leitura da definição da função);
- gestor B2B vê apenas o próprio parceiro / cruzamento A→B negado;
- paridade catálogo → carrinho → simulação → `create_partner_order_secure` → snapshots com usuário autenticado;
- On-Farm sem acesso a dado externo à carteira e aplicador somente leitura;
- autoatribuição de papel negada em runtime;
- prova real de concorrência/`cart_hash` pendente da Fase 1 (**permanece UNVERIFIED desde a Fase 1**).

Observação factual: as tabelas de produção (`lotes`, `controle_qualidade`, `envase`, `programacao_producao`, `estoque_produto`, `estoque_movimentacoes`, `ordens_servico`, `ordens_servico_onfarm`) estão **vazias** no staging, e os usuários `onfarm@arbio.com` e `aplicador@arbio.com` não possuem vínculo em `user_clientes` — com o novo escopo eles não enxergam nada até que um administrador atribua carteira. Isso é o comportamento pretendido (sem vínculo → sem acesso), mas exige atribuição de carteira antes do uso operacional.

---

## 5. Checksums pós-correção (staging)

| Função | md5(pg_get_functiondef) | anon EXECUTE |
|---|---|---|
| `get_partner_catalog_secure` | `16b60a0a9fdf136e3fe38d1d0d409d64` | false |
| `get_partner_catalog_tecnico_secure` | `af957bab3063c3d056aeffebe76ccc1a` | false |
| `fn_resolve_commercial_price` | `3365a3216a568ce018ad355f43ad8aed` | false |
| `fn_resolve_b2b_cart` | `ec80ef03fd470a436d8a9197fec30889` | false |
| `create_partner_order_secure` | `e9fef097214c180e3c79e17f8f0c0288` | false |
| `simulate_b2b_payment_plan_secure` | `30134a85a845e33fc3a18882bcea4850` | false |
| `respond_b2b_order_quote_secure` | `db2b182a14a8c22c8243936d920a6655` | false |
| `rpc_b2b_partner_credit` | `801d0054327717e1cc09c42566bd91d0` | false |
| `fn_b2b_cart_hash` | `26fd3c7724a40b919f240f4021176115` | false |
| `handle_new_user` | `6f3c5072b776329ac5ff9f8bbf6fd7b2` | false |
| `fn_onfarm_scope_cliente` | `99913124b02d905ce09ab04ffcff8230` | false |
| `fn_onfarm_scope_lote` | `e10a4e58f17599a970f925b4eec070d5` | false |

---

## 6. Rollback (forward-only, sem reabrir falha de segurança)

Reversível por reaplicação das definições anteriores, que estão versionadas em `supabase/migrations/20260729201118_*.sql` (catálogo técnico) e `20260729202644_*.sql` (catálogo B2B), e pelas políticas globais descritas em `20260729193425_*.sql`.

**Não reverter sem decisão explícita:** o retorno das políticas `FOR ALL` por papel reabre acesso global à produção com DELETE; o retorno das funções de catálogo reintroduz fallback zero, fonte legada de preço e exposição financeira ao técnico B2B.

Restauração de acesso operacional (alternativa segura ao rollback): inserir o vínculo de carteira em `public.user_clientes` para o usuário On-Farm/Aplicador.

---

## 7. Pendências

1. Provas de runtime com sessões reais (lista UNVERIFIED acima) — exige credenciais de teste ou execução via preview autenticado.
2. Prova de concorrência/idempotência de checkout pendente desde a Fase 1.
3. Atribuição de carteira (`user_clientes`) aos operadores On-Farm/Aplicador de homologação.
4. Ruído pré-existente do linter Supabase (views SECURITY DEFINER, funções sem `search_path`, extensões em `public`) — fora do escopo deste checkpoint.

---

## 8. Créditos

Execução mantida dentro do limite autorizado de 40 créditos (checkpoint encerrado ao concluir relatório, sem iniciar Fase 2).

---

## 9. Gate

**Status: APTO COM RESSALVAS.**

Não há mais: bypass de preço (fonte única canônica), fallback zero (NULL + `sob_consulta`), vazamento financeiro ao técnico, escalada de privilégio no auto cadastro, RLS global indevida em On-Farm/Aplicador, nem fixtures promovíveis em `supabase/migrations`.

A ressalva é exclusivamente de **evidência**: as provas de runtime por sessão de usuário e a prova de concorrência da Fase 1 permanecem UNVERIFIED nesta sessão. Executá-las é pré-requisito para elevar o status a APTO PARA FASE 2.

---

## 10. Retomada e encerramento do checkpoint (execução continuada)

Ambiente validado antes de qualquer leitura/escrita: `_fiscal_staging_marker` = `ikaauvsflpmamgxmkhoq` (staging). Produção `navfzbwgwzruipouyfnk` **não** foi acessada. Nenhuma migration nova foi aplicada nesta retomada — apenas verificação e documentação.

### 10.1 Reverificação de estado efetivo no staging

- **Checksums** das 12 funções críticas reconferidos em `pg_get_functiondef`: **idênticos** aos da seção 5 — nenhuma regressão ou redefinição posterior.
- **`anon`/`PUBLIC` EXECUTE** nas RPCs sensíveis (`get_partner_catalog_secure`, `get_partner_catalog_tecnico_secure`, `create_partner_order_secure`, `simulate_b2b_payment_plan_secure`, `respond_b2b_order_quote_secure`, `rpc_b2b_partner_credit`, `rpc_resolve_commercial_prices`, `fn_resolve_commercial_price`): **0 ocorrências**. Só `authenticated` executa; `handle_new_user` não é executável nem por `authenticated`.
- **Fonte de preço**: `get_partner_catalog_secure` e `get_partner_catalog_tecnico_secure` referenciam `fn_resolve_commercial_price` e o estado `sob_consulta`; nenhuma fórmula de preço duplicada permanece nas duas funções.
- **RLS On-Farm/Aplicador** (`pg_policies`): em `lotes`, `controle_qualidade`, `envase`, `programacao_producao`, `estoque_produto`, `estoque_movimentacoes`, `ordens_servico`, `ordens_servico_onfarm` há apenas políticas **separadas por comando** (SELECT/INSERT/UPDATE) para `authenticated`, todas escopadas por `fn_onfarm_scope_cliente` / `fn_onfarm_scope_lote`. **Nenhuma política `FOR ALL` por papel On-Farm e nenhuma política de DELETE** para esses papéis.
- **Higiene de migrations**: as 12 migrations mais recentes de `supabase/migrations` contêm **0 UUIDs fixos** (verificação por varredura de padrão UUID). As fixtures permanecem em `scripts/tests/onfarm-b2b-fixtures/vinculos-homologacao.sql`, com guard de ambiente.
- **Rotas**: `/portal/meus-pedidos` redireciona para `/portal` (visão B2B removida do produtor). O namespace `/app/*` é o **app móvel de campo pré-existente** (técnico/produtor), anterior à Fase 1 — não é portal paralelo criado neste ciclo e permanece intocado.

### 10.2 Portões de qualidade

- `typecheck`: **PASS** (exit 0).
- `vitest run` (suíte completa): **2648 passed / 4 skipped / 3 failed** em 2655. As 3 falhas estão em `src/test/fiscal/sinief49/staging/verifier.test.ts` (verificador de types SINIEF 49), **pré-existentes e fora do escopo** deste checkpoint — nenhum teste de motor comercial, catálogo, RBAC ou On-Farm falha.

### 10.3 Provas de runtime — por que permanecem UNVERIFIED

Três caminhos foram tentados nesta retomada, todos bloqueados pelo executor:

1. `psql` indisponível (sem `PGHOST` nesta sessão);
2. o conector SQL de leitura **não pode `SET ROLE authenticated`** (`permission denied to set role "authenticated"`);
3. mesmo apenas com `request.jwt.claims` definido, o papel do conector **não tem EXECUTE** nas RPCs de negócio (`permission denied for function ...`) — consequência direta e desejada do hardening de grants.

Portanto as provas por sessão real de usuário (técnico sem financeiro, gestor B2B próprio vs. cruzado, paridade catálogo→carrinho→simulação→checkout, autoatribuição de papel, On-Farm sem acesso externo) e a **prova de concorrência/idempotência da Fase 1** continuam **UNVERIFIED**. Nenhuma evidência foi fabricada. O harness executável já versionado (`supabase/tests/motor-b2b/fase1-final/03-concorrencia.mjs` e `01/02-*.sql`) é o meio de execução quando houver credenciais de teste ou `psql`.

### 10.4 Preservações confirmadas

Nenhum dado legítimo foi alterado nesta retomada: catálogo, produtos, microrganismos, protocolos, fichas/PDFs, usuários, papéis e vínculos permanecem exatamente como após o commit `2c5da4a`. Nenhum histórico, snapshot, parcela, recebível, entrega, registro fiscal, BI ou comunicação foi recalculado ou removido.

### 10.5 Gate final do checkpoint

**Status mantido: APTO COM RESSALVAS** — arquitetura e segurança aprovadas (sem bypass de preço, sem fallback zero, sem vazamento financeiro ao técnico, sem escalada no auto cadastro, sem RLS global indevida, sem fixtures promovíveis); ressalva exclusivamente de **evidência de runtime**, conforme 10.3.

Execução encerrada dentro do limite de 40 créditos. **Fase 2 não iniciada.**
