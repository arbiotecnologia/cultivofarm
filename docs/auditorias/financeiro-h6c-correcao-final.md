# H6c — Correção final e auditoria independente do Financeiro AR Bio

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (exclusivo). Produção `navfzbwgwzruipouyfnk`: **não tocada**.
Escopo: H6c apenas. **H7 (Fiscal) não iniciada.**

## Migrations aplicadas (forward-only, staging)

| Arquivo | Conteúdo |
| --- | --- |
| `restoration/homologacao-h6/20260917000000_h6c_financeiro_snapshot_b2b_credito.sql` | `fn_entrega_valor_faturavel_v1`, `fn_b2b_order_billing_eligibility`, `fn_entrega_guard_faturamento_v1`, `generate_b2b_receivable_secure_impl`, trigger `trg_h6c_entrega_ar_b2b_link` |
| `restoration/homologacao-h6/20260917010000_h6c_backfill_payment_terms_link.sql` | Reconciliação do vínculo canônico (20 pedidos) + trigger `trg_h6c_set_canonical_payment_terms` |

## Achados e correções

### H6C-001 (P1) — fonte de condição B2B incorreta — CORRIGIDO
Antes, o valor faturável e o fluxo oficial de recebível liam **o termo mais recente**
(`ORDER BY created_at DESC LIMIT 1`) do pedido. Um termo novo pendente, ou um termo
antigo remanescente, alterava silenciosamente o valor econômico da entrega.
Agora a fonte é **`partner_orders.payment_terms_id`**, validada como pertencente ao pedido.
Regra fail-closed: só libera com `approval_status = 'approved'`, ou `not_required`
quando o pedido também não exige aprovação financeira. `pending`/`rejected`/termo não
vinculado ⇒ `origem = 'bloqueado'` e o guard de faturamento levanta exceção
(`condicao_b2b_bloqueada`) inclusive no modo manual. Não há fallback silencioso.

Reconciliação: 20 pedidos legados tinham termo único mas `payment_terms_id` nulo —
vínculo preenchido apenas onde inequívoco (1 termo). Pedidos ambíguos permaneceriam
bloqueados para decisão humana (nenhum caso em staging). Vínculo futuro é automático
no primeiro termo do pedido; troca exige atualização explícita do pedido.

### H6C-002 — entrega parcial com múltiplos produtos/preços — CORRIGIDO
O rateio agora é **econômico por produto**: para cada produto calcula-se a fração de
volume conferido aceito e aplica-se ao subtotal snapshot do item correspondente; o
ajuste histórico de nível pedido (juros/desconto) é alocado proporcionalmente à
participação econômica aceita. Recusar o item barato não reduz mais o faturamento na
proporção de um item caro. Bug corrigido no processo: `LEAST(1, NULL)` retornava `1`
em produto 100% recusado (nenhuma linha aceita), inflando o valor para o integral.

### H6C-003 (P1) — ciclo de crédito B2B — CORRIGIDO
O recebível gerado pela entrega não recebia `partner_id` nem criava
`partner_order_financial_links`, então o pedido permanecia como "comprometido não
faturado" e o recebível ficava fora do saldo em aberto. O trigger
`trg_h6c_entrega_ar_b2b_link` (transacional, idempotente por `UNIQUE(partner_order_id)`)
atribui o parceiro ao recebível, cria o vínculo financeiro e marca
`receivable_generated`, movendo a exposição de comprometido para saldo em aberto —
sem dupla contagem.

### H6C-004 — replay de faturamento — SEM REGRESSÃO
`fn_sync_entrega_financial_status` bloqueia alteração/limpeza de `receivable_id`
após faturamento; o vínculo financeiro permanece único. Idempotência H6b
(`FIN_IDEMPOTENCY_CONFLICT`) preservada em baixas e estornos.

### H6C-005 — imutabilidade e autorização — CONFORME
Todas as funções H6c são `SECURITY DEFINER` com `search_path=public` fixo e sem
`EXECUTE` para `anon`. Imutabilidade de itens de pedido aprovado e do snapshot de
faturamento confirmada em teste.

## Evidências

- `restoration/homologacao-h6/47-h6c-postcheck.sql` — **13/13 PASS** (estrutural).
- `restoration/homologacao-h6/48-h6c-comportamental.sql` — **12/12 PASS**
  (transacional com `ROLLBACK`; nenhum dado persistido).
  Casos: termo pendente bloqueia; guard fail-closed; integral = 1470,00;
  parcial multiproduto = 1050,00 (fator 0,714286); recebível com `partner_id`;
  vínculo único; pedido sai de comprometido; replay bloqueado; exposição sem dupla contagem.
