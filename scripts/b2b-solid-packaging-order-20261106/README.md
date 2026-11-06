# B2 — Pedido por embalagem inteira (sólidos e misto) — `B2B_PARTNER_PACKAGING_ORDER_V1`

Etapa B2 do plano original de nove etapas (`scripts/b2b-partner-order-arbio-20261106/README.md`).
Escopo de negócio: AR Bio `007bb519-…` e parceiro fictício `7e52de9a-…`. FSF fora das fixtures.
**Estado: CANDIDATO. NÃO APLICADO. Nada hospedado foi escrito.**

## Artefatos
- `captured/` — 11 corpos LIVE lidos read-only de `swzpzcwiasxmjutrmvkm` (md5 no nome).
- `generate.py` → `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review`, `generated-md5.json`.
- `test-local-pg.py` → `evidence-local-pg.json` (PostgreSQL 17 descartável, só gatilhos do pacote; 102/102 PASS).
- `B2BPACK_REAL_TRIGGERS=1 test-local-pg.py` → `evidence-local-pg-real-triggers.json` (102/102 PASS): carrega via `real_triggers.py` as 38 definições de gatilho LIVE de pedido/itens/termos/idempotência/preço/embalagem e 49 corpos LIVE (`captured/triggers/`, md5 conferidos), incluindo `b2b_internal_order_snapshot_guard`, `c2_accounting_pending_guard`, crédito, `_saas_trg_require_feature`, tickets `issue_ticket/has_ticket`, `cpe_guard` e a exclusão GiST `cpe_no_overlap`.

## O que muda (só no install)
- `get_partner_packaging_offers_secure(p_partner_id)`: leitor via `b2b_partner_catalog_reader` + itens de `get_partner_catalog_secure`; embalagens ativas/vigentes do vendedor com unidade kg/g/ml/l e exatamente um preço ativo.
- `fn_resolve_b2b_cart`: ramo de embalagem (`platform_private.b2b_packaging_line`); líquido inalterado.
- `fn_b2b_cart_hash`: sufixo da embalagem só nas linhas de embalagem (hash líquido idêntico).
- `create_partner_order_secure`: impressão inclui `packaging_id`; trava FOR SHARE em ordem fixa produto → unidade de venda → volume → embalagem → preço (desligar B2B, trocar unidade, desativar volume, arquivar ou trocar preço esperam o pedido; depois do commit o próximo pedido vê o estado final); grava snapshot.
- Leitor devolve também `solid_products` (sólidos kg/g do catálogo autorizado, com ou sem oferta; sem preço) para a tela nunca tratar sólido como líquido.
- `partner_order_items`: 6 colunas de snapshot (identidade, código, versão, peso, unidade, preço da embalagem), CHECK `poi_packaging_snapshot_shape` com `IS NOT NULL` explícito em todo operando (o formato antigo aceitava NULL como UNKNOWN — reproduzido no teste) e gatilho de imutabilidade.
- Simulação e cotação: corpos inalterados (usam o resolvedor; cotação altera só preço).

## Decisão comercial pendente (não inventada como regra)
A condição `discount_from_base` aplica o desconto do plano sobre o preço base da embalagem; `quote_only` gera cotação; `fixed_item_price` é recusado (não há preço fixo por embalagem). **Confirmar com o proprietário antes da instalação.**

## Limites
- Costuras sintéticas declaradas nos dois JSON de evidência. Na rodada real: auth.uid por GUC, papéis/escopo mínimos, crédito sem limite e juros 0, entitlements sintéticos (gate real mantido), `platform_actor_access_ready` = perfil ativo, **`c2_owner_order_create_allowed` assumido aberto para o comprador vinculado (estado B1/C2 de produção não lido)**, `company_fiscal_settings` vazia (contrato real "pendente de contabilidade", sem emitente inventado), tabelas de 2º nível sem seus próprios gatilhos/FKs, FKs para clientes/auth.users/simulações omitidas, sem RLS/policies, sem JWT/PostgREST. Não prova JWT/RLS/Storage hospedados.
- Teste de troca de preço usa o mecanismo real: fecha a vigência e cria nova linha (o `cpe_guard` real recusa editar o preço; a GiST recusa sobreposição).
- Não testado: corrida com os writers administrativos de preço/apresentação travando em ordem diferente (risco de deadlock é detectado pelo Postgres e aborta uma das transações; não medido).
- Referência sólida `161758e3…` e embalagem `366e6f04…` não foram lidas nem usadas; uso só após revisão/habilitação do auditor.
- Rascunho de renovação guarda embalagem (item, embalagem, quantidade inteira) e só a restaura se a mesma embalagem segue ofertada pelo vendedor autorizado; caso contrário avisa e não restaura.
- Modelos (favoritos) com embalagem: gravação bloqueada inteira com aviso (nunca parcial nem vazia); líquidos inalterados.
- Tela: carregando / erro / contrato inválido / sólido sem preço mostram estado explícito; só pré-instalação (PGRST202 exato) ou "não sólido" confirmado abrem o diálogo líquido. Consequência: se o leitor de embalagens falhar depois de instalado, também líquidos ficam sem adicionar até nova leitura (fechado por desenho).
- Rascunho de renovação é em memória (renovação natural de sessão); recarregar a página não o preserva (comportamento anterior, inalterado).
- Meio de pagamento (B3) e recebível por NF (B4) seguem BLOCKED; fiscal/cobrança/envios OFF.
