# Compra de produto acabado para revenda — reconciliação física local

**Status: INATIVO / BLOQUEADO / NÃO APROVADO.** Somente PostgreSQL descartável; nenhuma operação hospedada, publicação, NF, cobrança, aprovação contábil, envio externo ou delegação.

## Decisão de origem incorporada

Químicos e fertilizantes ARBio entram por **COMPRA DE PRODUTO ACABADO PARA REVENDA**. O fluxo positivo deste recorte é:

`catálogo por empresa → compra/entrada privada de estoque → lote sem fabricação → reserva → expedição/em rota → comprovante fictício → entrega`, com cancelamento, replays e rollback.

Não há bioreator, `programacao_producao`, CQ ou envase nesses caminhos. Os candidatos anteriores ficaram preservados em `history/pre-purchase-decision/` e `history/pre-live-entry-guards/`.

## Entrada canônica implementada

`platform_private.finished_product_purchase_entry_v1` é privada, transacional, idempotente e nasce sem EXECUTE para `PUBLIC`, `anon`, `authenticated` e `service_role`. Ela:

- deriva ator e empresa no servidor e reautoriza após locks/esperas;
- exige o gate privado habilitado, papel/recursos de estoque existentes e catálogo ativo do mesmo tenant;
- resolve no servidor a apresentação em `product_sale_units`, `product_packagings` e `catalogo_volumes`; o chamador não informa unidade, conteúdo ou versão;
- exige lote do fornecedor, referência da compra, fornecedor e chave de idempotência; o lote do fornecedor e o fornecedor entram no fingerprint e nos snapshots já existentes, sem novo cadastro paralelo;
- usa tickets específicos no mecanismo `platform_private.authz_tickets` já existente e o contexto transacional canônico do motor de estoque;
- cria `lotes` e `estoque_produto` com `programacao_id/volume_produzido/envase/CQ` ausentes, origem `compra_produto_acabado_revenda` e **`quantidade_reservada=NULL`**;
- registra fornecedor, lote do fornecedor e referência de compra no lote e no ledger, sem preço, contas a pagar, documento fiscal ou cobrança;
- exige exatamente um movimento `entrada`; replay retorna os mesmos IDs e divergência de quantidade, fornecedor ou lote do fornecedor conflita.

## Guards LIVE informados e composição

Os fatos READONLY relatados pelo auditor estão em `live-entry-guards-20261107T1737Z.json`; não são uma nova leitura hosted do agente.

- `public.validate_estoque_entrada()`: MD5 relatado `9e24938a8d716a02ba023c9fb7ce24e9`, igual à captura descartável. O candidato preserva o retorno legado de reservas, mas exige contexto canônico de reserva quando a origem é compra. Uma entrada de compra disfarçada com `quantidade_reservada` preenchida é negada; a entrada agregada de compra exige ticket e snapshot, sem envase. Para itens sem origem de compra, a exigência original de envase permanece.
- `platform_private.estoque_produto_catalog_tenant_guard()`: MD5 relatado `874c9ca8b5b4e307cf995a0197f98efc`, igual à captura descartável após remover divergência de indentação. O corpo é dependência **imutável**, não é regravado pelo candidato. O trigger `a000_estoque_produto_catalog_tenant_guard` é pinado por definição, estado e tipo; produto e microrganismo de outro tenant são negados pelo tenant derivado do lote.

Os guards reais de lote, item biológico, entrada, tenant, imagem de estoque e ledger permanecem habilitados nos writers testados. A sonda isolada da função de entrada é identificada separadamente e não substitui a prova da composição. Nenhum grant novo foi adicionado. `catalog_foundation.py` apenas reconcilia a captura física antiga com o schema de catálogo atual; é costura sintética local, não instalação LIVE nem writer Owned.

## Unidades e embalagem

Cada compra recebe uma única embalagem/apresentação e quantidade inteira. Para sólidos, `product_packagings.peso_liquido_kg` resolve o conteúdo em kg/g; para líquidos, `catalogo_volumes.volume_ml` resolve L/ml.

- 2×25 kg = **50 kg**, `volume_entregue_ml=NULL`;
- 2×25.000 g = **50.000 g**, `volume_entregue_ml=NULL`;
- 2×1 L = **2 L**, `volume_entregue_ml=2000`;
- 2×500 ml = **1.000 ml**, `volume_entregue_ml=1000`.

Peso é conteúdo para frete/logística e nunca é convertido em volume. A parcial de 2 de 3 sacos de 25 kg faz split, cancelamento e merge para **75 kg**; 0,5 embalagem é negada na compra e na reserva. Não há segunda baixa em envio, confirmação ou replays.

## Objetos, pinos e rollback

`install.sql.review` pina corpo, owner e ACL de **11 funções alteradas**, mais **1 função e 1 trigger imutáveis de tenant**, owner/ACL de 10 relações, colunas e constraints das dependências de catálogo, além da ausência prévia dos objetos novos. O candidato altera somente as 11 funções já inventariadas; o guard de tenant não é regravado.

`postflight.sql.review` contém hashes normalizados medidos das 11 funções alteradas, das 3 funções privadas novas e da dependência imutável, além do trigger e do gate fechado. `rollback.sql.review` é deny-only: desliga a operação e revoga writers sem apagar dados, colunas, corpos ou histórico. O POST de instalação não é reaplicado após o rollback porque a revogação intencional muda o ACL.

## Resultados atuais

| Escopo | Resultado | Evidência |
|---|---:|---|
| Reprodução original: peso→ml, lineage de fabricação e B2B fechado | 17/17, exit 0 | `evidence/before.json`, stdout e exitcode |
| Compra, API/guards, kg/g/L/ml, whole-pack, atalho de reserva, tenant produto/micro, downstream, replays, concorrência, revogação e rollback | **49/49, exit 0** | `evidence/after.json`, stdout e exitcode |
| Legado biológico com candidato instalado e gate desligado | 6/6, exit 0 | `evidence/legacy-candidate.json`, stdout e exitcode |
| Revisão repetível dos artefatos, pins, grants e resultados | 23/23, exit 0 | `evidence/review.json`, stdout e exitcode |

Candidato SHA256: `96598a894025b04b558e308633e6dc6cd87d99f269d4eb20cc0d40dbf1371c7e`.
A bateria anterior 37/37 está preservada em `history/pre-live-entry-guards/` e não é somada à atual.

## Bloqueios e limites

1. **Conferência LIVE independente pendente:** os MD5 dos dois guards foram relatados pelo auditor e reproduzidos localmente; owners/ACLs/trigger/relações, os demais corpos e o schema de catálogo ainda exigem conferência independente. A costura local não prova paridade integral com produção.
2. **Sem exposição ao aplicativo:** a entrada privada não tem grant nem UI/caller liberado. Os positivos usam chamada interna privilegiada e claims sintéticos no PG descartável; isso não prova JWT, RLS, Storage, PostgREST ou browser.
3. **Dados reais não homologados:** produtos, embalagens, fornecedores, lotes, referências de compra e comprovantes são fictícios. A composição real ARBio e a homologação autenticada ficam com o auditor.
4. **B2B/OnFarm permanece fechado** com `DELIVERY_SCOPE_DENIED`. O fluxo positivo usa OS manual/agronômica fictícia e não certifica pedido B2B real.
5. Nenhum efeito fiscal, financeiro, contábil, SEFAZ ou de comunicação foi liberado. Calendário Paracatu-MG, NF e recebíveis continuam fora deste pacote.

Os históricos físicos 119/119, 21/21 e 123/123 permanecem em `../evidence/`; não foram somados às contagens deste recorte nem apresentados como E2E real.
