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
| F0-006 | Testes focados de segurança e D51.2 | PASS | 70/70 |
| F0-007 | Typecheck | PASS | saída sem erro |
| F0-008 | Suíte global oficial | PASS | 5.371 PASS, 4 skipped |
| F0-009 | Scan de dependências | INCONCLUSIVO | parser do lockfile falhou em `xlsx`; limitação registrada |
| F0-010 | Cross-tenant autenticado por perfis | NOT RUN | reservado às fases de domínio com fixtures em ROLLBACK |
| F0-011 | Concorrência/idempotência por domínio | NOT RUN | reservado às fases 1–14 |
| F0-012 | Desktop/mobile/a11y funcional | NOT RUN | reservado à Fase 13 |
| F0-013 | Build de produção/PWA | PASS com alerta | 4.669 módulos; bundle principal ~5,60 MB |
| F0-014 | ESLint global | FAIL histórico/P2 | 3.505 erros e 126 avisos em 543 arquivos |
| F0-015 | Linter Supabase | PASS como baseline | 492 alertas classificados; sem correção em massa |
| F0-016 | Slow queries | PASS como baseline | maiores custos em harnesses/auditorias, sem gargalo produtivo comprovado |

## Fase 1 — D51.2

| Caso | Cenário | Resultado | Evidência |
|---|---|---|---|
| F1-001 | Razão social/CNPJ oficiais preservados e marcador seguro possível em nome fantasia | PASS | razão read-only; nome fantasia editável e limitado a 200 caracteres; teste focado |
| F1-002 | Localizar organização por CNPJ autorizado | NOT RUN | E01 ainda não executado |
| F1-003 | Localizar organização pelo marcador em nome fantasia | NOT RUN | E01 ainda não executado |
| F1-004 | Exatamente uma subscription do E01 | NOT RUN | organização ainda não criada |
| F1-005 | Exatamente uma auditoria de organização | NOT RUN | organização ainda não criada |
| F1-006 | Zero convite/job do alvo e destinatário | PASS | contagem 0 |
| F1-007 | Zero Auth user/profile/papel do alvo | PASS | contagens 0 |
| F1-008 | SMTP fechado | PASS | global OFF; e-mail OFF |
| F1-009 | Test mode e allowlist controlada | PASS | ON; um endereço, controlado presente |
| F1-010 | Zero leases ativos | PASS | contagem 0 |
| F1-011 | Job AR BIO preservado | PASS | falhou; tentativa 1; e-mail 0; sem usuário/lease |
| F1-012 | E02/SMTP/envio | NOT RUN | bloqueado até E01 PASS |
| F1-013 | Primeiro acesso/recovery | NOT RUN | depende de E02 verde e ação humana |
| F1-014 | Retry/cooldown/lease/fencing | NOT RUN | não executar contra job real; fixture futura controlada |
| F1-015 | Cleanup | NOT RUN | nenhum dado da campanha foi criado nesta rodada |
| F1-016 | Negativa convite com JWT inválido | PASS | HTTP 401; nenhuma mutação |
| F1-017 | Negativa provider settings com JWT inválido | PASS | HTTP 401 |
| F1-018 | Negativa teste de e-mail com JWT inválido | PASS | HTTP 401; nenhum envio |
| F1-019 | Testes Deno das três funções | NOT RUN | runner informou ausência de módulos de teste |
| F1-020 | Criar conta Superadmin temporária por mecanismo oficial | BLOCKED | Auth Admin existente confirma e-mail, mas bloqueia `superadmin`; RPC/trigger preservam a reserva; Supabase externo sem sessão automatizada |
| F1-021 | Fluxo preserva razão oficial e permite marcador no limite existente | PASS | testes focados do checkpoint e identificação |

## Gate

Fase 0: **PASS**. Fase 1: **BLOCKED somente no clique humano autenticado de E01**; o NO-GO por prefixo foi reclassificado e resolvido por `nome_fantasia`. Fases 2–15: **NOT RUN**, bloqueadas sem E01 comprovado.
