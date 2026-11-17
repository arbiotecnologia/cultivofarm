# Ensaio controlado em produção (swzpzcwiasxmjutrmvkm) — só após root revisar

Pré-condições: PRE_PASS de `01-pre.sql`; bateria local (prod 116/116, transição 42/42) verde no commit revisado; HML executado.
1. Root instala `02a` → `02b` (→ `02c` após PRE próprio). Frontend: gate OFF, nada publicado.
2. Contas: **novas** contas sintéticas `qa-fin-{a,b,c}@…` + gestor/técnico sintéticos, criadas pelo root no fluxo canônico; parceiros A/B sintéticos mesma empresa sintética, C em outra. Proibido: usuários de negócio, teste4, `d7edc250…`, convites/e-mails (delivery OFF).
3. Papel Financeiro só via `tenant_admin_user_access_exec_v1` alvo `b2b_finance` (CAS).
4. `TARGET=rehearsal REHEARSAL_CONFIRM=SINTETICO-ISOLADO-ROOT-REVISOU` + `../hml/qa/provision_fixtures.py` e `../hml/qa/jwt_suite.py` (mesmo código, alvo por allowlist) com tokens no ambiente do auditor; roteiro browser = `../hml/qa/ROTEIRO.md`.
5. Encerramento: revogar papéis/vínculos pela transição canônica (histórico preservado), sem DELETE.
Títulos: ver `../LIMITES-PROVA.md` — ensaio não prova isolamento de títulos.
