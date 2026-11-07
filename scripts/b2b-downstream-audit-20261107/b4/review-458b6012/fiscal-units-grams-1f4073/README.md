# Revisão 1f4073 — apresentação em gramas com snapshot armazenado em kg

**Candidato INATIVO/BLOQUEADO/NÃO APROVADO.** Escopo restrito a código e PostgreSQL descartável. Não houve consulta ou escrita hospedada, NF real, cobrança, envio, publicação ou delegação.

## Achado confirmado

Os fatos LIVE foram relatados pelo revisor, não consultados novamente pelo agente:

- `solid_pack_offer_save_v1` recebe `p_peso_liquido_kg` e o encaminha sem conversão;
- `solid_pack_presentation_insert` grava esse valor diretamente em `product_packagings.peso_liquido_kg`;
- `solid_pack_weight_label` multiplica por 1.000 apenas para exibir gramas;
- portanto, `packaging_peso_liquido_kg_snapshot` guarda **kg mesmo quando `packaging_unidade_conteudo_snapshot='g'`**.

O allocator anterior atribuía `content_unit='g'` e `content_per_unit=0,500`, interpretando 0,500 kg como 0,500 g.

## Fixture canônica observada

A fixture usou os corpos capturados, byte a byte, de `solid_pack_offer_save_v1`, `solid_pack_price_set_v1` e seus auxiliares reais, incluindo `solid_pack_presentation_insert` e `solid_pack_weight_label`. O pedido foi criado pelo writer B3 canônico, não por INSERT de item ou snapshot inventado.

Valores observados em `evidence-before.json` e `evidence-after.json`, campo `canonical_fixture`:

- writer de apresentação chamado com `0,500` no parâmetro em kg;
- `product_packagings.peso_liquido_kg=0,500` e unidade de exibição `g`;
- rótulo gerado pelo writer: `Fertilizante 500 g TESTE · 500 g`;
- preço definido pelo writer real: R$90 por embalagem;
- pedido canônico de 2 UN: snapshot de `0,500 kg` por embalagem, preço unitário R$90 e valor comercial R$180;
- juros B3 separados: R$6,52; total final R$186,52, sem transformar peso em preço;
- frete dimensional: `2 × 0,500 kg = 1 kg`.

## Reprodução antes da correção

Baseline SHA256 `b84ee8bb21321a63711e90e3871f0984423589589d98d556db9d8151b4f0ee47`: **163/168, exit 1**, com cinco falhas funcionais:

1. NF parcial fictícia de 1 UN/500 g foi negada;
2. NF parcial fictícia de 1 UN/0,5 kg foi negada;
3. 500 g comerciais não normalizaram para uma embalagem;
4. 1 UN com somente 0,5 g tributáveis foi indevidamente aceito;
5. esse caso inválido criou título e alocação locais.

As tentativas anteriores de harness e a asserção que confundiu valor comercial com total mais juros foram preservadas nos arquivos `harness-total-metric-*`; não contam como PASS.

## Correção mínima gerada

Somente `platform_private.b2b_allocate_document(uuid)` mudou no corpo funcional, por `generate-b4.py` e `generate-b4-review.py`:

- whole-pack aceita snapshot de conteúdo somente em `kg` ou `g` como unidade de exibição;
- o valor de `packaging_peso_liquido_kg_snapshot` é sempre interpretado em **kg**;
- a conversão fiscal continua dimensional: 1 UN = 500 g = 0,5 kg = 1 embalagem;
- 1 UN + 0,5 g gera `FISCAL_QUANTITY_UNIT_DIVERGENCE`, sem título/alocação;
- whole-pack com unidade fora de kg/g falha com `FISCAL_ITEM_UNIT_SNAPSHOT_UNPROVEN`;
- não houve mudança de preço, Price, crédito, calendário, grants, backfill, venda fracionada ou writers canônicos.

O diff exato está em `candidate-before-after.diff`.

## Líquidos

Produto líquido sem pack continua usando `volume_ml` e `volume_ml_snapshot` coerentes, com conversões reais L↔ml. A matriz conserva 1 L = 1.000 ml, 500 ml = 0,5 unidade líquida não whole-pack e nega peso→volume.

Não se presumiu pack líquido: o writer real recebeu um produto com `forma_fisica='liquido'` e negou a apresentação com `PACK_PRODUCT_NOT_SOLID`.

## Resultados independentes — não somar

| Verificação | Resultado | Exit | Evidência |
|---|---:|---:|---|
| Mesma matriz antes | 163/168 | 1 | `evidence-before.json`, `test-before.*` |
| Mesma matriz depois | 177/177 | 0 | `evidence-after.json`, `test-after.*` |
| Regressão B4 compartilhada sobre o candidato final | 100/100 | 0 | `shared-after/evidence-b4-shared-impact.json`, `test-shared.*` |
| Manifesto/pins/ACL/rollback | 59/59 | 0 | `evidence-manifest-tests.json`, `test-manifest.*` |

Candidato final SHA256 `818da9e4f001494bdc50c2265e3adfa9d04ec3cd421454c3e1a2ce7ca17b6a8b`.

Instalação revisável SHA256 `721f97705d6b6d80ac36ebfa8f0a781aa59e5cc33554ffd146099823409f3685`.

O manifesto continua com 56 objetos, instalação sem GRANT e dependência operacional real always-deny. O rollback testado é deny-only e preserva histórico.

## Limites e pendências inalteradas

- PASS é somente de componente sintético em PostgreSQL descartável, com Auth/GUC e documentos AUTHORIZED fictícios sem rede.
- Não é prova JWT/RLS/Storage/PostgREST/browser nem E2E real.
- O candidato continua bloqueado por revisão independente, impactos READONLY LIVE, títulos MANUAL sem origem e homologação.
- Corpos/owners/ACLs/relações LIVE precisam ser reconferidos pelo auditor antes de qualquer instalação.
- As demais tarefas da fila, inclusive a reconciliação dos cinco títulos MANUAL, permanecem abertas e não foram alteradas por esta correção.
