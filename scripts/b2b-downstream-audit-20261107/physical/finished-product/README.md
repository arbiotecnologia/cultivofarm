# Compra de produto acabado para revenda — reconciliação física local

**Status: INATIVO / BLOQUEADO / NÃO APROVADO.** Somente PostgreSQL descartável; nenhuma operação hospedada, publicação, NF, cobrança, aprovação contábil, envio externo ou delegação.

## Decisão de origem incorporada

Químicos e fertilizantes ARBio entram por **COMPRA DE PRODUTO ACABADO PARA REVENDA**. O fluxo positivo deste recorte é:

`catálogo por empresa → compra/entrada privada de estoque → lote sem fabricação → reserva → expedição/em rota → comprovante fictício → entrega`, com cancelamento, replays e rollback.

Não há bioreator, `programacao_producao`, CQ ou envase nesses caminhos. O candidato anterior, baseado em estoque montado por fixture, foi preservado em `history/pre-purchase-decision/` e não é mais o candidato atual.

## Entrada canônica implementada

`platform_private.finished_product_purchase_entry_v1` é privada, transacional, idempotente e nasce sem EXECUTE para `PUBLIC`, `anon`, `authenticated` e `service_role`. Ela:

- deriva ator e empresa no servidor e reautoriza após locks/esperas;
- exige o gate privado habilitado, papel/recursos de estoque existentes e catálogo ativo do mesmo tenant;
- resolve no servidor a apresentação em `product_sale_units`, `product_packagings` e `catalogo_volumes`; o chamador não informa unidade, conteúdo ou versão;
- usa tickets específicos no mecanismo `platform_private.authz_tickets` já existente e o contexto transacional canônico do motor de estoque;
- cria `lotes` e `estoque_produto` com `programacao_id/volume_produzido/envase/CQ` ausentes e origem `compra_produto_acabado_revenda`;
- registra fornecedor e referência de compra no lote e no ledger, sem preço, contas a pagar, documento fiscal ou cobrança;
- exige exatamente um movimento `entrada`, com fingerprint e chave de idempotência; replay retorna os mesmos IDs e payload divergente conflita.

Os guards reais de lote, item biológico, entrada, tenant, imagem de estoque e ledger foram integrados, não desligados. Nenhum grant novo foi adicionado. `catalog_foundation.py` apenas reconcilia a captura física antiga com o schema de catálogo atual já usado pelo B3; é costura sintética local, não instalação LIVE nem writer Owned.

## Unidades e embalagem

Cada compra recebe uma única embalagem/apresentação e quantidade inteira. Para sólidos, `product_packagings.peso_liquido_kg` resolve o conteúdo em kg/g; para líquidos, `catalogo_volumes.volume_ml` resolve L/ml.

- 2×25 kg = **50 kg**, `volume_entregue_ml=NULL`;
- 2×25.000 g = **50.000 g**, `volume_entregue_ml=NULL`;
- 2×1 L = **2 L**, `volume_entregue_ml=2000`;
- 2×500 ml = **1.000 ml**, `volume_entregue_ml=1000`.

Peso é conteúdo para freight/logística e nunca é convertido em volume. A parcial de 2 de 3 sacos de 25 kg faz split, cancelamento e merge para **75 kg**; 0,5 embalagem é negada na compra e na reserva. Não há segunda baixa em envio, confirmação ou replays.

## Objetos e pinos

`install.sql.review` pina corpo, owner e ACL de **11 funções** compartilhadas, owner/ACL de 9 relações, colunas e constraints das dependências de catálogo, além da ausência prévia dos objetos novos. O candidato altera reserva/split, entrega, merge de cancelamento, lineage de envio/confirmação, sync laboratorial, guards de lote/entrada e guards de imagem de envase.

`postflight.sql.review` contém hashes normalizados medidos das 11 funções alteradas e das 3 funções privadas novas, e exige gate fechado. `rollback.sql.review` é deny-only: desliga a operação e revoga writers sem apagar dados, colunas, corpos ou histórico. O POST de instalação não é reaplicado após o rollback porque a revogação intencional muda o ACL.

## Resultados finais

| Escopo | Resultado | Evidência |
|---|---:|---|
| Reprodução original: peso→ml, lineage de fabricação e B2B fechado | 17/17, exit 0 | `evidence/before.json`, stdout e exitcode |
| Compra/entrada, kg/g/L/ml, whole-pack, reserva/baixa/envio/entrega/cancelamento, replays, concorrência, revogação e rollback | **37/37, exit 0** | `evidence/after.json`, stdout e exitcode |
| Legado biológico com candidato instalado e gate desligado | 6/6, exit 0 | `evidence/legacy-candidate.json`, stdout e exitcode |

Candidato SHA256: `af71a57593d263a0fd4a1ea4341d62cb3e44e2edbaa6a9cf64d495df3f90e89f`.

## Bloqueios e limites

1. **Baseline LIVE independente ausente:** os 11 corpos/owners/ACLs, relações e o schema/constraints de catálogo precisam ser conferidos pelo auditor. A costura local não prova que a produção tem os mesmos pinos.
2. **Sem exposição ao aplicativo:** a entrada privada não tem grant nem UI/caller liberado. Os positivos usam chamada interna privilegiada e claims sintéticos no PG descartável; isso não prova JWT, RLS, Storage, PostgREST ou browser.
3. **Dados reais não homologados:** produtos, embalagens, fornecedores, referências de compra e comprovantes são fictícios. A composição real ARBio e a homologação autenticada ficam com o auditor.
4. **B2B/OnFarm permanece fechado** com `DELIVERY_SCOPE_DENIED`. O fluxo positivo usa OS manual/agronômica fictícia e não certifica pedido B2B real.
5. Nenhum efeito fiscal, financeiro, contábil, SEFAZ ou de comunicação foi liberado. Calendário Paracatu-MG, NF e recebíveis continuam fora deste pacote.

Os históricos físicos 119/119, 21/21 e 123/123 permanecem em `../evidence/`; não foram somados às contagens deste recorte nem apresentados como E2E real.
