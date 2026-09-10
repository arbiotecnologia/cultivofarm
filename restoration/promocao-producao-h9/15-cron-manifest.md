# P0b — Jobs de cron: homologação 6 × produção 5

Nenhum job foi criado, alterado ou removido. Nenhum banco foi consultado.

## Inventário estático (por migration)

| Job | Origem (migration) | Schedule | O que faz | Em produção | Classe |
|---|---|---|---|---|---|
| `fn_run_recurring_generation` | `20260520220351` | ver migration | gera títulos financeiros recorrentes | sim | **PRESERVAR** — não recriar |
| `check-partner-order-sla` | `20260628215811` | `*/30 * * * *` | SLA de pedidos B2B | sim | **PRESERVAR** |
| `refresh-mv-esteira-laboratorio` | `20260703143003` / `20260703145323` | `*/5 * * * *` | refresh de matview | sim | **PRESERVAR** |
| `refresh-mv-fluxo-visita-tecnica` | `20260703143003` / `20260703145323` | `*/5 * * * *` | refresh de matview | sim | **PRESERVAR** |
| `prune-old-audit-logs` | `20260703143003` | `15 3 * * *` | poda 13 tabelas de auditoria | sim, **com `command` divergente** | **REQUER_DECISAO** |
| `h7o-prune-public-validation-rate-limit` | `20260930020000` | `25 3 * * *` | poda o rate limit de validação pública | **não** | **CRIAR na onda correspondente** |

6 em homologação, 5 em produção — bate com a evidência do operador.

## O bloqueio real: `prune-old-audit-logs`

A migration `20261003000000_h8e_fix_prune_audit_logs_performed_at_v1.sql`
corrige duas colunas erradas no `command` do job, mas **valida o baseline por
`md5(command)`** e por `jobid = 5`. Como o `command` de produção tem hash
diferente do de homologação, ela **abortaria por desenho** ao ser aplicada em
produção — comportamento correto da guarda, e por isso mesmo um blocker.

Encaminhamento exigido antes de qualquer onda que a inclua:

1. leitura autorizada em produção de `jobid`, `jobname`, `schedule`, `active` e
   `md5(command)` do job (somente leitura, sem alterar nada);
2. verificar se o `command` de produção contém o mesmo defeito
   (`financial_audit_log … created_at` e `clientes_audit_log … created_at`);
3. se contiver, emitir artefato derivado com o baseline **de produção**;
4. se não contiver, marcar a version como **já satisfeita** e registrá-la na
   convergência sem executar SQL;
5. em nenhum caso alterar `jobid`, `jobname`, `schedule`, `database`, `username`
   ou `active`.

## Regras gerais de cron na promoção

- Nenhum job de entrega externa (e-mail, WhatsApp, fiscal, webhook) pode ser
  criado ativo. Se algum for criado, nasce com `active = false`.
- Nenhum `cron.unschedule` de job existente em produção sem decisão humana; as
  migrations que contêm `unschedule` (`check-partner-order-sla`,
  `refresh-mv-*`) só entram porque recriam o job em seguida — precheck deve
  confirmar recriação na mesma transação.
- `pg_cron` e `pg_net` já existem em produção; não recriar com versão fixada.
- Postcheck de cada onda: contagem de jobs, `jobname`, `schedule` e `active`
  iguais ao esperado, sem job de entrega externa ativo.
