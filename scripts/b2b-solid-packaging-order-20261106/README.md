# B2 — Pedido por embalagem inteira (sólidos e misto) — `B2B_PARTNER_PACKAGING_ORDER_V1`

Etapa B2 do plano original de nove etapas (`scripts/b2b-partner-order-arbio-20261106/README.md`).
Escopo de negócio: AR Bio `007bb519-…` e parceiro fictício `7e52de9a-…`. FSF fora das fixtures.
**Estado: CANDIDATO. NÃO APLICADO. Nada hospedado foi escrito.**

## Artefatos
- `captured/` — 11 corpos LIVE lidos read-only de `swzpzcwiasxmjutrmvkm` (md5 no nome).
- `generate.py` → `01-pre.sql.readonly`, `02-install.sql.review`, `03-post.sql.readonly`, `04-rollback-deny.sql.review`, `generated-md5.json`.
- `test-local-pg.py` → `evidence-local-pg.json` (PostgreSQL 17 descartável, só gatilhos do pacote; 105/105 PASS).
- `B2BPACK_REAL_TRIGGERS=1 test-local-pg.py` → `evidence-local-pg-real-triggers.json` (158/158 PASS; inclui `real_extras.py`, abaixo): carrega via `real_triggers.py` as 38 definições de gatilho LIVE de pedido/itens/termos/idempotência/preço/embalagem e 49 corpos LIVE (`captured/triggers/`, md5 conferidos), incluindo `b2b_internal_order_snapshot_guard`, `c2_accounting_pending_guard`, crédito, `_saas_trg_require_feature`, tickets `issue_ticket/has_ticket`, `cpe_guard` e a exclusão GiST `cpe_no_overlap`.

## O que muda (só no install)
- `get_partner_packaging_offers_secure(p_partner_id)`: leitor via `b2b_partner_catalog_reader` + itens de `get_partner_catalog_secure`; embalagens ativas/vigentes do vendedor com unidade kg/g/ml/l e exatamente um preço ativo.
- `fn_resolve_b2b_cart`: ramo de embalagem (`platform_private.b2b_packaging_line`); líquido inalterado.
- `fn_b2b_cart_hash`: sufixo da embalagem só nas linhas de embalagem (hash líquido idêntico).
- `create_partner_order_secure`: impressão inclui `packaging_id`; trava FOR SHARE em ordem fixa produto → unidade de venda → volume → embalagem → preço (desligar B2B, trocar unidade, desativar volume, arquivar ou trocar preço esperam o pedido; depois do commit o próximo pedido vê o estado final); grava snapshot.
- `b2b_packaging_lock` toma primeiro a trava consultiva COMPARTILHADA `solid_pack_product:<produto>` — a mesma chave que `solid_pack_price_set_v1`/`solid_pack_offer_save_v1` tomam EXCLUSIVA antes de qualquer linha. Sem isso, a ordem antiga (produto/volume FOR SHARE → embalagem) contra `offer_save` (embalagem FOR UPDATE → volume/produto) fecha ciclo: **deadlock reproduzido** no PG descartável.
- Leitor devolve também `solid_products` (sólidos kg/g do catálogo autorizado, com ou sem oferta; sem preço) para a tela nunca tratar sólido como líquido.
- `partner_order_items`: 6 colunas de snapshot (identidade, código, versão, peso, unidade, preço da embalagem), CHECK `poi_packaging_snapshot_shape` com `IS NOT NULL` explícito em todo operando (o formato antigo aceitava NULL como UNKNOWN — reproduzido no teste) e gatilho de imutabilidade.
- Simulação e cotação: corpos inalterados (usam o resolvedor; cotação altera só preço).

## Decisão comercial CONFIRMADA pelo proprietário (06/11/2026)
"Adotar desconto e cotação; bloquear preço fixo sem configuração":
- `discount_from_base`: desconto do plano aplicado sobre o preço cadastrado da embalagem (teste `decision.discount_from_base_on_packaging_price`: 180 → 162).
- `quote_only`: gera cotação; só o comercial autorizado do vendedor responde (`decision.quote_only_*`, outro tenant negado).
- `fixed_item_price`: recusado (`PRICING_MODE_UNSUPPORTED`) enquanto não existir configuração específica de preço fixo por embalagem — que **não** é criada nesta etapa.
A aprovação comercial não substitui revisão do SQL, testes integrados nem prova em sessão real; o pacote continua NÃO APLICADO.

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

