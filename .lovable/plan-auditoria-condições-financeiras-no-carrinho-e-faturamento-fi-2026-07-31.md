# Auditoria — Condições financeiras no carrinho e faturamento fiscal

Ambiente auditado: staging `ikaauvsflpmamgxmkhoq` (somente leitura). Produção `navfzbwgwzruipouyfnk` não foi acessada. Nada implementado, publicado ou migrado.

## 1. Diagnóstico direto da dúvida do usuário

A página existe, mas **não está no menu**. Evidências:

- Rota registrada: `src/App.tsx:549` → `/comercial/condicoes-pagamento` (`CommercialPaymentPlansPage`).
- Permissões definidas: `src/lib/permissions.ts:228` → administrador/financeiro/gestor_comercial = `rw`.
- A página tem duas abas (`src/pages/comercial/CommercialPaymentPlansPage.tsx:219-224`): "Condições de pagamento" e **"Matriz de preços"** (`src/components/comercial/MatrizPrecosTab.tsx`), que é exatamente a matriz Produto/Microrganismo × condição (à vista, prazo, safra, `quote_only`).
- **Nenhuma entrada em `src/config/navigation.ts`** para essa rota (grep por `condicoes-pagamento` retorna apenas App.tsx e permissions.ts). Sem item de menu e sem `searchKeywords`, a tela é inalcançável pela navegação e pela busca global — só por URL direta.

Segundo achado: a matriz está **vazia**. `commercial_price_rules` = 0 linhas (0 ativas) no staging, contra 8 planos em `commercial_payment_plans` e 5 linhas em `partner_product_prices`. Ou seja, mesmo abrindo a tela, nenhuma condição por item está configurada hoje.

## 2. Estado efetivo do modelo de dados

| Objeto citado no pedido | Existe no staging | Observação |
|---|---|---|
| `commercial_payment_plans` | Sim (8 linhas, RLS on, 0 policies) | leitura só via RPC `rpc_b2b_list_selectable_payment_plans` |
| `commercial_price_rules` | Sim (RLS on, 2 policies, **0 linhas**) | é a matriz canônica item × condição |
| `partner_product_prices` | Sim (5 linhas, 5 policies) | preço base por parceiro |
| `partner_financial_settings` | Sim | crédito/limites/forma padrão |
| `commercial_payment_plan_assignments` | **Não existe** | nunca criada |
| `commercial_condition_item_prices` | **Não existe** | função coberta por `commercial_price_rules` |

`commercial_payment_plans` com RLS habilitada e **zero policies** é intencional (Fase 6 revogou `SELECT` de `authenticated`), mas significa que toda leitura depende de RPC `SECURITY DEFINER` — qualquer tela nova que consulte a tabela direto retorna vazio silencioso.

## 3. Cadeia de valor rastreada

Catálogo → carrinho → plano → preço → pedido → recebível:

- `get_partner_catalog_secure` → `fn_b2b_resolve_base_unit_price(partner, product, micro, unit_type, volume_ml, ref_date)`.
- Resolução por condição: `fn_resolve_commercial_price(buyer_scope, partner, customer, plan, product, micro, unit_type, volume_ml, ref_date)` → consome `commercial_price_rules` (`fixed_item_price` | `discount_from_base` | `quote_only`).
- Carrinho autoritativo: `fn_resolve_b2b_cart` + juros `fn_b2b_apply_interest` + assinatura `fn_b2b_cart_hash`.
- Checkout: `create_partner_order_secure` valida `p_expected_cart_hash`, `p_idempotency_key` e `request_fingerprint` (reqfp_v2), com `partner_order_idempotency` + advisory lock. Frontend em `src/hooks/useCreatePartnerOrder.ts` e `src/pages/portal-parceiro/NovoPedido.tsx`.
- Crédito: `fn_b2b_credit_exposure` / `rpc_b2b_credit_exposure`.
- Aprovação: `approve_partner_order`, `approve_b2b_payment_terms_secure`, `reject_b2b_payment_terms_secure`, `respond_b2b_order_quote_secure`.
- Recebível: `generate_b2b_receivable_secure` → `_impl`, com trava de duplicidade por `partner_order_financial_links` (retorna `duplicado:true` em vez de criar segundo título) e parcelas via `fn_generate_receivable_installments`.

Paridade de preço/unidade/volume e idempotência já foram provadas no ciclo Fase 7 (harness de paridade, 15/15) — não re-executado aqui por ser somente leitura.

## 4. Fiscal — lacuna estrutural confirmada

