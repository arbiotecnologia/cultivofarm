# Entrega — candidato parcial, NO-GO operacional

Base publicada informada pelo proprietário: `859b8a8cf21caf569a3231cd74110a76c9bc2965`, após 595 PASS e UI real com `index-CYkBENfk.js`. Esta é evidência externa registrada, não publicação executada nesta rodada nem correlação independente obtida pelo assistente. Runtime src/public permanece byte-equivalente à base nesta comparação.

## Provas executáveis desta rodada

`python3 scripts/delivery-atomic-hardening-20261030/test_pg.py` inicia PG17 descartável por socket /tmp; nunca usa PGHOST ou writers hosted. Resultado final: **36 PASS, 0 FAIL de execução, 1 BLOCKED operacional reproduzido**. O BLOCKED não é teste dispensado: o cancelador efetivamente falha no índice único ao liberar split quando existe saldo principal. A transação reverte estorno/saldo/status/receipt, verificado por hash das linhas de estoque e ausência de movimento de estorno. Logs de falhas iniciais preservados; não somar reexecuções.

Testes: grupo real dois itens/split/expedição, replay exato/conflito, negatives tenant/papéis/inativo/anon/quantidades, duas conexões com waits reais e revogação após advisory/linha antes de replay, replay concorrente, item2 com rollback de estoque/ledger/receipts, tentativa de INSERT título a partir de trigger real de entrega e rollback. Injeções locais são triggers de falha, não substituições de motores/autorizadores.

`c2_accounting_pending_guard` MD5 `669b19490a7a9700f0158db4b31885ad` foi executado sem alterar o corpo em tabela LIKE de probe: `entregue` com snapshot pending foi negado. Isso é prova isolada do trigger, não composição B2B integral. `tg_auto_b2b_receivable` MD5 `0f679538fe394924b140e54938a3bb9e` permanece intacto; não foi demonstrado positivo auto=true da cadeia B2B completa.

## Correção mínima candidata desta rodada

A barreira downstream agora está em `candidate.sql.review`, não apenas no harness. Triggers `a00_delivery_no_downstream` abortam writes em títulos/parcelas/recibos/documentos/fiscal/eventos/outbox durante contexto privado de entrega. Trigger adicional anterior ao autogerador bloqueia qualquer transição de status partner_orders nesse contexto: necessário porque tg_auto_b2b_receivable captura algumas exceções filhas e pode continuar com auditoria. Não altera auto_generate_receivable, fiscal, snapshots, producer ou trigger contábil. B2B e OnFarm continuam fechados no contrato de grupo; não contornar contabilidade para produzir positivo B2B.

## ACLs e migração de callers antes de release

Captura atual confirma authenticated INSERT/UPDATE/DELETE em entregas, com permissive papel e restrictive tenant; estoque_produto/movimentacoes permitem SELECT mas não DML authenticated. **O candidato não revoga essas ACLs nem resolve universalmente APIs antigas.** A instalação completa precisa primeiro migrar consumidores equivalentes e somente depois fechar DML, preservando SELECT/RLS e writers privilegiados revisados.

- `src/pages/Entregas.tsx:702`: UPDATE direto para saída/status. Substituir por contrato canônico de transição com observed CAS e receipt; o overload de grupo não substitui esse comando.
- `src/pages/Entregas.tsx:732`: UPDATE direto cancelada depois de estorno separado. Substituir somente quando cancelador/recomposição split estiver provado.
- Criação/expedição via `useEsteiraLaboratorio`/motor e confirmação via `ConfirmarEntregaDialog` são RPCs irmãs contidas; seus direitos não podem ser reabertos implicitamente.
- SELECTs em relatórios, portais/mobile, impressão, BI, embalagens e reconciliação financeira devem permanecer disponíveis conforme autoridade atual.
- Callers SQL/Edges/automação externos ainda exigem inventário de dependências/texto/dynamic SQL antes de fechar ACLs. Uma busca textual frontend não certifica ausência de writer externo.

## Limites e artefatos ainda faltantes

`restore-results.json`: 19 funções/views não restaurados (finance_private/tenant_smtp_executor), default private.h8a_index_audit.id sem sequência e trigger accounts_payable.protect_payable_allocation não restaurado. Constraints, policies e índices capturados foram restaurados sem falha. Corpos não foram sanitizados. Fixture baseline usa replication_role=replica exclusivamente no seed de manufatura/licença/identidade; todos os triggers são reativados para cada writer testado. Auth claim transport e tenants são sintéticos, não JWT/RLS hosted.

Faltam: recomposição split canônica, positivo tenant B próprio, oversell concorrente, cancelador positivo/replay/revogação, composição B2B completa e inventário externo de writers. Instalador transacional pinado/PRE/POST/rollback deny-only ainda **não entregue**; candidate.sql.review é implementação inativa parcial, não script executável aprovado para produção. Não publicar/reabrir frontend/aplicar este candidato enquanto esses blockers persistem. Reserva batch independente e runtime publicado não alterados.