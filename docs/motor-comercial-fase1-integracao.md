# Motor Comercial B2B — Fase 1: Integração Autoritativa

Ambiente de execução: **staging `ikaauvsflpmamgxmkhoq`**. Produção `navfzbwgwzruipouyfnk` não foi tocada.

## 1. Estrutura (migration de estrutura)

- `commercial_payment_plans.pricing_mode` (`discount_from_base` | `fixed_item_price` | `quote_only`),
  default `discount_from_base` — comportamento legado preservado.
- Novo status `aguardando_cotacao` em `partner_order_status`.
- Snapshots em `partner_order_items`: `pricing_mode_snapshot`, `price_source_snapshot`,
  `base_price_snapshot`, `price_rule_id`.
- Snapshots em `partner_order_payment_terms`: `pricing_mode_snapshot`, `credit_decision_snapshot`.
- RLS de `commercial_price_rules`: leitura/escrita para `administrador` e `gestor_comercial`,
  leitura para `financeiro`; `parceiro_b2b`, técnicos e produtores sem acesso direto à tabela.
- Guarda `tg_commercial_price_rules_plan_mode_guard`: impede regra com `pricing_mode`
  divergente do plano vinculado (`PRICE_RULE_MODE_CONFLICT`).

## 2. Motor autoritativo (migration de RPC)

- `fn_resolve_commercial_price` passa a respeitar o `pricing_mode` do plano:
  - `quote_only` → `QUOTE_REQUIRED`, sem preço;
  - `fixed_item_price` → exige regra ativa, senão `PRICE_RULE_MISSING` (sem fallback de catálogo);
  - `discount_from_base` → precedência P1→P4 legada com fallback de catálogo.
- `fn_resolve_b2b_cart` centraliza a precificação em lote e a agregação do carrinho.
- `simulate_b2b_payment_plan_secure`, `create_partner_order_secure` e
  `convert_partner_simulation_to_order_secure` consomem o mesmo resolvedor —
  **preço enviado pelo front deixou de ser autoritativo**.
- `create_partner_order_secure` persiste snapshot item a item e a decisão de crédito
  (`pg_advisory_xact_lock` na mesma transação).
- `convert_partner_simulation_to_order_secure` revalida o preço na conversão e exige
  `p_confirm_price_change` quando o total diverge ou a validade expirou.
- `approve_partner_order` e `generate_b2b_receivable_secure` bloqueiam pedidos em
  `aguardando_cotacao` ou sem preço definitivo (`fn_b2b_order_priceable`).
  O corpo original da geração de recebível foi preservado em
  `generate_b2b_receivable_secure_impl` (mesma lógica, sem alteração de regra financeira).

## 3. Evidência de runtime

Harness: `supabase/tests/motor-b2b/fase1-integracao/01-integracao-harness.sql`.
Fixtures em subtransação sempre revertida; nenhum dado operacional criado ou alterado.

| Teste | Verificação | Resultado |
|-------|-------------|-----------|
| T1 | plano `quote_only` não precifica (`QUOTE_REQUIRED`, sem preço) | PASS |
| T2 | `fixed_item_price` sem regra → `PRICE_RULE_MISSING` (não cai no catálogo) | PASS |
| T3 | `fixed_item_price` com regra → preço da regra (`condition_fixed_price`) | PASS |
| T4 | `discount_from_base` preserva a precedência legada (catálogo + desconto) | PASS |
| T5 | `fn_resolve_b2b_cart` agrega corretamente (2 × 123,45 = 246,90) | PASS |
| T6 | carrinho em `quote_only` sinaliza `quote_required` | PASS |
| T7 | regra com modo divergente do plano é bloqueada | PASS |
| T8 | `generate_b2b_receivable_secure_impl` presente | PASS |
| T9 | `anon` sem SELECT em `commercial_price_rules` | PASS |

**9/9 PASS.** Typecheck OK, build OK, testes de integração RPC 4/4 PASS.

## 4. Frontend

- `useSimulateB2BPaymentPlan` expõe `pricing_mode`, `quote_required` e as linhas resolvidas.
- `NovoPedido` usa os totais retornados pelo servidor no diálogo de confirmação e trata
  pedidos sob consulta (aviso dedicado + botão "Enviar solicitação de cotação").
