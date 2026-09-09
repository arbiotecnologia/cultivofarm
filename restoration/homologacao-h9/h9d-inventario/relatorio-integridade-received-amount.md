# H9-D-L3 (retificação 2) — Integridade de `received_amount` em `accounts_receivable_installments`

Ambiente: homologação `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não foi acessada.
Consulta determinística, sem PII (nenhum nome, documento ou identificador de cliente é exibido).

## Universo

| Métrica | Valor |
| --- | --- |
| Parcelas de recebimento | 58 |
| Parcelas com pelo menos um estorno | 10 |
| Pagamentos não revertidos (`is_reversal = false`) | 40 linhas, soma `15450.00` |
| Estornos (`is_reversal = true`) | 10 linhas, soma `-3000.00` |

## Conclusão do diagnóstico

| Critério de comparação | Parcelas divergentes |
| --- | --- |
| `received_amount` vs soma **bruta** (`is_reversal = false`) | **10 de 58** |
| `received_amount` vs soma **líquida** (todas as linhas, estornos inclusive) | **0 de 58** |

As 10 divergências relatadas não são corrupção de dado. Elas aparecem apenas quando a
comparação ignora as linhas de estorno. O padrão é idêntico nas 10 parcelas:

| status | original_amount | received_amount | pagamentos não revertidos | estornos | líquido | diferença vs bruto |
| --- | --- | --- | --- | --- | --- | --- |
| OVERDUE | 1000.00 | 0.00 | 300.00 | -300.00 | 0.00 | -300.00 |

(as dez linhas têm exatamente estes valores; nenhuma outra combinação foi encontrada)

Desconto, juros e multa são `0.00` em todas as dez.

## Origem autoritativa da coluna denormalizada

`public.fn_recalc_receivable_installment()` — trigger `trg_recalc_ar_inst` em
`public.receivable_payments` (INSERT/UPDATE/DELETE). Ela recalcula:

```
received_amount  = SUM(amount_received)   -- todas as linhas, estorno incluso (valor negativo)
discount_amount  = SUM(discount_amount)
interest_amount  = SUM(interest_amount)
penalty_amount   = SUM(penalty_amount)
status           = PAID | PARTIAL | OVERDUE | OPEN
```

Ou seja: **`received_amount` é, por contrato vigente, líquido de estornos e está correto**.
Estornos são gravados como linhas append-only com `is_reversal = true` e `amount_received`
negativo (garantido pelos gatilhos `trg_h6_rp_append_only` e `trg_audit_rp`).

## Alterações de dados nesta rodada

**Nenhuma.** Não houve UPDATE, INSERT ou DELETE em dados financeiros. A origem correta é
matematicamente inequívoca e já está aplicada na coluna denormalizada, portanto não existe
saneamento a executar.

## Risco residual documentado

Os relatórios financeiros de regime caixa (`get_report_monthly_financial`,
`get_report_customer_statement`) somam `receivable_payments` com `is_reversal = false`, o que
**superestima o recebido em `3000.00` no conjunto atual** por ignorar os estornos do período.
O contrato dessas chaves foi preservado nesta rodada; a retificação expõe a chave adicional
`received_net_of_reversals` no extrato para tornar a diferença visível sem quebrar consumidores.
A uniformização do regime caixa em todos os relatórios é proposta como próximo passo (fora do
escopo autorizado desta rodada).
