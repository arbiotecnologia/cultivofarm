# Motor Comercial B2B — Fase 7: Certificação Final

**Ambiente:** staging Supabase `ikaauvsflpmamgxmkhoq` (marker `STAGING` validado antes de toda escrita).
**Produção `navfzbwgwzruipouyfnk`: não tocada. Nenhuma publicação realizada.**
**Documento:** reescrito integralmente na correção consolidada da Fase 7 (auditoria externa do commit `1e8f0a9c8d766e3b2f9143aad863ee404407c22b`).

---

## 0. GATE

> ## `APTO COM RESSALVAS`

O gate `APTO PARA PROMOÇÃO CONTROLADA` **não** é concedido. As condições exigidas
(fluxo pedido→aprovação→recebível→parcelas, rejeição/ajuste, gates server-side,
concorrência com mesma chave) **não foram comprovadas** nesta execução — ver §7.

---

## 1. Retificação explícita das afirmações imprecisas dos commits `3c856eaa` e `1e8f0a9c`

| # | Afirmação anterior | Situação real |
|---|---|---|
| R1 | "APTO PARA PROMOÇÃO CONTROLADA" | **Incorreto.** O escopo comprovado cobria apenas simulação, criação de pedido, hash e replay. Retificado para `APTO COM RESSALVAS`. |
| R2 | "Idempotência concorrente comprovada" | **Incorreto.** A prova executada usou **chaves de idempotência diferentes**, e duas chamadas com chaves diferentes gerando dois pedidos é comportamento esperado, não proteção contra duplicidade. Prova com a **mesma** chave: **NÃO EXECUTADA**. |
| R3 | "`commercial_price_rules` vazia causa 'Sob consulta' em todo o catálogo — aguardar carga da matriz oficial" | **Diagnóstico incorreto.** A causa real era um defeito em `get_partner_catalog_secure` (ver §3). A tabela vazia **não** é, por si, bloqueante: o resolvedor canônico opera em `discount_from_base` a partir de `partner_product_prices`/catálogo. |
| R4 | Teste `verifier.test.ts` aceitando `PENDING` **ou** `FAIL` | **Enfraquecimento indevido.** Revertido: o veredito real é exatamente `FAIL` (ver §2). |
| R5 | "Segregação financeira comprovada" | **Parcial.** Comprovada apenas por ACL/definição estática nesta execução; provas de runtime com sessões JWT efêmeras não foram reexecutadas. |

---

## 2. Rigor dos testes restaurado

### 2.1 `src/test/fiscal/sinief49/staging/verifier.test.ts`

Estado real determinado por execução direta do verificador contra
`src/integrations/supabase/types.ts`:

```
verdict = FAIL   misses = 1
[{ "kind": "relationship",
   "detail": "fiscal_stock_loss_contexts → columns=[lote_id] referencedRelation=lotes referencedColumns=[id]" }]
```

Cobertura é **parcial** (entidades presentes, um relacionamento divergente) ⇒ o
veredito exato é `FAIL`. O teste foi corrigido de
`expect(["PENDING","FAIL"]).toContain(verdict)` para `expect(verdict).toBe("FAIL")`,
com comentário registrando que a regeneração do `types.ts` deve fazer o teste
falhar deliberadamente para forçar a atualização do gate. `FAIL` **não** é
transformado em sucesso genérico: o teste apenas fixa o estado auditado.

### 2.2 `DashboardTecnico.tsx`

A melhoria textual ("Portal Técnico B2B") foi **mantida** — sem regressão:
`src/test/portalParceiroSimulador.contract.test.ts` (5 testes) passa.

### 2.3 Execução

| Execução | Resultado |
|---|---|
| `verifier.test.ts` + `portalParceiroSimulador.contract.test.ts` isolados | **9/9 PASS** |
| Suíte completa (`bunx vitest run`) | 2657 PASS / **1 FAIL** / 4 skipped (158 arquivos) |
| Reexecução isolada do arquivo que falhou | **10/10 PASS** em 1120 ms |

