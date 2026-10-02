# Matriz de testes — AUDIT-CF-20261002-01

## Convenções

- `PASS`: evidência objetiva obtida.
- `FAIL`: comportamento executado e divergente.
- `NO-GO`: gate bloqueado por pré-condição ou divergência.
- `NOT RUN`: não executado; nunca equivale a PASS.
- Todas as consultas canônicas desta rodada foram somente leitura.

## Fase 0

| Caso | Cenário | Resultado | Evidência |
|---|---|---|---|
| F0-001 | Vínculo ao projeto canônico | PASS | ref `swzpzcwiasxmjutrmvkm` |
| F0-002 | Inventário frontend/backend/banco/storage/cron | PASS | contagens registradas no documento mestre |
| F0-003 | Tabelas públicas sem RLS | PASS | contagem 0 |
| F0-004 | Scanner profundo | PASS com riscos | 10 Info; 0 Critical/Error/Warning |
| F0-005 | Hardening das duas funções administrativas | PASS | CORS fail-closed, JWT explícito e erros sanitizados |
| F0-006 | Testes focados de segurança | PASS | 59/59 |
| F0-007 | Typecheck | PASS | saída sem erro |
| F0-008 | Suíte global oficial | PASS | 5.371 PASS, 4 skipped |
| F0-009 | Scan de dependências | NOT RUN completo | parser do lockfile falhou em `xlsx`; limitação registrada |
| F0-010 | Cross-tenant autenticado por perfis | NOT RUN | reservado às fases de domínio com fixtures em ROLLBACK |
| F0-011 | Concorrência/idempotência por domínio | NOT RUN | reservado às fases 1–14 |
| F0-012 | Desktop/mobile/a11y funcional | NOT RUN | reservado à Fase 13 |

## Fase 1 — D51.2

| Caso | Cenário | Resultado | Evidência |
|---|---|---|---|
| F1-001 | Fluxo permite prefixo na razão social oficial | FAIL | razão social da API fica read-only e é enviada como nome |
| F1-002 | Localizar organização por CNPJ autorizado | FAIL | contagem 0 |
| F1-003 | Localizar organização por prefixo em nome/razão/fantasia | FAIL | contagem 0 |
| F1-004 | Exatamente uma subscription do E01 | NO-GO | organização inexistente |
| F1-005 | Exatamente uma auditoria de organização | NO-GO | organização inexistente |
| F1-006 | Zero convite/job do alvo e destinatário | PASS | contagem 0 |
| F1-007 | Zero Auth user/profile/papel do alvo | PASS | contagens 0 |
| F1-008 | SMTP fechado | PASS | global OFF; e-mail OFF |
| F1-009 | Test mode e allowlist controlada | PASS | ON; um endereço, controlado presente |
| F1-010 | Zero leases ativos | PASS | contagem 0 |
| F1-011 | Job AR BIO preservado | PASS | falhou; tentativa 1; e-mail 0; sem usuário/lease |
| F1-012 | E02/SMTP/envio | NOT RUN | bloqueado pelo FAIL de E01 |
| F1-013 | Primeiro acesso/recovery | NOT RUN | depende de E02 verde e ação humana |
| F1-014 | Retry/cooldown/lease/fencing | NOT RUN | não executar contra job real; fixture futura controlada |
| F1-015 | Cleanup | NOT RUN | nenhum dado da campanha foi criado nesta rodada |

## Gate

Fase 0: **PASS**. Fase 1: **NO-GO**. Fases 2–15: **NOT RUN**, bloqueadas sem E01 comprovado.
