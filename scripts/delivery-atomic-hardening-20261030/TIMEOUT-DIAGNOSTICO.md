# Diagnóstico dc841355 — 30/10/2026

## Resultado atual, não reaproveitado de rodadas antigas

- `test-results.json`: **97 PASS / 0 FAIL / 0 BLOCKED**, exit 0, **257,264 s**.
- `install-results.json`: **9 PASS / 0 FAIL**, exit 0, **242,091 s**.
- Ambas execuções utilizaram `install.sql.review` montado e restaurações frescas; `restore-results.json` contém seis listas vazias.
- Logs: `test_pg-current.log.txt`, `test_install-current.log.txt`; tempos e orçamento em `test_pg-timing.json` e `test_install-timing.json`.
- Não houve mudança de SQL de negócio, PRE/POST, ACL do candidato, frontend, hosted ou publicação nesta correção do timeout.

## Causa comprovada e distinções

O comando anterior agrupava **três restaurações completas**: regeneração do POST, regressão e instalador, sob um único limite de 600 s. O log externo registra `pg_exit=1`: o teste terminou com **80 PASS e uma falha de expectativa**, e o instalador seguinte iniciou sem saída unbuffered. Não foi demonstrado deadlock.

No diagnóstico, PostgreSQL local PID 43451/socket `/tmp/c2-integral-926tomnr` estava vivo, mas `pg_stat_activity` tinha somente processos auxiliares e a consulta diagnóstica; nenhum backend de teste, blocker ou espera de lock. A base estava sem deliveries/profiles/contexto, compatível com o instalador ainda restaurando antes de o comando ser morto. Não é possível reconstruir os locks instantâneos da interrupção a partir dessa observação posterior.

A última falha concreta foi `service_role direct INSERT`: o teste esperava `DELIVERY_MUTATION_CLOSED`, mas o gatilho LIVE `guard_tenant_organization_id` chamou `public.h15_actor_organization` e encontrou `permission denied for schema platform_private`. Reprodução isolada: **0,522 s**, exit 0, limite externo 60 s, lock 2 s, statement 20 s, subprocess 30 s; `timeout-reproduction.log.txt`. UPDATE service teve a mesma negação anterior ao novo gatilho. DELETE service atingiu `DELIVERY_MUTATION_CLOSED`. A correção reconhece exatamente essas negações; não acrescenta GRANT nem finge que o trigger final foi executado em INSERT/UPDATE service.

O ensaio isolado corrigido passou **17 checks em 0,63 s**, `timeout-closure-isolated.log.txt`. A negação do criador legado por `COCKPIT_ENTREGA_STATUS_ESTOQUE_INVALIDO` é prova do guard de estoque anterior, não prova dedicada de INSERT legado alcançando a nova barreira. Esse limite permanece explícito, sem ampliar o ensaio nesta rodada diagnóstica.

## Correções do harness

- `bounded_pg.py` usado só pelo pacote: subprocess SQL 40 s, `lock_timeout=2s`, `statement_timeout=30s`, checkpoints a cada 100 comandos; init/start 30 s e stop 15 s. As funções candidatas mantêm seus próprios limites; não foram relaxados.
- Sessões concorrentes: lock 3 s/statement 8 s; `communicate(timeout=10)` drena stdout/stderr sem o risco de esperar processo com pipe cheio; timeout mata/recolhe o filho e falha explicitamente.
- `test_closure.run(t)` recebe a instância real do runner: evita importar `test_pg` pela segunda vez quando executado como `__main__`, com outro módulo/socket/checks.
- `test_install.py` imprime checkpoints de restore, drift, COMMIT/POST e rollback.
- `run_bounded.py`: um runner por processo, stdout unbuffered, orçamento 480 s e exit 124 explícito no timeout total. Executar separadamente; orçamento agregado de até 960 s, com checkpoints, não um comando silencioso de 600 s.

```text
python3 -u scripts/delivery-atomic-hardening-20261030/run_bounded.py test_pg
python3 -u scripts/delivery-atomic-hardening-20261030/run_bounded.py test_install
```

Histórico preservado em `history/timeout-dc841355/`. SHA dos artefatos/evidências em `SHA256SUMS`. Referência observada após as execuções: `826f44fc95ca957e3a5bc4745c14a2b14125298c`; o controlador gerencia commits, não foi criado commit manual.

## Limites

O ensaio atual é conclusivo para os testes executados, não GO operacional. Identidades/claims são sintéticas sobre PostgreSQL real; não JWT/RLS hosted. Inventário/migração completo de callers Edge/serviço e closure universal continuam fora deste diagnóstico. Fiscal/automações/cobranças e UI permanecem fechados. A correção não prova compatibilidade de revogar service do legado para consumidores externos desconhecidos.