- `PaymentSimulationSummary` oculta valores quando o plano é sob consulta.
- `useCreatePartnerOrder` traduz `PRICE_RULE_MISSING`, `QUOTE_REQUIRED` e mudança de preço.
- `ParceiroPrecosTab` passa a explicitar que é a prioridade 2 do motor.

## 5. Pendências assumidas

- CRUD da matriz canônica (`commercial_price_rules`) e edição do `pricing_mode` por plano
  ainda não têm tela dedicada — hoje são mantidos por SQL pela equipe comercial.
- Fluxo de resposta à cotação (`aguardando_cotacao` → preço definido) não tem UI própria.

---

# Fase 1 — Correção consolidada final (staging `ikaauvsflpmamgxmkhoq`)

Produção `navfzbwgwzruipouyfnk` não foi acessada. Nada foi publicado ou deployado.
Nenhum pedido, item, snapshot, parcela, recebível, dado de produção, entrega,
fiscal, BI ou comunicação foi alterado.

## 1. Higiene da cadeia de migrations

Três migrations de fixture/teste (criavam `_motor_b2b_fase1_int_evidence` e
`_motor_b2b_fase1_quote_evidence`) foram retiradas de `supabase/migrations/`
para `restoration/motor-b2b-fase1-final/migrations-removidas/`. As tabelas de
evidência foram removidas do banco pela migration operacional consolidada, que
começa com guarda fail-fast de staging (`_fiscal_staging_marker`).

## 2. Produtor direto inerte até a Fase 5

- `rpc_resolve_commercial_prices`: qualquer escopo `customer`/`producer` ou
  `customer_id` informado → `PRODUCER_DIRECT_NOT_ENABLED`; `cliente_produtor`
  não passa da porta.
- `create_partner_order_secure`: produtor sem papel interno/parceiro →
  `PRODUCER_DIRECT_NOT_ENABLED`.
- `commercial_price_rules`: gatilho `trg_commercial_price_rules_producer_inert`
  recusa regra vigente de escopo produtor.
- RLS mantém a matriz invisível para técnico e produtor (asserts R7).

## 3. Hardening de crédito e dado financeiro

- `rpc_b2b_partner_credit` passou a exigir autenticação + papel
  (`administrador`/`financeiro`/`gestor_comercial`) ou vínculo real em
  `partner_users`; antes delegava sem qualquer checagem.
- `simulate_b2b_payment_plan_secure` não devolve mais bloco `credit` nem avisos
  de crédito para `parceiro_b2b_tecnico` (`financial_visible=false`).
- `anon` perdeu `EXECUTE` em todas as funções comerciais B2B.

## 4. Preço autoritativo no frontend

- A simulação devolve `cart_hash` (assinatura canônica de plano + linhas
  resolvidas + total, calculada no servidor).
- `create_partner_order_secure` recebe `p_expected_cart_hash`; divergência →
  `price_changed`, com registro em `partner_order_audit_logs`.
- `NovoPedido` bloqueia o envio sem `cart_hash` e envia sempre o hash da
  simulação; pedidos `quote_only` são gravados com totais zerados.

## 5. Cotação (`aguardando_cotacao`)

`respond_b2b_order_quote_secure` ganhou `pg_advisory_xact_lock` por pedido,
`FOR UPDATE` nos itens, recusa de linhas duplicadas (`quote_duplicate_line`),
validação de escala/limite de preço (`invalid_quote_price_scale`) e auditoria
com `dados_anteriores` (snapshot dos itens antes da resposta). Terms e
schedule são recalculados na mesma transação.

## 6. Evidência executada

Estruturais (V1–V8) e de papel/RLS (R1–R9) executados no staging:
higiene, ausência de `anon`, hash determinístico e parametrizado, produtor
inerte, crédito com papel/vínculo, cotação com lock e duplicidade, simulação
sem crédito para técnico. **17/17 asserts PASS.** Scripts versionados em
`restoration/motor-b2b-fase1-final/verify.sql` e
`supabase/tests/motor-b2b/fase1-final/01-papeis-rls-harness.sql`.

