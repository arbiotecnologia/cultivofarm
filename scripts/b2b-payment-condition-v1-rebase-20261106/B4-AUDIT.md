> Mantido do pacote superado sem alteração de conteúdo (auditoria somente leitura de 2026-11-06). B4 continua fechado; nada implementado.

# Auditoria B4 — títulos e emissão de NF (somente leitura, 2026-11-06, ref swzpzcwiasxmjutrmvkm)

Nada foi implementado. Corpos completos lidos via `pg_get_functiondef`; md5 entre parênteses.

## Escritores de `accounts_receivable` (todos os corpos com `INSERT INTO accounts_receivable`)
| Rota | EXECUTE | Guardas comprovadas no corpo | Gera título hoje? |
|---|---|---|---|
| `generate_b2b_receivable_secure` (c49cc7cc) → `_impl` (1bdac7fa, só service) | authenticated | `auth.uid` obrigatório; phase1/c2p1 visível; admin/gestor/financeiro (ou trigger); **bloqueia** `internal_origin_snapshot` e `C2_EXTERNAL_ORDER_REQUEST_PENDING_ACCOUNTING_V1` (`C2_ACCOUNTING_PENDING`); lock pedido+advisory; `fn_b2b_order_billing_eligibility` (status aprovado+, sem pendência financeira, sem cotação/sem preço); tenant único; h15 = tenant; settings ativas; `na_entrega` exige entregue p/ externo; categoria RECEITA; meio por **nome** do default sem fallback na validação, mas grava `payment_method = COALESCE(default,'pix')` | **Sim, manualmente**, para pedido aprovado sem snapshot C2 pendente. PB-001036 bloqueado (em análise + C2 pendente). |
| `tg_auto_b2b_receivable` (0f679538) em `partner_orders` | trigger | só se `auto_generate_receivable` e gatilho aprovação/produção/entrega; chama a rota acima | Sim, se configurado; parceiro do teste4 tem `auto_generate_receivable=false`. |
| `fn_generate_receivable_from_entrega` (670ea34d) | authenticated | `is_financial_staff`; entrega `entregue`, cliente, não NOT_BILLABLE; valor canônico; categoria; meio **opcional** do payload; replay por `receivable_id`; `a00_delivery_no_downstream` em AR/AR-parcelas nega dentro do contexto de entrega | Sim, por entrega (origem `DELIVERY`); A2 inativo. |
| `rpc_create_financial_title` (0778b876) | authenticated | `is_financial_staff`; tenant h15; categoria RECEITA ativa; parcelas/somas validadas | Sim, título manual (origem `MANUAL`; 10 existentes). |
| `fn_generate_recurring_title` (b189e44d) | authenticated | `is_financial_staff` quando há ator | Sim, recorrências. |

Barreiras em `accounts_receivable`: `a00_delivery_no_downstream`, `d51_5_validate_tenant_links`, `tenant_organization_guard`,
`trg_h6_ar_snapshot`, `trg_h6d_ar_no_delete`, `trg_saas_gate`, gerador de parcelas `trg_ar_gen_installments`.
`partner_order_financial_links`: `trg_b2b_block_receivable_before_approval` (status aprovado ou posterior).

## Fiscal
- `rpc_fiscal_invoice_apply_authorization_v1` (9c94985d, só service) **não** toca `accounts_receivable` nem chama gerador.
- `rpc_upsert_fiscal_invoice_manual` (8010756f) liga NF a título **existente** (direção inversa à regra nova).
- Nenhum evento fiscal autorizado gera título hoje. Cancelamento: `cancel_b2b_receivable_secure` (service-only),
  `rpc_cancel_accounts_receivable`/`rpc_cancel_financial_installment` (authenticated). Origens legadas por `origin_type`.

## Bloqueios já implantados a preservar
`C2_ACCOUNTING_PENDING`, `B2B_INTERNAL_DOWNSTREAM_UNVERIFIED`, elegibilidade, delivery no-downstream, snapshots H6,
no-delete, tenant guards, gates fiscais/contábeis e envios OFF.

## Plano B4 (não implementado)
Gerador único disparado pela autorização da NF-e/NFS-e, consumindo o snapshot de meio B3, chave = NF, faturamento parcial
limitado ao saldo, datas reais a partir da emissão com calendário selado Paracatu-MG (pacote de parcelas), Price via o
gerador existente (`financial-price-generator-20261029`), e fechamento deny-only das três rotas pré-NF para pedidos B2B.

## Pendência contábil registrada (sem regra inventada)
Cancelamento de NF após pagamento: **sem decisão**. Este pacote não bloqueia nem autoriza cancelamento fiscal novo.