**Diferenciação flaky × determinística:** `src/test/portalAcompanhamentoProdutor.test.tsx > (1-5)`
falhou por `Test timed out in 5000ms` apenas sob carga da suíte completa
(`environment 2646s` acumulado); isolado executa em 1,1 s. Classificado como
**flaky por timeout de ambiente**, não como falha determinística. Não relacionado
às alterações desta correção.

---

## 3. Matriz comercial — diagnóstico corrigido, sem inventar valores

### 3.1 Inventário efetivo

| Objeto | Estado em staging |
|---|---|
| `public.commercial_price_rules` | **0 linhas** |
| `public.commercial_payment_plans` | **8 planos ativos**, todos `pricing_mode = discount_from_base` |
| `public.partner_product_prices` | **5 linhas** ativas (`is_current`), `preco_tabela = 100,00`, parceiro `6f22d1dc…` |
| `public.produtos` | 7 produtos, todos com `valor_ha_brl` / `valor_litro_brl` / `valor_dose_brl` preenchidos |
| `public.microrganismos` | 18, dos quais 9 com `b2b_enabled` e `dose_ml_ha`/`valor_dose_brl` preenchidos |
| `public.partner_accounts` | 1 parceiro |

Planos vigentes (parâmetros **já configurados**, nenhum inventado):

| code | desconto % | juros a.m. % | tipo juros | prazo (d) | aprov. crédito | aprov. financeira |
|---|---|---|---|---|---|---|
| `cash_7d` | **40** | 0 | none | 7 | não | não |
| `short_30d` | 35 | 0 | none | 30 | não | não |
| `medium_60d` | 30 | 1,5 | compound | 60 | não | não |
| `extended_90d` | 25 | 2,0 | compound | 90 | sim | não |
| `harvest_6m_approved` | 20 | 2,0 | compound | 180 | sim | sim |
| `harvest_8m_approved` | 20 | 2,0 | compound | 240 | sim | sim |
| `harvest_8m_medium_risk` | 20 | 2,5 | compound | 240 | sim | sim |
| (8º plano) | — | — | — | — | — | — |

> O **desconto padrão de 40% à vista** citado no pedido **já está canonicamente
> configurado** em `commercial_payment_plans.cash_7d.discount_percent = 40`.
> Nenhuma taxa, desconto ou preço foi criado nesta correção.

### 3.2 Precedência, constraints e triggers inventariados

- Precedência de `fn_resolve_commercial_price`: **P4** plano `quote_only` → regra explícita `quote_only` → **P1** `fixed_item_price` (exige regra) → **P2** `partner_product_prices` → **P3** catálogo base, com desconto do plano aplicado.
- Constraints: `cpr_buyer_identity_chk`, `cpr_buyer_scope_chk`, `cpr_condition_price_chk` (preço fixo `> 0` obrigatório), `cpr_item_xor_chk`, `cpr_plan_required_chk`, `cpr_pricing_mode_chk`, `cpr_unit_type_chk`, `cpr_validity_chk`, `cpr_volume_chk`, e `cpr_no_overlap` (EXCLUDE gist sobre `daterange`).
- Triggers: `trg_commercial_price_rules_plan_mode` (compatibilidade de modo plano×regra), `trg_commercial_price_rules_producer_inert` (produtor direto inerte até Fase 5), `trg_commercial_price_rules_audit`, `trg_commercial_price_rules_touch`.

### 3.3 Causa-raiz real do "sob consulta" generalizado

`get_partner_catalog_secure` chamava:

```sql
fn_resolve_commercial_price('partner', p_partner_id, NULL, NULL /* p_plan_id */, ...)
```

e o resolvedor retorna, na linha 27-29 de seu corpo:

```sql
IF p_plan_id IS NULL THEN
  RETURN jsonb_build_object('ok',false,'reason_code','PLAN_REQUIRED', ...);
```

