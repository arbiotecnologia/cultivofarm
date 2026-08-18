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
