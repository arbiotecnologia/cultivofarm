# Rollback por onda — Promoção H9

Princípio: **forward-only no repositório, restore point no banco.** Nenhuma
migration já aplicada é editada, revertida ou removida do ledger. O caminho de
volta é (1) restore point nomeado, (2) rollback SQL específico da onda quando
existir, (3) restauração PITR como último recurso.

## Pré-condição inegociável

Antes de cada onda:

1. Backup/PITR de produção comprovado **por escrito, com data e hora**.
   A organização está no plano Free — o backup diário de plataforma **não**
   substitui essa prova. Sem ela: **NO-GO**.
2. Restore point nomeado imediatamente antes da onda: `pre_p1_h9`, `pre_p2_h9`,
   `pre_p3_h9`, `pre_p4_h9`, `pre_p5_h9`.
3. Registro do ledger (total e última versão) antes e depois.

## Janela de decisão

| Situação | Ação |
|---|---|
| Postcheck "esperado: 0 linhas" retornou linha | ABORT + rollback da onda |
| Advisor de segurança piorou acima do baseline aprovado | ABORT + rollback |
| Evento externo registrado (comunicação, fiscal, webhook) | ABORT imediato + rollback |
| Erro de execução no meio da onda | ABORT; a migration em curso roda em transação própria |
| Onda concluída e limpa | CONTINUE para a próxima janela |

## P1 — Fundações e segurança (2 migrations)

Conteúdo: `CREATE OR REPLACE FUNCTION` + `REVOKE`/`GRANT` de EXECUTE.
Rollback: reaplicar a definição anterior das funções, capturada no precheck via
`pg_get_functiondef`, e restaurar as ACLs registradas. Sem perda de dado
possível. Restore point só é necessário como rede de segurança.

**Artefato obrigatório antes de executar:** snapshot textual das definições e
ACLs atuais das funções afetadas, salvo como evidência da janela.

## P2 — Domínio e dados (31 migrations)

Onda de maior risco: contém `ALTER TABLE`, criação de tabela e **índices sem
`CONCURRENTLY`** (37 arquivos no conjunto total têm essa característica).

Rollback:

1. Índices criados na onda: `DROP INDEX` pelos nomes registrados no postcheck.
2. Colunas adicionadas: manter (adição é compatível); remover apenas com
   autorização explícita, pois `DROP COLUMN` destrói dado.
3. Tabelas novas: `DROP TABLE` somente se comprovadamente vazias e criadas
   nesta onda.
4. Falha estrutural ampla: restaurar `pre_p2_h9`.

**Mitigação de lock:** `lock_timeout='5s'`; se um `ALTER TABLE` não obtiver o
lock, ele falha rápido e a onda é repetida na próxima janela — nunca esperar
lock em tabela quente.

## P3 — Comunicação (13 migrations)

Rollback: restaurar definições anteriores de função/policy e remover objetos
novos vazios. Nenhum dado de destinatário é copiado; nenhuma fila é processada.
Flags de entrega permanecem OFF durante todo o rollback — o risco a evitar é o
disparo retroativo de mensagens acumuladas. Se qualquer evento tiver sido
enfileirado, **primeiro** desativar o consumidor, depois reverter.

## P4 — Fiscal (15 migrations)

Rollback: restaurar definições anteriores; **não** tocar em séries e sequências
fiscais. Registros de `fiscal_xsd_registry` são imutáveis por desenho — se a
onda falhar após inserir bundle XSD, o caminho é restaurar `pre_p4_h9`, não
tentar deletar.

`tpAmb` de produção permanece proibido antes e depois; a promoção não altera o
ambiente fiscal.

## P5 — Visita técnica H9 (10 migrations)

Rollback: os forwards de visita têm rollback correspondente já escrito em
`restoration/homologacao-h9/h9{c,d,e,g,gr}-rollbacks/` e em
`restoration/visita-portais-tecnicos/rollback.sql`. Reaplicar o rollback da fase
correspondente restaura a definição anterior das RPCs sem tocar em dado.

## P6 — Frontend e Edge Functions

Rollback: republicar a versão anterior do frontend e redeployar as Edge
Functions do commit anterior. Banco não é tocado. Reversão independente das
ondas de banco.

## Migrations destrutivas fora de onda

As 15 migrations classificadas como destrutivas (`DROP TABLE`, `TRUNCATE`,
`DROP COLUMN`, `DELETE`) **não têm rollback comprovado individualmente** e por
isso estão fora do pacote. Cada uma exige, antes de qualquer promoção:

1. prova de que o objeto/linha alvo não existe em produção, ou
2. rollback SQL específico, ensaiado em banco temporário restaurado do baseline
   de produção, com evidência anexada.
