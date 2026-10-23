# C2-ORD — carrinho do cliente comercial no fluxo canônico (REVIEW, inativo)

Autoria: preparado pelo agente Lovable; leitura hosted somente `SELECT`/`pg_get_functiondef`.
Nada aplicado, publicado ou implantado. Nenhum dado financeiro fictício emitido.

## Causas (teste4, `mode=commercial_owner`)
1. **Frontend**: `PortalParceiroLayout` monta `OwnerCatalog` (somente leitura) em `/portal-parceiro/catalogo`;
   `NovoPedido` (carrinho canônico) nunca é montado para commercial_owner. Mensagem
   "Simulações, arquivos e alterações de pedidos indisponíveis" é intencional (C2-CAT).
2. **Sem capacidade server-side de escrita**: a projeção `b2b_commercial_partner_projection` expõe só
   `capabilities` (C2_CAT_V1) e `finance_capabilities`; não há sinal de writer — abrir por menu seria bypass.
3. **Bloqueio backend do título (pré-requisito NÃO atendido)**: `generate_b2b_receivable_secure_impl`
   deriva o tenant do título por `organizations.partner_account_id = partner_id`. Para teste4:
   `org_by_partner=0`, `has_owner=true` ⇒ `B2B_FINANCIAL_TENANT_AMBIGUOUS`. Como `tg_auto_b2b_receivable`
   engole a exceção e grava `financeiro_auto_falhou`, o pedido seria aprovado **sem título**.
4. Dados de teste4: 0 pedidos, 0 links financeiros, 0 atribuições de plano (`commercial_payment_plan_assignments`).
   Sem plano selecionável o `create` falha com `plan_not_selectable` — configuração comercial, não código.

Create/simulate já aceitam o dono comercial: `assert_b2b_partner_scope` (b2b_actor_scope corrigido) e
`get_user_partner_id()` exigem `pu.tenant_id = pa.commercial_owner_organization_id`. Técnico bloqueado
(`forbidden_financial_terms` / `partner_tech_cannot_create_order`).

## Correção mínima
- `src`: `ownerOrderAccess.ts` (contrato `C2_OWNER_ORDER_V1`, fail-closed), `useMyPartner` lê
  `order_capabilities` só para `parceiro_b2b`; layout monta o `Outlet` (NovoPedido canônico) em
  `/catalogo` **somente** com capacidade + entitlement `pedidos_b2b`. Hoje o servidor não envia o campo ⇒
  writer fechado, comportamento publicado inalterado.
- `candidate.sql.review`: substituições únicas hash-guarded (impl `60be0fb3…`, projeção `136b4d59…`);
  tenant do título = tenant dono quando não há org própria (ambiguidade continua fail-closed);
  `order_create` = mesmas provas de catálogo + gestor B2B não técnico + `pedidos_b2b`.
- `rollback.sql.review`: remove os dois fragmentos e reconfere os hashes originais; não apaga títulos.

## Matriz demanda → pedido → financeiro
| Etapa | RPC/gatilho | Estado | Financeiro |
|---|---|---|---|
| Carrinho | `simulate_b2b_payment_plan_secure` | sem escrita | devolve `cart_hash` autoritativo |
| Envio | `create_partner_order_secure` (hash + idempotência `partner_id+key`, fingerprint reqfp_v2) | `em_analise_comercial` / `aguardando_aprovacao_credito` / `aguardando_cotacao` | cria `payment_terms` + `payment_schedule` (snapshot); **nenhum título** |
| Reenvio mesma chave | idem | devolve `result_snapshot` | nada novo; carrinho diferente ⇒ `idempotency_conflict` |
| Aprovação | `approve_partner_order` (admin/gestor_comercial, crédito revalidado com lock) | `aprovado` | **título nasce aqui** se `billing_trigger='na_aprovacao'` (ou em `produzido`/`entregue`) via `tg_auto_b2b_receivable` → `generate_b2b_receivable_secure` |
| Duplicidade | lock `b2b_receivable:<pedido>` + `partner_order_financial_links` | — | segunda chamada devolve `duplicado=true` |
| Parcelas | `trg_ar_gen_installments` a partir do schedule canônico | — | parcelas imutáveis (h6) |
| Cancelamento/estorno | `cancel_b2b_receivable_secure` | — | **FECHADO** (`B2B_FINANCIAL_CONTRACT_UNAVAILABLE`); sem hard-delete |

## Limites
- Sem prova JWT/RLS real; aplicar só após revisão e preflight PASS.
- `financial_categories`/`payment_methods` são escolhidos sem filtro de tenant na impl atual; o gatilho
  `d51_5_validate_tenant_links` pode recusar o título no tenant dono — validar no postflight, não corrigido aqui.
- Pendências antigas, cancelamento/estorno B2B e homologação multiperfil B permanecem abertos.
