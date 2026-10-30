# Entrega — candidato parcial, NO-GO operacional

## Atualização executada 30/10 — revisão do27e8d586

Resultado atual executável: **51 PASS / 0 FAIL / 0 BLOCKED no runner**, sem somar rodadas anteriores. `restore-results.json` contém seis listas vazias: funções/views, defaults, constraints, policies, triggers e índices. A captura adicional read-only `capture/restore-supplement.json` restaura schemas finance_private/tenant_smtp_executor e sequência private faltante; não contém dados ou secrets. Nenhum objeto foi substituído por stub.

O delta `build_motor.py` valida MD5 LIVE c71a9e848eff0a522cbaa3a7ec2949a5 e gera `motor-delta.sql.review`: recomposição ocorre dentro de rpc_estoque_operar_v1, usando contexto privado verdadeiro, triggers/ledger canônicos e índice único preservado. O split fica estornado com saldo zero e histórico; o saldo/volume retorna à linha principal compatível, com dois movimentos verificados. Cancelamento positivo, replay exato, motivo divergente e falha depois do retorno com rollback passaram.

O overload de grupo agora exige timestamp observado de OS e de cada estoque; recibo é contextual por organização/ator/ação/chave. Gate global precede locks OS/stock, há lock de cliente do tenant, revalidação antes de replay e comparação CAS apenas em primeira execução. Triggers downstream são instalados pelo candidate, não pelo harness. B2B/OnFarm, frontend e flags permanecem intactos.

Provas adicionais: tenant B próprio positivo com mesma chave A/B; oversell real em duas conexões (segunda operação nega CAS obsoleto); revogação durante advisory e gate/linha coordenados; GUC spoof; ACL de stock/contexto privado; ACK divergente por corrupção de receipt em trigger local sem substituir motor; rollback integral item2 e cancelamento; zero financeiro/fiscal/outbox. Batch independente real disputando stock com grupo concluiu, enquanto grupo negou CAS obsoleto, sem deadlock nessa janela. Isso não prova todas as ordens transitivas.

Falhas iniciais preservadas em `history/`: revogação externa enquanto gate já pertence ao worker produziu lock timeout, corrigida no ensaio para revogação real no holder do gate; caracterização esperava deadlock, mas observou batch concluído e conflito CAS, corrigida a expectativa sem alterar o batch. A correção split foi comprovada antes dessas ampliações com40PASS.

**Ainda não instalável:** faltam cancelador revogação concorrente dedicado, atores distintos no mesmo tenant com chave igual, outras janelas transitivas de origem OS/cliente e snapshots de cancelamento, inventário/migração completa dos writers diretos e composição de todos os destinos financeiros/documentais (barreira atual tem dez tabelas, não é inventário universal). Testes são PostgreSQL real com identidades/tenants e transport claims locais, não JWT/RLS hosted. Instalador pinado/PRE/POST/deny rollback não foi emitido como aprovado: exige fechar esses pontos e ensaiar instalação completa. Não liberar ACL/frontend. Seções anteriores abaixo são histórico e suas contagens/pendências foram superadas apenas conforme esta atualização.

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