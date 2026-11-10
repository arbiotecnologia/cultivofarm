# Revalidação pós-espera do recibo de `rpc_estoque_reservar_v1` (delta INATIVO)

Revisor: agente Codex. Sem escrita hospedada, sem publicação, piloto fechado. Pacote de capability (`resale-delivery-capability-20261110`) continua FECHADO até este delta ser instalado.

## Constatação reproduzida (corpo LIVE md5 `3e0dc7c48ab28f4402699b234476aa8a`, reconstruído byte a byte de `stock-envase-recovery-20261027/install-v2.sql.review`)
No ramo de recibo, após `pg_advisory_xact_lock`, só compara ator/org/fingerprint e devolve o recibo. Reproduzido no banco descartável: recibo devolvido com gate logístico fechado, com concessão revogada durante espera comprovada, com ator removido durante espera e com concessão vencida.

## Delta
Antes do `RETURN` do recibo: `stock_motor_actor('reserva')` atual = org gravada; por item `stock_motor_item` + estoque na mesma empresa; para estoque acabado (`origem_estoque` não nulo) `resale_pilot_scope_v1` exato (b2b: parceiro/pedido/item da OS/produto/estoque; manual: finished_product); demais tipos de estoque acabado negados. Estoque biológico (`origem_estoque` nulo) e splits: inalterados. Caminho novo inalterado.

## Arquivos
- `01-pre.sql.readonly` (corpo 3e0dc7c4, ACL/owner, helper de escopo 63f49fee intermediário)
- `02-install.sql.review` (gerado; recusa rerun) → corpo novo md5 `e75a69c29fb6c0716c89706db0ca1076`
- `03-post.sql.readonly`, `04-rollback-deny.sql.review`
- `generate.py`, `live-v2-body.sql`, `db_replay_test.py`
- Evidências: `evidence/db-stdout.txt` (35/35; LIVE reproduz falha, candidato nega 42501), `db-results.json`, `vitest-stdout.txt` (190/190), exit codes.

## Seams / limites
Motor de estoque (`stock_motor_actor/item`, `rpc_estoque_operar_v1`) e Auth são seams declarados; helper de escopo/allowlist verbatim do 61. Não prova JWT/RLS hospedado nem o motor real; rodar no espelho `rebuild_current.py` após revisão é pendente.
