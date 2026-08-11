# Auditoria E2E da OS — do nascimento à finalização

Auditoria somente-leitura executada no staging `ikaauvsflpmamgxmkhoq` sobre a esteira completa: abertura → aprovação → programação → produção (lote) → CQ → envase → estoque → reserva → entrega → confirmação → finalização.

## Resumo

O fluxo está funcional até o envase (corrigido na última fase). **Duas etapas seguintes estão quebradas pelo mesmo defeito do envase**: os motores gravam rótulos de ação que a constraint de estoque não aceita. Além disso, há três lacunas de consistência na criação de lote, na criação de entrega e na regra de finalização.

## Bloqueios confirmados (impedem concluir a OS)

**B1 — Confirmar entrega falha (crítico).**
`rpc_cockpit_confirmar_entrega_v1` insere movimentação com `acao = 'baixa_entrega'`. A constraint `estoque_movimentacoes_acao_valida` só aceita: entrada, reserva, cancelamento_reserva, expedicao, estorno_expedicao, entrega, descarte, ajuste, edicao, perda, devolucao, consumo, transferencia. Toda confirmação de entrega com estoque vinculado aborta a transação. Ação canônica correta: `expedicao` (status reservado → expedido).

**B2 — Cancelar reserva falha (crítico).**
`rpc_cockpit_cancelar_reserva_v1` insere `acao = 'estorno_reserva'`, também fora da lista. Ação canônica correta: `cancelamento_reserva`.

Consequência prática: a OS atualmente em `envase` avança até estoque/reserva e trava na confirmação de entrega, sem caminho de estorno.

## Riscos de consistência (não bloqueiam, mas geram dado sujo)

**R1 — Geração de lote sem motor transacional.**
`gerarLote` no hook faz `insert` direto em `lotes` com checagem de unicidade feita antes no cliente. Dois cliques simultâneos criam dois lotes para a mesma programação; não há índice único em `lotes(programacao_id)`.

**R2 — Criação de entrega sem motor nem idempotência.**
`criarEntrega` insere direto em `entregas` e, em seguida, chama `enviar_entrega`, que leva o status da OS a `entregue` antes de qualquer confirmação real. Duplo clique cria duas entregas para a mesma OS.

**R3 — `pode_finalizar` não exige entrega confirmada.**
Em `vw_os_integridade_esteira`, `pode_finalizar = estoque_id IS NOT NULL AND entrega_id IS NOT NULL` — basta a entrega existir, mesmo em `separado`. A coluna `entrega_confirmada` já existe e é a checagem correta.

**R4 — Diagnóstico vazio.**
A mesma view devolve `bloqueios = '{}'` e `pendencias_informativas = '{}'` fixos, então a UI nunca explica ao operador o que falta.

**R5 — Status `aguardando_reserva` órfão.**
Existe no enum `status_os`, mas não aparece na escada de transições de `check_os_status_transition` / `_avancar_os_status`. Qualquer gravação nesse status é rejeitada pelo gatilho.

## Correção proposta

Fase única, somente staging, com guarda de ambiente fail-closed (bloqueia `navfzbwgwzruipouyfnk`), em uma migration nova:

1. Alinhar `rpc_cockpit_confirmar_entrega_v1` para `acao = 'expedicao'` e `rpc_cockpit_cancelar_reserva_v1` para `acao = 'cancelamento_reserva'`, preservando o motivo/observação atual.
2. Criar `rpc_cockpit_criar_entrega_v1`: valida estoque reservado para a OS, cria a entrega sob `pg_advisory_xact_lock`, é idempotente por OS+estoque e avança a esteira para `em_entrega` (não para `entregue`).
3. Criar `rpc_cockpit_gerar_lote_v1` com lock por programação, mais índice único parcial em `lotes(programacao_id)`.
4. Recriar `vw_os_integridade_esteira` com `pode_finalizar = estoque_id IS NOT NULL AND entrega_confirmada` e com `bloqueios`/`pendencias_informativas` calculados de verdade (sem lote, CQ não aprovado, sem envase, sem reserva, entrega não confirmada).
5. Incluir `aguardando_reserva` na escada de transições, entre `envase` e `pronto_entrega`.

No frontend, apenas trocar as chamadas diretas por RPC: `gerarLote` e `criarEntrega` em `src/hooks/useEsteiraLaboratorio.ts`, e ampliar `traduzErroCockpit` com as novas mensagens.

## Validação

Ensaio SQL no staging percorrendo a OS `c6a00c9e` de envase até finalizada (reserva → entrega → confirmação → finalização), regressão `tsgo`, `build` e Vitest completo. Nada de produção, publicação ou SEFAZ.
