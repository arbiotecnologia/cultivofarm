# H9-D-L3 (retificação 2) — Integridade de `received_amount` em `accounts_receivable_installments`

Ambiente: homologação `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não foi acessada.
Consulta determinística, sem PII (nenhum nome, documento ou identificador de cliente é exibido).

## Conclusão

**0 divergências reais. As 58 parcelas reconciliam.** Não há corrupção de dado e não há
saneamento a executar. Nenhum valor financeiro foi alterado nesta rodada.

A contagem anterior de "10 de 58" era **artefato de método**: comparava `received_amount` com a
soma de pagamentos filtrada por `is_reversal = false`, ignorando o par de estorno correspondente.
Esse filtro **não** é a verdade contábil corrente e não deve ser usado para reconciliação.

## Reconciliação (consulta única, sem PII)

```
parcelas = 58 | div_liquido = 0 | div_bruto = 10 | estornos = 10 | estornos_sem_par = 0
```

| Critério de comparação | Parcelas divergentes | Vale como reconciliação? |
| --- | --- | --- |
| `received_amount` vs soma **líquida** (originais + estornos) | **0 de 58** | **Sim — critério correto** |
| `received_amount` vs soma **bruta** (`is_reversal = false`) | 10 de 58 | Não — ignora o estorno pareado |

### As dez parcelas em questão

| status | original_amount | received_amount | pagamento original | estorno | líquido | com `reversed_payment_id` |
| --- | --- | --- | --- | --- | --- | --- |
| OVERDUE | 1000.00 | 0.00 | +300.00 | -300.00 | 0.00 | sim |

As dez linhas têm exatamente estes valores; desconto, juros e multa são `0.00` em todas.
Somatórios do conjunto: 40 lançamentos originais = `15450.00`; 10 estornos = `-3000.00`;
**todos** os estornos têm `reversed_payment_id` preenchido (`estornos_sem_par = 0`).

## Contrato auditado das rotinas de pagamento e estorno

`public.fn_reverse_payment(_payment_id uuid, _kind text, _reason text)` — `SECURITY DEFINER`,
`search_path` fixo em `public`:

- exige sessão (`auth.uid()`) e `is_financial_staff`, sob pena de `insufficient_privilege`;
- exige motivo com no mínimo 5 caracteres;
- serializa por `pg_advisory_xact_lock('fin_reverse:<kind>:<payment_id>')`;
- recusa estornar um registro de estorno e recusa parcela `CANCELED`;
- é **idempotente** por `reversed_payment_id`: replay devolve o mesmo id, e motivo divergente
  levanta `FIN_IDEMPOTENCY_CONFLICT`;
- insere uma linha **espelho append-only** com `amount_received`, `discount_amount`,
  `interest_amount` e `penalty_amount` negados, `is_reversal = true` e `reversed_payment_id`
  apontando para a baixa original. Nada é apagado ou sobrescrito.

`public.fn_recalc_receivable_installment()` — trigger `trg_recalc_ar_inst` em
`public.receivable_payments` (INSERT/UPDATE/DELETE) recalcula:

```
received_amount  = SUM(amount_received)   -- todas as linhas, estorno incluso (valor negativo)
discount_amount  = SUM(discount_amount)
interest_amount  = SUM(interest_amount)
penalty_amount   = SUM(penalty_amount)
status           = PAID | PARTIAL | OVERDUE | OPEN
```

Ou seja: por contrato, **`received_amount` é líquido de estornos e está correto**.
O caráter append-only é garantido pelos gatilhos `trg_h6_rp_append_only` e `trg_audit_rp`.

## Alterações de dados nesta rodada

**Nenhuma.** Não houve `UPDATE`, `INSERT` ou `DELETE` em dados financeiros.

## Risco residual — de relatório, não de dado

As funções de regime caixa (`get_report_monthly_financial`, `get_report_customer_statement`) e
`fn_financial_inconsistencies` somam `receivable_payments` com `is_reversal = false`, o que
**superestima o recebido em `3000.00` no conjunto atual**. O contrato dessas chaves foi preservado
nesta rodada; o extrato passou a expor `received_net_of_reversals` para tornar a diferença
observável sem quebrar consumidores. A uniformização do regime caixa em todos os relatórios é
proposta como próximo passo, fora do escopo autorizado.