- Varredura de dados existentes: 23/23 pedidos com condição canônica vinculada;
  20 entregas B2B resolvem por `B2B_PAYMENT_TERMS_SNAPSHOT`; 2 entregas legadas sem
  fonte histórica confiável seguem `indisponivel` (comportamento intencional).
- `tsgo --noEmit`: **0 erros**. Vitest: **3105 passed / 4 skipped / 0 fail**.
- Binding restaurado e verificado no baseline de staging `c75bb87f`.

## Gate

**H6c — APROVADA.** Zero P0/P1 em aberto. H7 (Fiscal) não iniciada.

---

# H6d — Correção de proveniência/reprodutibilidade (release engineering)

Ambiente: **staging `ikaauvsflpmamgxmkhoq`** (exclusivo). Produção `navfzbwgwzruipouyfnk`:
**não tocada** (nenhuma conexão, nenhum comando). **H7 não iniciada.**

## Diagnóstico antes

- P1 de proveniência: o estado H6c ativo no staging **não era reproduzível** por
  `supabase/migrations/` — os SQLs existiam apenas em `restoration/homologacao-h6/`.
- `apply-h6c.sh` aplicava só a etapa 1; o staging também possui o backfill/trigger
  da etapa 2.
- Não havia `rollback-h6c.sql`.
- Não havia postcheck de paridade REPO x LIVE.

## Arquivos criados/alterados

| Arquivo | Ação |
| --- | --- |
| `supabase/migrations/20260917000000_h6c_financeiro_snapshot_b2b_credito.sql` | **criado** (cópia canônica, byte-idêntica ao SQL homologado) |
| `supabase/migrations/20260917010000_h6c_backfill_payment_terms_link.sql` | **criado** (idem) |
| `restoration/homologacao-h6/apply-h6c.sh` | corrigido: aplica **as duas** etapas, na ordem, a partir de `supabase/migrations/`, com guard duro contra produção e checagem de existência dos arquivos |
| `restoration/homologacao-h6/rollback-h6c.sql` | **criado** (forward-safe, documentado) |
| `restoration/homologacao-h6/49-h6d-paridade-repo-live.sql` | **criado** (postcheck de paridade, termina em `ROLLBACK`) |
| `restoration/homologacao-h6/49-h6d-paridade.sh` | **criado** (runner com guard de ambiente) |
| `restoration/homologacao-h6/45-h6b-concorrencia.mjs` | fixtures/teardown atualizados ao contrato H6c (ver H6D-002) |

Nenhuma migration histórica foi editada. Nenhum arquivo de aplicação (`src/`) foi alterado.

## Comparação REPO x LIVE

Prova executada em transação com `ROLLBACK` (`49-h6d-paridade.sh`): as migrations
canônicas do repositório foram reaplicadas sobre o staging e as definições
resultantes comparadas com as capturadas antes (`pg_get_functiondef` /
`pg_get_triggerdef`, comparação textual integral).

- P1 as 6 funções H6c existem no live — **PASS**
- P2 definições das funções: repo == live — **PASS**
- P3 os 2 triggers H6c existem no live — **PASS**
- P4 definições dos triggers: repo == live — **PASS**
- P5 backfill é no-op (`UPDATE 0`, nenhum vínculo alterado) — **PASS**
- P6 nenhum pedido com termo único sem vínculo canônico — **PASS**

Conclusão: **zero divergência material**. Não foi necessário reaplicar DDL no
staging (requisito 7): o estado live já é exatamente o que o repositório produz.

## Histórico de migrations no staging (H6D-001 — P2)

`supabase_migrations.schema_migrations` tem **644 registros**, com `max(version) =
20260823000000`, enquanto `supabase/migrations/` tem **692 arquivos**. Nenhuma
versão `>= 20260824000000` está registrada — ou seja, **48 migrations** (todas as
fases posteriores, incluindo H1–H6c) foram aplicadas via `psql` direto, fora do
CLI, e por isso não constam no histórico.