## Prova real — formulário de preço de embalagem (revisão 9db4cc74, relatada pelo auditor em 06/11/2026)
- Sessão real admin AR Bio na prévia: **PASS**. "Salvar preço" confirmou e a lista mostrou R$ 10,00 vigente desde 2026-11-06; SELECT read-only do auditor confirmou exatamente um preço ativo para a embalagem sintética TESTE saco 25 kg (valor só de fixture, não padrão comercial).
- Observação do auditor: o preenchimento automatizado do campo de data exibiu 06/11/2026 no DOM, mas o estado React ficou vazio ("Informe a vigência"); a entrada nativa (ArrowUp/ArrowDown/Tab) confirmou a data.
- Causa raiz do clique mudo original: **não demonstrada**. A hipótese de sessão em revalidação NÃO foi comprovada; há limitação do preenchimento automatizado de data. Nenhum guard foi alterado por isso; os testes negativos com motivo na tela (`src/test/catalogo/solidPackPriceSave.test.tsx`) permanecem.
- Esta prova cobre só o cadastro de preço; não certifica o pedido por embalagem (pacote B2 continua NÃO APLICADO).

## Rodada complementar com resolvedores e writers REAIS (`real_extras.py`, revisão a57bf9ca)
Corpos LIVE lidos read-only e conferidos por md5: `captured/credit/` (fn_b2b_credit_exposure 213ac31f, fn_b2b_apply_interest 806e5d87, fn_b2b_plan_selectable 4cb833a3) e `captured/solid-pack/` (solid_pack_price_set_v1 0bad25e1, solid_pack_offer_save_v1 e4763561, helpers, recorte_a_actor_fresh, has_role, presentation_guard/owner_consistent).
- **Crédito/juros reais** (limites e taxas = valores de fixture TESTE, não regra): limite NULL → em análise + auditoria `credit_limit_not_defined`; saldo acima → OK; pedidos pendentes consomem limite; abaixo + `block` → recusa atômica (sem pedido nem chave); abaixo + `approval_required` → `aguardando_aprovacao_credito`/`limite_excedido`; inadimplência com bloqueio → `credit_blocked_overdue`; juros composto/simples batem com Decimal independente e parcelas somam o total; plano vencido não selecionável.
- **`c2_accounting_pending_guard`**: cada transição (aprovar, produção, pronto p/ produção, recebível gerado, approved_at, crédito→análise, credit_approved_at) é negada pela pilha integrada E pelo gatilho `zz_c2_accounting_pending` **isolado** (demais desligados numa transação desfeita) com a mensagem `C2_ACCOUNTING_PENDING`; controle positivo: cancelar segue permitido por ele.
- **Cotação**: comercial autorizado responde; comprador, técnico, admin de outro tenant e admin inativo negados, item intacto.
- **Concorrência com writers reais, 2 conexões**: pedido primeiro → `price_set` espera e conclui, snapshot = preço visto; `offer_save` primeiro → pedido espera e é recusado (`B2B_PACKAGING_INACTIVE`) sem pedido/chave; replay das chaves admin devolve `replayed` sem nova linha; conflito de chave → `PACK_IDEMPOTENCY_CONFLICT`; comprador não grava preço. Ordem antiga EMULADA → deadlock, vítima desfeita por inteiro (contagens iguais) e a mesma chave aplica uma vez depois (sem retry automático no app); ordem alinhada → sem deadlock; função instalada + `offer_save` em corrida → ambos coerentes.
- Costuras desta etapa: listadas em `real_extras.SEAMS` e no JSON (tabelas de recebível sem gatilhos/FKs, claims por GUC local, demais gatilhos de `catalogo_volumes` omitidos, ordem antiga emulada; admin inativo negado pela costura `b2b_phase1_order_visible`).
- Não coberto: outros writers de `produtos`/`catalogo_volumes` (ex.: salvamento do produto, sync_mestre) em corrida; RLS/JWT/PostgREST; Storage.

## Tela (revisão a57bf9ca)
- Erro transitório do leitor de embalagens não apaga escolhas: ficam pendentes (só item/embalagem/quantidade), com aviso fixo e "Tentar confirmar agora"; simulação/envio bloqueados até nova leitura bem-sucedida, que reaplica preço/peso dessa leitura. Oferta ausente em leitura bem-sucedida = descarte com aviso.
- Retenção após recarregar: `sessionStorage` mínimo (`src/lib/authz/partnerOrderDraftStore.ts`), escopo usuário+tenant+parceiro, expira em 8 h, valida esquema estrito e apaga corrompido/expirado/de outro escopo; restaura só com o monitor confirmando acesso. Apagado em logout, troca de identidade, troca de vetor (epoch), perfil inativo e expiração por inelegibilidade; offline/timeout preservam. Tentativas idempotentes do pedido ficam no mecanismo próprio e não são tocadas.
- Não testado em sessão real nem a limpeza dentro do AuthProvider em teste integrado (coberta só por teste unitário de `clearAllPartnerOrderDrafts`).
