# Capability de revenda B2B v2 + revalidação do recibo de reserva (candidato local, NÃO instalado)

Revisor: agente Codex (não é revisão pessoal do usuário). V1 rejeitada preservada em `history/`.

## Ordem de instalação (somente pelo auditor, após revisão)
1. `../stock-reserve-replay-revalidation-20261110/01-pre.sql.readonly` → `02-install.sql.review` → `03-post.sql.readonly` (CAND_MD5 `41dd61276165e341c79353ad00f0d54d`). Rollback: `04-rollback-deny.sql.review` (deny-only, não restaura corpo vulnerável).
2. `01-pre.sql.readonly` → `02-install.sql.review` → `03-post.sql.readonly` (CAP_MD5 `662e9b916d9afa2a5f23f35baf76a5ba`). Rollback: `04-rollback-deny.sql.review`.
Pins LIVE: delivery_actor `c6da1f5d…`, fn_estoque_pode_operar `d0d1e37b…`, os_operational `7cd8ee22…`, scope `63f49fee…`, rpc_estoque_reservar_v1 `3e0dc7c4…`; PRE também exige `rpc_entrega_confirmar_manual_v1` fechado a authenticated.

## Prova no espelho (rebuild_current, NEW_E2E_RESALE_CAP=1) — attempt-230, exit 0, 38/38
`evidence/mirror-attempt-230/`. Espelho alinhado ao LIVE só instalando o artefato de produção 61 verbatim (os_operational) e revogando o EXECUTE de confirmar_manual que o espelho abria; ambos registrados e restaurados.

## Achado real (produção)
O `b2b_resale_os_operational_valid_v1` LIVE lê o cabeçalho congelado (`financial_approval_status`). Pedido sintético aprovado pelos termos vinculados fica `pending` no cabeçalho ⇒ capability FECHADA em produção para esse pedido (fail closed). Positivos foram cobertos com o overlay local de termos vinculados (INTERMEDIÁRIO, não LIVE). Sem esse consumidor alinhado instalado, o piloto não abre — não forçar cabeçalho.

## Tela
Painel `RevendaB2BPilotoPanel` montado em Entregas: lista OS B2B prontas, botões "Reservar (piloto)"/"Criar entrega (piloto)" só com envelope exato; incerteza só por consulta/repetição exata da mesma chave. Vitest 190/190 (`evidence/vitest-stdout.txt`).

## Limites
Auth por claims SQL sintética; não prova JWT/RLS/Storage hospedados. Nada hospedado, publicado, concedido, emitido ou cobrado. PB-001039/contabilidade intocados.