Classificação: **P2 de release engineering**, não afeta o comportamento do banco.
Decisão: **não adulterar metadados**. Registros de histórico não foram inseridos
manualmente, apesar de o papel de conexão ter privilégio para isso. A via
suportada (`supabase migration repair`/CLI vinculado ao projeto) não está
disponível neste ambiente. Fica como evidência explícita para **H10** (fase de
promoção), onde o histórico deve ser reconciliado de uma vez para o intervalo
`20260824000000..20260917010000` antes do primeiro deploy por CLI.

## H6D-002 — harness de concorrência H6b desatualizado (P3, corrigido)

O runner `45-h6b-concorrencia.mjs` criava pedidos com `status='pendente'` e não
vinculava condição canônica. Após H6c, o fail-closed passou a rejeitar o
faturamento desses pedidos (`receivable_requires_approved_order`) — **o produto
estava correto; o harness é que estava desatualizado**. Correções (somente teste):

- o pedido é aprovado **após** inserir itens e termos (itens são imutáveis em
  pedido aprovado);
- teardown desfaz `partner_orders.payment_terms_id` antes de remover os termos
  (FK `partner_orders_payment_terms_id_fkey`);
- teardown remove os `partner_order_financial_links` criados pelo trigger H6c
  (com `DISABLE TRIGGER USER` pontual, pois o vínculo é imutável) antes dos
  recebíveis, e devolve o pedido a `pendente` antes de apagar itens.

## Rollback

`restoration/homologacao-h6/rollback-h6c.sql` — **forward-safe**:

- Reverte automaticamente: triggers `trg_h6c_entrega_ar_b2b_link` e
  `trg_h6c_set_canonical_payment_terms` e suas funções.
- **Não** reverte automaticamente as redefinições `CREATE OR REPLACE` de
  `fn_entrega_valor_faturavel_v1`, `fn_b2b_order_billing_eligibility`,
  `fn_entrega_guard_faturamento_v1` e `generate_b2b_receivable_secure_impl` —
  não há snapshot das definições anteriores; a restauração se faz reaplicando
  `20260916000000_h6b_...sql` (e anteriores) na ordem cronológica.
- **Não** desfaz o backfill de `partner_orders.payment_terms_id`: os 20 vínculos
  preenchidos eram inequívocos (pedido com exatamente 1 termo), não sobrescreveram
  nada, e apagá-los destruiria vínculos legítimos e deixaria pedidos bloqueados
  para faturamento pelo fail-closed. Correções eventuais são pontuais e auditadas.
- Efeito colateral documentado: sem o trigger de crédito, entregas B2B voltam a
  gerar recebível sem `partner_id`/vínculo (regressão consciente de H6C-003).

## Testes reexecutados (staging)

| Verificação | Resultado |
| --- | --- |
| `46-h6b-postcheck.sql` | **16/16 PASS** |
| `47-h6c-postcheck.sql` | **13/13 PASS** |
| `48-h6c-comportamental.sql` (ROLLBACK) | **12/12 PASS** |
| `49-h6d-paridade-repo-live.sql` (ROLLBACK) | **6/6 PASS** |
| `45-h6b-concorrencia.mjs` | **17/17 PASS** (após H6D-002) |
| `tsgo --noEmit` | **0 erros** |
| Vitest (suite completa) | **3105 passed / 4 skipped / 0 fail** |
| `vite build` | **OK** |
| `connection-binding.static.test.ts` | **8/8 PASS** |

## Binding

Detectado drift do sandbox (`types.ts` com 2.052 linhas e `.env` divergente);
restaurados para a baseline de staging `c75bb87f` (`types.ts` com 21.850 linhas,
`VITE_SUPABASE_PROJECT_ID=ikaauvsflpmamgxmkhoq`). Nenhuma referência a produção
ou ao backend acidental nos arquivos de conexão.

## Produção

`navfzbwgwzruipouyfnk` **intocada**: todos os comandos usaram `STAGING_DSN`
(validado como staging antes de cada execução); os scripts abortam com `exit 2`
se o DSN apontar para produção.

## P2/P3 remanescentes

- **H6D-001 (P2)** — histórico de migrations do staging defasado em 48 versões
  (aplicação manual via `psql`). Reconciliação delegada a H10, sem adulteração de metadados.
- **H6-006 (P3)** e **H6-B01** (sem massa de dados para prova ao vivo) — herdados de H6.

## GATE

**H6d — APROVADA. GATE H6 (H6 + H6b + H6c + H6d) — APROVADA COM RESSALVAS**
(zero P0/P1; ressalvas P2/P3 acima). **H7 (Fiscal) não iniciada.**
