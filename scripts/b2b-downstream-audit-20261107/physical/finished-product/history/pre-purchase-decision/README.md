# Produto acabado — reconciliação física local

**Status: INATIVO / BLOQUEADO / NÃO APROVADO.** Somente PostgreSQL descartável; nenhuma operação hospedada, publicação, NF, cobrança, aprovação contábil ou envio externo.

## Reprodução antes da correção

A bateria `before` terminou **17/17, exit 0** e comprovou:

- reserva por quantidade sem envase, mas entrega sólida sem unidade fechada;
- `volume_total=50` em uma fixture de 50 kg virava `volume_entregue_ml=50000`;
- apresentação líquida conseguia reservar/expedir/cancelar, mas envio e confirmação exigiam `programacao_producao`;
- a confirmação tentava acionar fabricação laboratorial para químico/fertilizante;
- B2B aprovado permanecia negado por `DELIVERY_SCOPE_DENIED`.

## Candidato

`install.sql.review` pina corpo, owner e ACL de **8 funções** e owner/ACL das relações compartilhadas. O pacote adiciona snapshots de unidade/embalagem em `estoque_produto` e `entregas`, constraint de contrato, gate privado desligado e duas funções privadas de validação. Não adiciona grants nem políticas permissivas.

O candidato altera somente: reserva/split, writer interno de entrega, merge de cancelamento, lineage de envio/confirmação, sync laboratorial e os dois guards de imagem de envase. A comparação legada de envase desconta apenas as novas colunas aditivas; a constraint exige que permaneçam nulas no legado.

`rollback.sql.review` é deny-only: desliga o gate e preserva dados, colunas, corpos e histórico. `postflight.sql.review` contém os hashes normalizados medidos no PostgreSQL descartável e exige gate fechado.

## Resultados finais

| Escopo | Resultado | Evidência |
|---|---:|---|
| Reprodução original | 17/17, exit 0 | `evidence/before.json`, `before.stdout.txt`, `before.exitcode` |
| kg, g, L, ml; whole-pack; parcial; envio/confirmação/cancelamento; replays; B2B negado | 19/19, exit 0 | `evidence/after.json`, `after.stdout.txt`, `after.exitcode` |
| Legado biológico com candidato instalado e gate desligado | 6/6, exit 0 | `evidence/legacy-candidate.json`, stdout e exitcode |

Casos positivos: 2×25 kg = 50 kg; 2×25.000 g = 50.000 g; 2×1 L = 2.000 ml; 2×500 ml = 1.000 ml. Peso nunca gera `volume_entregue_ml`. A parcial de 2 de 3 sacos de 25 kg faz split, cancelamento e merge para 75 kg; 0,5 embalagem é negada. Não há segunda baixa em envio/confirmação/replays.

## Bloqueios e limites

1. **Baseline LIVE independente ausente:** os oito corpos/owners/ACLs e as relações precisam ser conferidos pelo auditor. Captura local não é prova de produção.
2. **Dependência canônica B3 ausente nesta composição física:** os IDs/versões de embalagem são snapshots upstream sintéticos. Não foi criado catálogo/tabela paralela nem usado o catálogo líquido antigo como se fosse sólido. A ligação real com o catálogo B3 precisa ser composta e revisada.
3. **Entrada de produto acabado fora do recorte:** fixtures upstream usam `session_replication_role=replica` apenas na montagem. Nenhum writer de entrada foi aberto ou certificado; os writers downstream executam com triggers habilitados.
4. O gate nasce `enabled=false`; os testes positivos o ligam somente no banco descartável. Instalação não significa operação.
5. B2B/OnFarm permanece fechado. O fluxo positivo usa OS manual/agronômica fictícia e não certifica pedido B2B real, JWT, RLS, Storage, PostgREST ou browser.
6. Nenhum efeito fiscal, financeiro, contábil, fiscal-SEFAZ ou de comunicação foi liberado. Calendário Paracatu-MG e NF/recebíveis continuam fora deste pacote.

Os históricos físicos anteriores 119/119, 21/21 e 123/123 permanecem em `../evidence/`; não foram somados às contagens deste recorte nem apresentados como E2E real.
