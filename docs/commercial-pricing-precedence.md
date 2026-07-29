# Precedência Canônica de Preços — Motor Comercial B2B (AR Bio)

Status: **DECISÃO FORMALIZADA** — Fase 0.1 (pré-Fase 1)
Ambiente de referência: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não foi acessada.

Este documento é a fonte única de verdade para resolução de preço no motor
unificado. Nenhuma camada de frontend escolhe a fonte do preço: a decisão é
sempre server-side, dentro das RPCs `simulate_b2b_payment_plan_secure` e
`create_partner_order_secure`, e o resultado é gravado em snapshot no pedido.

---

## 1. Campo de controle: `pricing_mode`

| pricing_mode          | Significado                                                     |
| --------------------- | --------------------------------------------------------------- |
| `fixed_item_price`    | Preço fixo negociado por condição comercial (valor final)        |
| `discount_from_base`  | Preço-base × desconto do plano comercial                         |
| `quote_only`          | Sob consulta — sem preço definitivo                              |

`price_source` é o campo de auditoria gravado no item e no snapshot da condição.

---

## 2. Prioridades

### PRIORIDADE 1 — Preço fixo por condição (`fixed_item_price`)

Aplica-se quando existe preço **ativo e vigente** para a chave completa:
`comprador + plano + item + unidade_medida + volume_ml`.

- usar `condition_price` como valor final do item;
- **não** aplicar `commercial_payment_plans.discount_percent`;
- **não** aplicar `partner_product_prices.desconto_percentual`;
- **não** usar `partner_product_prices.preco_final`;
- `price_source = condition_fixed_price`.

### PRIORIDADE 2 — Preço-base do parceiro (`discount_from_base`)

Aplica-se quando existe `partner_product_prices.preco_tabela` válido (> 0, `ativo = true`).

- base = `preco_tabela`;
- aplicar **somente** `commercial_payment_plans.discount_percent`;
- `price_source = partner_base_price`.

```
condition_price = round(base_price * (1 - plan_discount_percent / 100), 2)
```

### PRIORIDADE 3 — Preço-base do catálogo (`catalog_base_price`)

Quando não há preço-base específico do parceiro, usar o preço canônico de
`produtos` / `microrganismos`, respeitando a unidade solicitada:

| unidade   | base                                                                 |
| --------- | -------------------------------------------------------------------- |
| `hectare` | `valor_ha_brl` ou `(dose_ml_ha / 100) * valor_dose_brl`               |
| `litro`   | `valor_litro_brl` ou `valor_dose_brl * 10`                            |
| `dose`    | `valor_dose_brl` ou `valor_litro_brl / 10`                            |
| `unidade` | `(volume_ml / 1000) * valor_litro_brl` (volume comercial)             |

- aplicar apenas o desconto do plano (mesma fórmula da Prioridade 2);
- `price_source = catalog_base_price`.

### PRIORIDADE 4 — Sob consulta (`quote_only`)

- não gerar preço definitivo;
- não aplicar desconto;
- não criar contas a receber;
- não liberar produção;
- `price_source = quote_only`;
- pedido segue para `aguardando_cotacao`.

---

## 3. Regras invioláveis

1. Nunca aplicar preço fixo **e** desconto simultaneamente.
2. Nunca acumular desconto do parceiro com desconto do plano.
3. `partner_product_prices.preco_final` e `partner_product_prices.desconto_percentual`
   passam a ser **campos legados de transição**: continuam existindo, continuam
   sendo gravados por telas antigas, mas **não participam do cálculo**.
4. Não remover esses campos nem as colunas correlatas.
5. Nunca permitir fallback para zero: se nenhuma prioridade resolver um valor
   `> 0`, a RPC deve falhar com `price_unavailable` (ou encaminhar para
   `quote_only` quando o plano assim determinar).
6. O frontend não escolhe a fonte do preço, apenas exibe `price_source`.
7. Pedidos históricos **não** são recalculados — o snapshot já gravado prevalece.

---

## 4. Exemplos numéricos

### Exemplo A — Prioridade 1 (preço fixo)

- Preço fixo da condição: R$ 82,00/ha; plano com `discount_percent = 30`.
- Resultado: **R$ 82,00/ha**. O desconto de 30% é ignorado.
- `price_source = condition_fixed_price`.

### Exemplo B — Prioridade 2 (base do parceiro)

- `preco_tabela` = R$ 120,00; plano `discount_percent = 25`.
- `round(120,00 * (1 - 0,25), 2)` = **R$ 90,00**.
- Mesmo que `partner_product_prices.desconto_percentual = 10`, ele é ignorado.
- `price_source = partner_base_price`.

### Exemplo C — Prioridade 3 (catálogo, unidade `unidade`)

- Produto sem preço de parceiro; `valor_litro_brl` = R$ 300,00; item de 500 ml.
- Base: `(500 / 1000) * 300,00` = R$ 150,00; plano `discount_percent = 20`.
- `round(150,00 * 0,80, 2)` = **R$ 120,00**.
- `price_source = catalog_base_price`.

### Exemplo D — Prioridade 4 (sob consulta)

- Plano `quote_only`: nenhum valor gravado; pedido em `aguardando_cotacao`;
  nenhum `partner_order_payment_schedule` e nenhum recebível são criados.

### Exemplo E — Cascata de fallback

1. Existe preço fixo vigente? → **A**.
2. Não. Existe `preco_tabela` ativo? → **B**.
3. Não. Catálogo resolve base > 0? → **C**.
4. Não. Plano é `quote_only`? → **D**. Caso contrário: erro `price_unavailable`
   (nunca zero, nunca preço parcial).

---

## 5. Situação atual (pré-Fase 1)

Confirmado em staging: `create_partner_order_secure` e
`simulate_b2b_payment_plan_secure` leem apenas `partner_product_prices.preco_tabela`
e aplicam `commercial_payment_plans.discount_percent`, ou seja, hoje o motor opera
de fato apenas na **Prioridade 2/3**. As Prioridades 1 e 4 e o campo `price_source`
serão introduzidos na Fase 1. `desconto_padrao` do parceiro é carregado
(`v_partner_desconto`) mas não participa do cálculo — comportamento compatível
com esta decisão.
