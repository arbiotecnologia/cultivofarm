# B2 — Pedido por embalagem inteira (sólidos e misto) — `B2B_PARTNER_PACKAGING_ORDER_V1`

Etapa B2 do plano original de nove etapas (`scripts/b2b-partner-order-arbio-20261106/README.md`).
Escopo de negócio: AR Bio `007bb519-…` e parceiro fictício `7e52de9a-…`. FSF fora das fixtures.
**Estado: CANDIDATO. NÃO APLICADO. Nada hospedado foi escrito.**

## Artefatos
- `captured/` — 11 corpos LIVE lidos read-only de `swzpzcwiasxmjutrmvkm` (md5 no nome).
- `generate.py` → `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review`, `generated-md5.json`.
- `test-local-pg.py` → `evidence-local-pg.json` (PostgreSQL 17 descartável; 74/74 PASS).

## O que muda (só no install)
- `get_partner_packaging_offers_secure(p_partner_id)`: leitor via `b2b_partner_catalog_reader` + itens de `get_partner_catalog_secure`; embalagens ativas/vigentes do vendedor com unidade kg/g/ml/l e exatamente um preço ativo.
- `fn_resolve_b2b_cart`: ramo de embalagem (`platform_private.b2b_packaging_line`); líquido inalterado.
- `fn_b2b_cart_hash`: sufixo da embalagem só nas linhas de embalagem (hash líquido idêntico).
- `create_partner_order_secure`: impressão inclui `packaging_id`, trava FOR SHARE de embalagem/preço, grava snapshot.
- `partner_order_items`: 6 colunas de snapshot (identidade, código, versão, peso, unidade, preço da embalagem), CHECK e gatilho de imutabilidade.
- Simulação e cotação: corpos inalterados (usam o resolvedor; cotação altera só preço).

## Decisão comercial pendente (não inventada como regra)
A condição `discount_from_base` aplica o desconto do plano sobre o preço base da embalagem; `quote_only` gera cotação; `fixed_item_price` é recusado (não há preço fixo por embalagem). **Confirmar com o proprietário antes da instalação.**

## Limites
- Costuras sintéticas declaradas em `evidence-local-pg.json` (auth.uid por GUC, papéis mínimos, crédito sem limite, juros 0, gatilhos de partner_orders omitidos, exclusão GiST omitida). Não prova JWT/RLS/Storage hospedados.
- Referência sólida `161758e3…` e embalagem `366e6f04…` não foram lidas nem usadas; uso só após revisão/habilitação do auditor.
- Modelos (favoritos) não guardam embalagens; rascunho de renovação também não.
- Meio de pagamento (B3) e recebível por NF (B4) seguem BLOCKED; fiscal/cobrança/envios OFF.