Logo `ok=false` para **todos** os itens ⇒ `unidade_preco_principal = 'sob_consulta'`,
independentemente de haver preço configurado. **Carregar `commercial_price_rules`
não resolveria isso** — a chamada continuaria sem plano.

### 3.4 Correção aplicada (migration forward-only, idempotente, guarda de staging)

1. **`public.fn_b2b_resolve_base_unit_price(uuid,uuid,uuid,text,numeric,date)`** — nova função `STABLE SECURITY DEFINER`, `search_path=public`, que reproduz **literalmente** a aritmética de preço-base já existente no resolvedor canônico (P2 `partner_product_prices.preco_tabela` → P3 catálogo, com as mesmas conversões ha/litro/dose/unidade). **Nenhuma constante nova.** Retorna `ITEM_WITHOUT_PRICE` quando não há preço — nunca zero.
2. **`get_partner_catalog_secure`** passa a usar essa função para a vitrine: `preco_tabela = preco_parceiro = preço-base canônico`, `desconto_percentual = 0`, e o desconto do plano continua sendo aplicado **exclusivamente** em simulação/pedido, via `fn_resolve_commercial_price`, preservando a paridade autoritativa. Itens sem preço permanecem `sob_consulta`.
3. Guardas preservadas: `parceiro_b2b_tecnico` continua recebendo `forbidden_financial_terms`; `forbidden_partner` para cruzamento; `partner_not_found` para parceiro inativo.
4. ACL da nova função: `REVOKE ALL` de `PUBLIC`, `anon`, `authenticated`; `GRANT EXECUTE` apenas a `service_role` (é chamada dentro de um `SECURITY DEFINER`).

**Decisão fundamentada de não criar matriz bootstrap:** com os 8 planos em
`discount_from_base`, linhas em `commercial_price_rules` com esse modo têm
`condition_price` obrigatoriamente `NULL` (constraint `cpr_condition_price_chk`) e
**não alteram nenhum preço resolvido**. Criá-las seria ruído auditável sem efeito
funcional; criar linhas `fixed_item_price` exigiria inventar preços por
plano×item, o que é expressamente proibido. A matriz permanece vazia por
**decisão documentada**, e o sistema é utilizável sem fixture temporária.

### 3.5 Evidência — catálogo B2B precificado sem fixture

Todos os 16 itens B2B ativos resolvem preço-base > 0 (nenhum `sob_consulta`):

| tipo | código | preço/ha vitrine (R$) | fonte |
|---|---|---|---|
| produto | SOLO-1 | 100,00 | `partner_base_price` |
| produto | SOLO-2 | 100,00 | `partner_base_price` |
| produto | INS-1 | 100,00 | `partner_base_price` |
| produto | INS-2 | 100,00 | `partner_base_price` |
| produto | INO-1 | 100,00 | `partner_base_price` |
| produto | FUNG-1 | 15,00 | `catalog_base_price` |
| produto | SOLB-1 | 50,00 | `catalog_base_price` |
| micro | BAC-2 / BAC-7 / BAC-8 / CON-1 | 15,00 | `catalog_base_price` |
| micro | BAC-3 / BAC-4 / BAC-5 / BAC-6 | 16,00 | `catalog_base_price` |
| micro | BAC-13 | 40,00 | `catalog_base_price` |

Com `cash_7d` (40%), a simulação/pedido resolve, por exemplo, SOLO-1 =
`round(100,00 × (1 − 0,40), 2) = 60,00` — cálculo do resolvedor canônico, mesma
função usada por `create_partner_order_secure`, garantindo paridade
catálogo → simulação → pedido pela **origem comum de preço-base**.

**Ressalva R-A:** a paridade acima está comprovada **por identidade de código**
(mesma aritmética, mesma fonte), não por execução runtime end-to-end com sessão
JWT nesta correção.

---

## 4. Inventário do fluxo financeiro canônico (sem criar nomes paralelos)

