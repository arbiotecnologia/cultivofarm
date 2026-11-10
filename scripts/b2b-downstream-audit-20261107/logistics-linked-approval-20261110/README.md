# Consumidores da logística de revenda: aprovação canônica (candidato local, NÃO instalado)

Revisor: agente Codex (não é revisão pessoal do usuário). Sem hosted/publicação/emissão/envio/cobrança.

## Causa (sonda `evidence/attempt-234/condition-probe.json`)
Com os 6 corpos LIVE instalados verbatim, todas as condições não financeiras passam (concessão os_create exata vigente, dono/família `fertilizante_adubo`, 5 embalagens inteiras, conteúdo kg com peso 25 kg > 0, snapshots, origem C2). Única falha: o cabeçalho congelado `financial_approval_status=pending`, embora os termos vinculados do mesmo pedido estejam aprovados pelo fluxo canônico.

## Delta (6 funções, só o predicado financeiro)
`b2b_resale_os_valid_v1`, `b2b_resale_os_operational_valid_v1`, `b2b_resale_delivery_order_valid_v1`, `platform_private.b2b_resale_os_create_v1` (2 pontos), `rpc_b2b_resale_os_availability_v1`, `rpc_b2b_resale_os_create_v1`.
Ordem: `01-pre.sql.readonly` → `02-install.sql.review` → `03-post.sql.readonly` (substituir `:<função>:` pelos md5 de `evidence/attempt-234/candidate-md5.json`). Rollback: `04-rollback-restore-legacy-strict.sql.review`.
LIVE: 804e2a33 / 7cd8ee22 / bd76345c / c5b1da90 / e9767fcb / 6a249b41. ACL de `acl-live.json` medida no espelho alinhado — o auditor reconfere no PRE hospedado.

## Espelho (rebuild_current, NEW_E2E_LINKED_APPROVAL=1) — attempt-234, exit 0, 20/20 + 38 gatilhos
Negação LIVE → PRE/INSTALL/POST → OS criada e replay → 8 negativas (termos pendentes/rejeitados/sem autor, vínculo ausente/divergente, cabeçalho rejeitado, sem aprovação comercial, crédito incoerente) + comprador → compra de 2 lotes → reserva por lote, replay sem movimento, corrida de mesma chave em 2 sessões (1 reserva; perdedor erro explícito de lock; replay posterior idêntico) → sem sobre-reserva → entrega parcial 3/5 sem concluir pedido → replay de confirmação sem movimento → 5/5, reserva zero, nenhum recebível novo, cabeçalho intacto → rollback mantém histórico e volta a negar.
Tentativas 231–233 interrompidas por defeitos do teste (colunas `accounts_receivable`/`entregas`, critério da corrida); logs em `run*-interrupted.log`.

## Outros consumidores com predicado legado
- `generate_production_orders_from_partner` (biológico, fora da revenda) — não alterado.
- `src/hooks/useRespondB2BQuote.ts` só lê o campo; não abre logística.

## Limites
Claims SQL sintéticas; não prova JWT/RLS/Storage. Fiscal/contabilidade pendentes.