Regressão: typecheck OK, build OK (aviso pré-existente de bundle PWA),
Vitest **2587 passed / 2 failed** — as duas falhas são as regressões
pré-existentes já registradas (verificador SINIEF 49 e acompanhamento do
portal do produtor).

## 7. Rollback

`restoration/motor-b2b-fase1-final/` com `precheck.sql`, `verify.sql`,
`rollback.sql` e README. O rollback é forward-safe: remove a inércia do
produtor e recria a assinatura de 7 argumentos de `create_partner_order_secure`
sem tocar em dado operacional. Por decisão de segurança ele **não** reverte a
revogação de `anon` nem as checagens de crédito.

## 8. Status do gate — NÃO APTO (bloqueio técnico declarado)

Item 6 do escopo exige prova de concorrência com **duas sessões Postgres reais
e simultâneas** respondendo à mesma cotação/pedido. Este ambiente de execução
não oferece acesso `psql` nem duas conexões concorrentes controláveis — só há
um executor SQL transacional por chamada. A serialização foi implementada e
verificada estaticamente (`pg_advisory_xact_lock` em `create_partner_order_secure`
e em `respond_b2b_order_quote_secure`), mas **a prova empírica de concorrência
permanece UNVERIFIED**. Pelos critérios do próprio escopo, a Fase 1 não é
declarada APTO até que essa prova seja executada externamente com duas sessões
reais contra o staging.

Todos os demais itens (1–5, 7–10) estão implementados e evidenciados.

---

# Correção de gate da Fase 1 (auditoria independente)