Assinaturas exatas encontradas em `public` (via `regprocedure`), a serem usadas
na comprovação pendente — **nenhuma RPC paralela foi criada**:

| Etapa | Assinatura canônica |
|---|---|
| Simulação | `simulate_b2b_payment_plan_secure(uuid,uuid,jsonb,date)` |
| Resolução de carrinho | `fn_resolve_b2b_cart(uuid,uuid,jsonb,date)` |
| Hash autoritativo | `fn_b2b_cart_hash(uuid,uuid,jsonb,numeric)` |
| Criação de pedido | `create_partner_order_secure(uuid,text,jsonb,date,uuid,date,integer,text,text)` |
| Conversão simulação→pedido | `convert_partner_simulation_to_order_secure(uuid,text,uuid,date,integer,boolean)` |
| Aprovação de pedido | `approve_partner_order(uuid,text,date)` |
| Rejeição de pedido | `reject_partner_order(uuid,text)` |
| Aprovação de condições | `approve_b2b_payment_terms_secure(uuid,text)` |
| Rejeição de condições | `reject_b2b_payment_terms_secure(uuid,text)` |
| Solicitação de ajuste | `request_b2b_payment_terms_adjustment_secure(uuid,text)` |
| Nota/observação | `add_b2b_payment_terms_note_secure(uuid,text)` |
| Crédito | `approve_b2b_credit(uuid,text)`, `rpc_b2b_credit_exposure(uuid,numeric,uuid)`, `rpc_b2b_partner_credit(uuid)` |
| Recebível | `generate_b2b_receivable_secure(uuid)` → `generate_b2b_receivable_secure_impl(uuid)` |
| Cancelamento de recebível | `cancel_b2b_receivable_secure(uuid,text)`, `rpc_cancel_accounts_receivable(uuid,text)` |
| Recebimento/conciliação | `rpc_register_receivable_payment(uuid,jsonb)` — **existe**; caminho reversível a comprovar |
| Parcelas | `fn_generate_receivable_installments()`, `fn_recalc_receivable_installment()` (triggers) |
| Elegibilidade de plano | `fn_b2b_plan_selectable(uuid,timestamptz)`, `tg_b2b_enforce_plan_selectable()`, `rpc_b2b_list_selectable_payment_plans()` |

Gates server-side já existentes mapeados nos caminhos operacionais:
`tg_partner_orders_credit_guard`, `tg_sync_b2b_financial_status`,
`tg_auto_b2b_receivable`, `tg_block_partner_order_edit_after_op`,
`tg_block_partner_order_items_after_op`, `tg_block_partner_order_delete`,
`tg_partner_orders_require_items`, `trg_os_sync_partner_order_fn`,
`trg_entrega_sync_partner_order_fn`, `trg_partner_order_to_planning_fn`,
`fn_generate_receivable_from_entrega(uuid,jsonb)`.

**Ressalva R-B:** o inventário está completo; a **execução comprobatória** dos
itens 4, 5, 6 e 7 do escopo **não foi realizada** — ver §7.

---

## 5. Limpeza e resíduos

- `public.partner_orders`: **0 linhas** (nenhum pedido de probe residual da Fase 7).
- `public.commercial_price_rules`: **0 linhas** (nenhuma fixture temporária remanescente — a fixture de preço criada no commit `1e8f0a9c` foi efetivamente removida).
- Nenhum usuário `f7probe-*@arbio-staging.invalid` criado nesta correção.
- Harness, senhas e UUIDs permanecem fora de `supabase/migrations`; artefatos operacionais em `restoration/motor-b2b-fase7-correcao/`.

## 6. Rollback e promoção futura

- `restoration/motor-b2b-fase7-correcao/rollback-forward-safe.sql`: rollback **forward-safe**, com guarda de staging, que **não apaga dados**, não remove preços legítimos e contém pós-condição que **aborta** se o rollback reabrir `EXECUTE` para `PUBLIC`/`anon` nas funções sensíveis.
- Pacote de promoção futura: a migration desta correção é idempotente e
  parametrizada apenas pelo marker de ambiente; para promoção a produção basta
  substituir a guarda pelo `project_ref` alvo, **sob autorização humana
  explícita**. **Não aplicada em produção.**

