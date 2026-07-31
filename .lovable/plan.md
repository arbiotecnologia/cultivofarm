# Relatório — Condições financeiras no carrinho e faturamento fiscal

Auditoria somente-leitura em staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` não acessada. Sem novas verificações nesta resposta — conteúdo consolidado da auditoria anterior.

## 1. Rotas e telas existentes

- `/comercial/condicoes-pagamento` (`CommercialPaymentPlansPage`) — abas "Condições de pagamento" e "Matriz de preços" (`MatrizPrecosTab`), que é a matriz Produto/Microrganismo × condição (à vista, prazo, safra, `quote_only`).
- Permissões já definidas: administrador, financeiro, gestor_comercial (rw).
- Entrada de menu: estava ausente em `navigation.ts` (lacuna 3) e foi adicionada na Fase A já executada; as demais lacunas seguem abertas.
- Telas fiscais no menu: `/fiscal/prontidao`, `/fiscal/documentos`, `/fiscal/reconciliacao`, `/configuracoes/fiscal/produtos|servicos|clientes`, `/financeiro/notas-fiscais` (parte atrás de feature flags).

## 2. Evidências de dados (staging)

| Objeto | Estado |
|---|---|
| `commercial_payment_plans` | 8 linhas, RLS on, 0 policies (leitura só via RPC) |
| `commercial_price_rules` | existe, 2 policies, **0 linhas** |
| `partner_product_prices` | 5 linhas |
| `commercial_payment_plan_assignments` / `commercial_condition_item_prices` | **não existem** (função coberta por `commercial_price_rules`) |
| `partner_orders` / `accounts_receivable` / `fiscal_invoices` | 0 linhas cada |

## 3. Cadeia de valor rastreada

Catálogo (`get_partner_catalog_secure` → `fn_b2b_resolve_base_unit_price`) → condição (`fn_resolve_commercial_price` sobre `commercial_price_rules`) → carrinho autoritativo (`fn_resolve_b2b_cart`, `fn_b2b_apply_interest`, `fn_b2b_cart_hash`) → checkout (`create_partner_order_secure` com cart hash, idempotency key e `request_fingerprint`) → crédito (`fn_b2b_credit_exposure`) → aprovação (`approve_partner_order`, `approve_b2b_payment_terms_secure`) → recebível (`generate_b2b_receivable_secure_impl`, trava de duplicidade por `partner_order_financial_links`).

## 4. Status do fluxo fiscal

- `generate_b2b_receivable_secure_impl` grava literalmente `fiscal_invoice_required = false` e `fiscal_invoice_status = 'NOT_REQUIRED'`. Todo pedido B2B nasce "sem obrigação fiscal".
- `fiscal_invoices` liga-se ao financeiro só por `receivable_id`; não há coluna para `partner_orders` nem `entregas` — a cadeia pedido → entrega → nota não é rastreável.
- Não há projeção de `partner_order_items` para `fiscal_invoice_items`; CFOP/NCM/CST vêm de perfis fiscais que o fluxo B2B não alimenta.
- Sem dado real em staging, nenhum teste runtime fiscal-financeiro B2B foi exercitado.

**Status: BLOQUEADO para faturamento fiscal B2B. APTO COM RESSALVAS para condições comerciais** (motor certificado; falta carga de regras).

## 5. Lacunas por severidade

**Crítica**
1. `fiscal_invoice_required=false` fixo no recebível B2B → divergência fiscal-financeira silenciosa.
2. Sem vínculo `partner_order`/`entrega` ↔ `fiscal_invoices` → impossível provar nota única por pedido/entrega.

**Alta**
3. Rota da matriz fora do menu (corrigida na Fase A).
4. `commercial_price_rules` vazia → carrinho depende só do preço base.

**Média**
5. Sem projeção `partner_order_items` → `fiscal_invoice_items`.
6. `commercial_payment_plans` sem policies: consulta direta futura falha em silêncio.

**Baixa**
7. Sem testes runtime fiscais B2B (base vazia em staging).

## 6. Plano mínimo de correção por fases

- **Fase A — UI (concluída):** item de menu para `/comercial/condicoes-pagamento` com `searchKeywords`, respeitando permissões existentes.
- **Fase B — dados (staging):** popular `commercial_price_rules` para itens ativos × condições pela própria UI. Rollback: `active=false`.
- **Fase C — migration:** tornar `fiscal_invoice_required` derivado (parâmetro na RPC + default por `partner_financial_settings`), sem tocar títulos históricos. Rollback forward-safe restaurando a versão anterior da função.
- **Fase D — migration:** adicionar `partner_order_id` (e opcionalmente `entrega_id`) em `fiscal_invoices`, com índice único parcial contra dupla nota, mantendo `receivable_id`.
- **Fase E — projeção e testes:** `partner_order_items` → itens fiscais e harness runtime cobrindo emissão parcial/total, cancelamento, rejeição e reabertura.

## 7. Aceite e testes

Aceite: matriz visível apenas aos 3 perfis autorizados; regra por condição altera o preço resolvido e o `cart_hash`; recebível reflete a obrigação fiscal correta; um pedido gera no máximo um recebível e uma nota; históricos inalterados.

Testes: RBAC por rota; paridade catálogo/carrinho/simulação/checkout por condição (incluindo `quote_only` bloqueando checkout); idempotência com payload divergente; duplicidade de recebível; unicidade de nota por pedido; arredondamento de parcelas; cancelamento/rejeição liberando crédito.