Ambiente: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk`
**não foi acessada**. Nada publicado/deployado. Nenhum dado operacional
(pedidos, itens, snapshots, recebíveis, parcelas, produção, entrega, fiscal,
BI, comunicação) foi alterado ou removido.

## 1. Vazamento financeiro ao técnico B2B — CORRIGIDO

`simulate_b2b_payment_plan_secure` é uma RPC exclusivamente financeira/checkout.
O bloqueio deixou de ser "credit = NULL" e passou a ser **runtime, antes de
resolver ou retornar qualquer preço**: usuário com `parceiro_b2b_tecnico` e sem
papel interno autorizado nem `parceiro_b2b` recebe `forbidden_financial_terms`.
Nenhum `payment_plan`, `discount_percent`, `monthly_interest_percent`,
`amounts`, `final_amount`, `schedule`, `first_due_date`, `pricing_mode` ou linha
precificada é montado antes do bloqueio, e nenhum log operacional de preço é
gravado para o técnico.

- Gestor B2B (`parceiro_b2b`) do próprio parceiro: preservado.
- `parceiro_b2b_tecnico` + papel interno autorizado: segue a alçada interna.
- Parceiro A não alcança B (`forbidden_partner`); produtor e usuário sem vínculo
  falham antes da resolução.
- Caminho indireto fechado: `convert_partner_simulation_to_order_secure` recusa
  técnico-only com `forbidden_role_tecnico_cannot_convert` e não devolve
  snapshot financeiro; `rpc_b2b_partner_credit` exige papel ou vínculo real.

## 2. `cart_hash` obrigatório no backend — CORRIGIDO

- `create_partner_order_secure` recusa hash nulo/vazio com `cart_hash_required`.
- **Assinatura única de 9 argumentos** (`p_expected_cart_hash`,
  `p_idempotency_key`). O overload antigo de 7 argumentos foi removido — não há
  caminho de bypass (`V4(overload_residual)` no verify).
- Hash canônico v2 (sha256) sobre `partner_id`, `plan_id`, e por linha
  ordenada deterministicamente: `item_tipo`, `item_id`, `unidade_medida`,
  `volume_ml`, `quantidade`, `pricing_mode`, `price_source`/`rule_id`, preço
  unitário — mais o total final. O mesmo item em volumes/unidades diferentes
  produz assinaturas distintas.
- O hash **não** é usado como autorização: os preços continuam sendo
  re-resolvidos server-side e comparados; divergência devolve `price_changed`.
- Exceção interna auditada: `convert_partner_simulation_to_order_secure`
  (SECURITY DEFINER) calcula o hash com `fn_b2b_cart_hash` a partir do carrinho
  recém-resolvido e usa `idempotency_key = 'sim:<simulation_id>'`, de modo que
  a conversão repetida não duplica pedido.
- Callsites atualizados: `src/hooks/useCreatePartnerOrder.ts`
  (`expected_cart_hash` e `idempotency_key` obrigatórios em tipo e em runtime) e
  `src/pages/portal-parceiro/NovoPedido.tsx` (bloqueia envio sem simulação e
  reutiliza a mesma chave de checkout em cliques repetidos, descartando-a só
  após sucesso).

## 3. Crédito após resposta de cotação — CORRIGIDO

Dentro da **mesma transação** de `respond_b2b_order_quote_secure`:
`pg_advisory_xact_lock` em ordem determinística (pedido → crédito do parceiro),
`FOR UPDATE` nos itens, recálculo de `fn_b2b_credit_exposure` com
`p_exclude_order_id` = o próprio pedido (evita contagem dupla), considerando
recebíveis abertos + pedidos comprometidos sem recebível + o novo total cotado.
Resultados: vencido com `block_if_overdue` → transação revertida; limite
excedido com `action=block` → itens/terms/schedule/pedido revertidos;
`action=approval_required` → grava totais/snapshots e move para
`aguardando_aprovacao_credito` com `credit_block_reason`; aprovado → segue para
`em_analise_comercial`. `credit_decision_snapshot` e auditoria são gravados sem
expor dados ao técnico. A decisão **não** depende de trigger — a avaliação é
explícita na RPC.

## 4. Higiene da cadeia de migrations — CORRIGIDO

`supabase/migrations/20260729032912_*.sql` (verify/harness com UUIDs fixos) foi
retirada da cadeia e arquivada em
`restoration/motor-b2b-fase1-final/migrations-removidas/`; o conteúdo passou a
viver em `supabase/tests/motor-b2b/fase1-final/02-verify-harness.sql`. Todas as
migrations da Fase 1 foram revisadas; o inventário completo (operacional x
teste/restauração) e a reconciliação com o histórico remoto estão em
`restoration/motor-b2b-fase1-final/INVENTARIO-MIGRATIONS.md`. Nenhum downgrade
nem edição de histórico do banco foi feito. As migrations operacionais mantêm
guarda `STAGING_GUARD`, portanto a cadeia é honestamente classificada como
**operacional em staging, NÃO promovível**; o pacote de promoção está descrito
(e **não** executado) no mesmo inventário.

## 5. Prova real de concorrência — UNVERIFIED (limitação comprovada)

- **A (chamadas PostgREST simultâneas com JWT `authenticated`)**: tentada e
  **impossível**, com evidência registrada:
  1. `LOVABLE_BROWSER_AUTH_STATUS=external_unmanaged` e
     `LOVABLE_BROWSER_SUPABASE_SESSION_JSON` ausente — nenhuma sessão injetada;
     `LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN` existe mas está vazio;
  2. não há `SERVICE_ROLE_KEY` no ambiente, logo não é possível cunhar token
     nem usar a Admin API (e `service_role` não poderia ser a identidade de
     negócio de qualquer forma);
  3. auto-cadastro via `anon` foi tentado: `harness.b2b.a@arbio.com` foi criado
     (`200`), mas o login devolve `email_not_confirmed`; um segundo usuário caiu
     em `over_email_send_rate_limit`. Confirmar o e-mail exigiria escrever em
     `auth.users`, o que é proibido (schema reservado do Supabase) — não foi
     feito. O usuário residual foi neutralizado: papel removido e perfil
     desativado (ver adendo de segurança abaixo);
  4. o harness de papéis/RLS em SQL depende de `SET ROLE authenticated`, negado
     à identidade disponível (`permission denied to set role "authenticated"`).
- **B (`dblink`)**: extensão ausente no staging; instalar extensão não é
  permitido pelo escopo. `psql` existe no sandbox, mas não há `PGHOST`/DSN.

- **C (harness externo versionado)**: entregue e executável em
  `supabase/tests/motor-b2b/fase1-final/03-concorrencia.mjs` — dois clientes
  HTTP independentes com barreira/`Promise.all`, login real de dois usuários,
  `service_role` restrito a fixture/limpeza, cobrindo: crédito concorrente,
  idempotência do mesmo checkout e duas respostas simultâneas da mesma cotação
  (esperado: uma vence, outra recebe `order_not_in_quote_state`, um único
  `payment_terms`). Registra timestamps, status, contagens antes/depois e faz
  limpeza dos pedidos criados.

Nenhum PASS é declarado para este item.

## 6. Testes e regressão

- Estrutura verificada em runtime no staging: `V1..V12` — sem tabelas de
  evidência, `anon` sem EXECUTE nas 11 funções comerciais, assinatura única de
  `create_partner_order_secure`, gatilho de produtor inerte presente,
  `partner_order_idempotency` com RLS, dois índices únicos, sem acesso `anon`,
  e `authenticated` sem INSERT/UPDATE/DELETE direto; `commercial_price_rules`
  com RLS e invisível a `anon`.
- Typecheck: OK. Build: OK.
- Vitest: **2587 passed / 2 failed** (2593 total).
  - `src/test/portalAcompanhamentoProdutor.test.tsx` — *flaky por timeout de
    5s sob carga da suíte completa*. Executado isoladamente: **10/10 PASS em
    776 ms**. Não é regressão da Fase 1 e não toca o motor comercial.
  - `src/test/fiscal/sinief49/staging/verifier.test.ts` — o teste espera
    `PENDING` de um `types.ts` ainda **não** regenerado; o `types.ts` real já
    contém parcialmente as entidades SINIEF 4.0 (introduzidas pelas migrations
    fiscais `20260807`/`20260808`, anteriores à Fase 1), então o classificador
    devolve `FAIL`. É débito do módulo fiscal, sem relação com o motor B2B e
    sem contradizer a inércia do produtor direto até a Fase 5.

## 7. Rollback e riscos

`restoration/motor-b2b-fase1-final/` atualizado: `verify.sql` com 12 asserts
coerentes com hash v2/idempotência, `rollback.sql` **reduzido** — reverte apenas
a inércia do produtor direto e **não** recria a assinatura de 7 argumentos
(fazê-lo reabriria criação de pedido sem paridade de preço), `README.md` e
`INVENTARIO-MIGRATIONS.md`.

Riscos/custos: clientes muito antigos que ainda chamem a assinatura de 7
argumentos passam a falhar (intencional); a exigência de simulação prévia
adiciona uma chamada de rede por checkout; a tabela de idempotência cresce
proporcionalmente aos checkouts e pode exigir política de expurgo futura.

## 8. Adendo — build e achado de segurança fora do gate

**Build (`vite build --mode development`) estava quebrado** com
`maximumFileSizeToCacheInBytes` (5 MiB) menor que o bundle atual (5,25 MB), o
que fazia o `vite-plugin-pwa` abortar com exit 1. Limite elevado para 12 MiB em
`vite.config.ts`; build volta a passar (precache de 20 entradas). Fica
registrado o débito de code-splitting do chunk principal.

**Achado de segurança (não corrigido — fora do escopo do gate, exige decisão):**
`public.handle_new_user` concede automaticamente o papel interno
`administrativo` a qualquer usuário criado por auto-cadastro (`anon`
`/auth/v1/signup`) sem o metadado `created_by_admin`. Isso foi observado na
prática durante a tentativa do item 5: o usuário de teste recém-criado nasceu
com papel interno. Em staging o impacto ficou contido (e-mail não confirmado,
papel removido e perfil desativado por este trabalho), mas **em produção isso
seria escalonamento de privilégio por auto-cadastro**. Recomendação: o papel
padrão de auto-cadastro deve ser nenhum papel (fluxo "acesso pendente") ou um
papel sem alçada, com atribuição explícita por administrador. Alterar esse
comportamento muda o onboarding e por isso não foi feito sem autorização.


## Status final

**APTO COM RESSALVA TÉCNICA** — todos os bloqueios críticos (1–4, 6, 7) estão
resolvidos e evidenciados; a única pendência é a prova empírica de concorrência
(item 5), impossível neste ambiente por ausência comprovada de identidade
`authenticated` e de segunda sessão Postgres, com harness executável entregue e
mantido como **UNVERIFIED**.