---

## 7. RESSALVAS ABERTAS — o que NÃO foi comprovado

Estas pendências impedem `APTO PARA PROMOÇÃO CONTROLADA` e devem ser executadas
antes do gate final. Nenhuma delas está marcada como PASS.

| ID | Item do escopo | Estado |
|---|---|---|
| **P1** | Fluxo feliz A–G: simulação → pedido → aprovação → recebível → parcelas, com sessões JWT reais | **NÃO EXECUTADO** |
| **P2** | Vínculo pedido↔recebível, valor total, vencimentos, juros/desconto, soma de parcelas, arredondamento | **NÃO EXECUTADO** |
| **P3** | Rejeição e solicitação de ajuste com motivo/auditoria; bloqueio subsequente de recebível/produção/faturamento | **NÃO EXECUTADO** |
| **P4** | Negativos: técnico/produtor/parceiro/anon impedidos de aprovar/rejeitar/ajustar/gerar recebível | **NÃO EXECUTADO** (apenas ACL estática auditada) |
| **P5** | Gates server-side por caminho (produção, OS, entrega, fiscal, faturamento, recebível), incluindo inserts diretos e Edge Functions | **INVENTARIADO, NÃO PROVADO** |
| **P6** | Idempotência concorrente com a **mesma** chave, mesmo parceiro/carrinho/hash, em duas sessões simultâneas | **NÃO EXECUTADO** |
| **P7** | Mesma chave com payload divergente ⇒ conflito rejeitado | **NÃO EXECUTADO** |
| **P8** | Prova concorrente equivalente na geração de recebível | **NÃO EXECUTADO** |
| **P9** | RLS runtime com identidades efêmeras (parceiro A×B, técnico, produtor, produtor direto `partner_id NULL`, financeiro/gestor/admin, sem papel, anon) | **NÃO EXECUTADO** nesta correção |
| **P10** | Caminho reversível de recebimento/conciliação (`rpc_register_receivable_payment`) | **NÃO EXECUTADO** |
| **P11** | Divergência SINIEF 49 remanescente: relacionamento `fiscal_stock_loss_contexts.lote_id → lotes.id` ausente em `types.ts` | **ABERTO** (severidade baixa, não bloqueia B2B) |

**Motivo da não execução:** esta correção operou sem acesso `psql` direto no
sandbox (`PGHOST` ausente), o que impede abrir sessões JWT simultâneas e
harnesses transacionais de concorrência; e o orçamento de 30 créditos foi
consumido no diagnóstico de causa-raiz, na correção do catálogo e na restauração
do rigor de testes. **Parada em checkpoint seguro**, conforme instruído.

---

## 8. Arquivos e migrations desta correção

| Arquivo | Natureza |
|---|---|
| migration `fn_b2b_resolve_base_unit_price` + `get_partner_catalog_secure` | forward-only, idempotente, guarda de staging |
| `src/test/fiscal/sinief49/staging/verifier.test.ts` | rigor restaurado (`FAIL` exato) |
| `restoration/motor-b2b-fase7-correcao/rollback-forward-safe.sql` | rollback forward-safe |
| `docs/motor-b2b-fase7-certificacao-final.md` | reescrito integralmente |

## 9. Riscos

- **Alto:** promoção sem P1–P9 comprovados — o fluxo financeiro B2B nunca foi executado ponta a ponta em staging.
- **Médio:** `preco_tabela = 100,00` em `partner_product_prices` sobrepõe os valores de catálogo (83,00/98,00 em SOLO-1/SOLO-2). É dado configurado, **não** foi alterado; requer confirmação do time comercial se é intencional.
- **Baixo:** P11 (relacionamento SINIEF 49 em `types.ts`).