- Em `generate_b2b_receivable_secure_impl`, o `INSERT INTO public.accounts_receivable` grava **literalmente** `fiscal_invoice_required = false` e `fiscal_invoice_status = 'NOT_REQUIRED'`. Não há parâmetro, nem leitura de `partner_financial_settings`, nem regra por parceiro/UF/operação. **Resposta ao item 7: sim, todo pedido B2B nasce como "sem obrigação fiscal", o que permite divergência fiscal-financeira permanente e silenciosa.**
- `fiscal_invoices` liga-se ao financeiro apenas por `receivable_id`. **Não existe coluna de vínculo com `partner_orders` nem com `entregas`**, então a cadeia pedido → entrega → nota não é rastreável no banco; só pedido → recebível → nota.
- Não há gatilho/evento que autorize faturar a partir de entrega confirmada para o fluxo B2B (o caminho existente é `fn_generate_receivable_from_entrega`, usado no fluxo produtor, separado do B2B).
- Fonte de CFOP/NCM/CST/CSOSN: `product_fiscal_profiles`, `service_fiscal_profiles`, `customer_fiscal_profiles`, `company_fiscal_settings`; itens e snapshots em `fiscal_invoice_items` / `fiscal_invoice_item_references`, com `fiscal_invoice_items_state_guard` e imutabilidade SINIEF. **Nenhum desses caminhos é alimentado por `partner_order_items`** — não há projeção de item de pedido B2B para item fiscal.
- Volume de dados em staging: `partner_orders` = 0, `accounts_receivable` = 0, `fiscal_invoices` = 0. Portanto nenhum teste runtime end-to-end fiscal-financeiro foi exercitado com dado real neste ambiente.

Telas fiscais existentes e no menu: `/fiscal/prontidao`, `/configuracoes/fiscal/produtos|servicos|clientes`, `/fiscal/documentos`, `/fiscal/reconciliacao`, `/financeiro/notas-fiscais` (várias atrás de feature flags).

## 5. Lacunas por severidade

**Crítica**
1. `fiscal_invoice_required=false` fixo no recebível B2B → divergência fiscal-financeira estrutural.
2. Ausência de vínculo `partner_order`/`entrega` ↔ `fiscal_invoices` → impossível provar nota única por pedido/entrega.

**Alta**
3. `/comercial/condicoes-pagamento` fora de `navigation.ts` → matriz inacessível na prática.
4. `commercial_price_rules` vazia → resolução por condição sem dados; carrinho depende só do preço base.

**Média**
5. Sem projeção `partner_order_items` → `fiscal_invoice_items` (CFOP/NCM/unidade/quantidade/desconto).
6. `commercial_payment_plans` sem policies: qualquer consulta direta futura falha em silêncio.

**Baixa**
7. Ausência de testes runtime fiscais B2B (nenhum pedido/nota em staging para regressão).

## 6. Correções mínimas recomendadas (fases seguras, staging)

- **Fase A (UI, sem banco):** registrar o item de menu de `/comercial/condicoes-pagamento` em `src/config/navigation.ts` (seção Comercial, com `searchKeywords`), respeitando as permissões já existentes. Verificar estados loading/vazio/erro/permissão e desktop/mobile na Matriz de preços. Rollback: remover a entrada.
- **Fase B (dados, staging):** popular `commercial_price_rules` para os itens ativos × condições, via a própria UI. Rollback: `active=false` nas regras criadas.
- **Fase C (banco, migration):** tornar `fiscal_invoice_required` derivado — parâmetro na RPC + default por `partner_financial_settings` — sem alterar títulos históricos. Rollback forward-safe restaurando a versão anterior da função.
- **Fase D (banco, migration):** adicionar vínculo `partner_order_id` (e opcionalmente `entrega_id`) em `fiscal_invoices` com índice único parcial para impedir dupla nota, mantendo `receivable_id`. Rollback: drop de coluna/índice novos.
- **Fase E:** projeção de `partner_order_items` para itens fiscais e harness runtime cobrindo emissão parcial/total, cancelamento, rejeição e reabertura.

Nenhuma fase cria fluxo paralelo; todas estendem os objetos já canônicos e preservam pedidos históricos.

## 7. Critérios de aceite e matriz de testes

Aceite: menu exibe a matriz para os 3 perfis autorizados e a nega aos demais; regra por condição altera o preço resolvido no carrinho e o `cart_hash` acompanha; recebível B2B reflete obrigação fiscal correta; um pedido gera no máximo um recebível e no máximo uma nota; históricos inalterados.

Testes: (a) RBAC por rota nos 3 perfis + 1 negado; (b) paridade catálogo/carrinho/simulação/checkout por condição, incluindo `quote_only` bloqueando checkout; (c) idempotência de checkout com mesma chave e payload divergente; (d) duplicidade de recebível; (e) unicidade de nota por pedido; (f) arredondamento em parcelas; (g) cancelamento/rejeição liberando crédito.

## 8. Status

**BLOQUEADO para faturamento fiscal B2B** (lacunas críticas 1 e 2). **APTO COM RESSALVAS para condições comerciais**: motor e UI existem e estão certificados, faltando apenas exposição no menu e carga de regras.
