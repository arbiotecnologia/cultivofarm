# Matriz de testes — AUDIT-CF-20261002-01

## Convenções

- `PASS`: evidência objetiva obtida.
- `FAIL`: comportamento executado e divergente.
- `NO-GO`: gate bloqueado por pré-condição ou divergência.
- `NOT RUN`: não executado; nunca equivale a PASS.
- As escritas da campanha limitaram-se à abertura e à contenção posterior da janela SMTP, sempre pelas mesmas duas flags e pelo mecanismo auditável autorizado.

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
| F1-002 | Localizar organização por CNPJ autorizado | PASS | exatamente 1; `8f57c7dd…4626`; CNPJ/e-mail/status/ativo/timestamps conformes |
| F1-003 | Localizar organização pelo marcador em nome fantasia | PASS | exatamente 1; nenhuma outra organização com o marcador |
| F1-004 | Exatamente uma subscription do E01 | PASS | Completo (`completo`), TRIAL, início/criação `2026-10-02T20:10:49.499027Z`; sem segunda assinatura |
| F1-005 | Exatamente uma auditoria de organização | PASS | criação `NULL→aguardando_ativacao`, ator Superadmin, motivo e timestamp conformes |
| F1-006 | Zero convite/job do alvo e destinatário | PASS | contagem 0 |
| F1-007 | Zero Auth user/profile/papel do alvo | PASS | contagens 0 |
| F1-008 | SMTP fechado durante E01 | PASS | global/e-mail OFF antes da preparação de E02 |
| F1-009 | Test mode e allowlist controlada | PASS | ON; um endereço, controlado presente |
| F1-010 | Zero leases ativos | PASS | contagem 0 |
| F1-011 | Job AR BIO preservado | PASS | falhou; tentativa 1; e-mail 0; sem usuário/lease |
| F1-012 | Janela SMTP para E02 | PASS | RPC auditável; somente global/e-mail ON; readiness=true; auditoria 14; nenhum envio |
| F1-012A | Clique E02 / envio | FAIL | chamada humana em `2026-10-02T20:43Z`; Edge v18 retornou 503 após finalizer; SMTP ficou `failed/email_unknown_error` |
| F1-012B | Persistência pós-clique | PASS parcial | 1 job `22c70f4f…fbc1`; 1 Auth `cbdc4ef3…d212`; 1 profile no tenant correto; 1 papel administrador; zero superadmin; nenhuma duplicação |
| F1-012C | Estágio exato da falha | PASS diagnóstico | Auth create, generate link, finalizer, runtime config e claim SMTP retornaram 200; falha registrada no adapter SMTP antes do aceite local |
| F1-012D | Aceite do provedor/entrega | INCONCLUSIVO | SMTP direto, zero outbox/receipt/provider id; `email_unknown_error` não prova se o remoto aceitou antes de a conexão falhar |
| F1-012E | Segurança do retry real | BLOCKED | cooldown/leases estão limpos, mas novo envio pode duplicar mensagem; requer forward-fix de observabilidade/estado ambíguo antes do retry |
| F1-013 | Primeiro acesso/recovery | NOT RUN | depende de E02 verde e ação humana |
| F1-014 | Retry/cooldown/lease/fencing/provider failure | PASS contratual | testes isolados com mocks e contratos server-side; nenhum job real usado |
| F1-014A | Concorrência/takeover/hard-crash E2E com ROLLBACK | NOT RUN | sem conexão transacional PG; não simulado como PASS |
| F1-014B | Cross-tenant autenticado completo | NOT RUN | requer identidades controladas em transação; prova estática/ACL passou |
| F1-014C | Link usado/expirado ponta a ponta | NOT RUN | depende de E02 e identidade controlada; contrato de primeiro acesso passou |
| F1-014D | First-use fiscal/configurações gerais | PASS contratual | núcleo SaaS, plano/features e defaults cobertos nos testes focados; uso persistente aguarda E02/primeiro acesso |
| F1-014E | Idempotência/duplicidade/double-click/retry de criação | PASS contratual | guards server-side e fluxo sem retry automático; clique concorrente bloqueado; não repetiu E01 persistente |
| F1-015 | Cleanup | NOT RUN | campanha em andamento; preservar E01 e trilha |
| F1-016 | Negativa convite sem JWT/JWT inválido | PASS | 401/401; nenhuma mutação |
| F1-017 | Negativa provider settings sem JWT/JWT inválido | PASS | 401/401 |
| F1-018 | Negativa teste de e-mail sem JWT/JWT inválido | PASS | 401/401; nenhum envio |
| F1-019 | Testes Deno das três funções | NOT RUN | runner informou ausência de módulos de teste |
| F1-020 | Criar conta Superadmin temporária por mecanismo oficial | BLOCKED | Auth Admin existente confirma e-mail, mas bloqueia `superadmin`; RPC/trigger preservam a reserva; Supabase externo sem sessão automatizada |
| F1-021 | Fluxo preserva razão oficial e permite marcador no limite existente | PASS | 11/11 testes focados; typecheck e build verdes |
| F1-022 | Regressão global e scanner após refinamento | PASS | 5.372 testes PASS, 4 skipped; scanner 10 Info e zero P0/P1 |
| F1-023 | Provas focadas pré-E02 | PASS | 228/228 em 14 arquivos; criação/checkpoint, planos/features, ACL, convite, falhas, leases e primeiro acesso |
| F1-024 | REFIL e job AR BIO preservados | PASS | REFIL `rascunho` + Completo SUSPENDED; AR BIO falhou/tentativa 1/e-mail 0/sem usuário/lease |
| F1-025 | Config inválida antes do transporte | PASS | `email_config_invalid`, definitivo, sem `send` |
| F1-026 | Factory/conexão falha | PASS | `email_connect_network`/`email_connect_timeout`, definitivo, sem `send` |
| F1-027 | SMTP 421/451 inequívoco | PASS | `email_smtp_4xx`, definitivo/transiente |
| F1-028 | SMTP 550 inequívoco | PASS | `email_smtp_5xx`, definitivo/permanente |
| F1-029 | Timeout/reset/exceção desconhecida durante send | PASS | `email_send_ambiguous`; retry automático bloqueado |
| F1-030 | Send resolve e persistência do aceite falha | PASS | `email_accept_persistence_failed`; estado ambíguo |
| F1-031 | Ambíguo sem confirmação | PASS contratual | RPC retorna marker seguro antes de nova claim; zero incremento/send |
| F1-032 | Confirmação explícita | PASS contratual | Superadmin server-side, mesmo job, cooldown e auditoria existente |
| F1-033 | Duplo clique/5 retries concorrentes | PASS contratual | UI bloqueia clique em voo; row lock + lease/fencing permitem uma claim |
| F1-034 | Reuso de job/Auth/profile/papel | PASS | fluxo retoma a intenção existente; nenhuma recriação |
| F1-035 | Legacy `email_unknown_error` | PASS | tratado como ambíguo sem mutar previamente o job factual |
| F1-036 | Falha definitiva | PASS | mantém retry normal sujeito a cooldown |
| F1-037 | UI/modal/a11y | PASS | status, aviso, Cancelar e Confirmar e reenviar cobertos em desktop responsivo |
| F1-038 | Logs/resposta sem bruto/PII | PASS | somente campos allowlisted e job hash; resposta genérica |
| F1-039 | Open redirect/Auth/RLS | PASS | origem allowlisted, JWT inválido 401 e RPCs novas service-role-only |
| F1-040 | Deno check/typecheck/build/suítes | PASS | Deno check, typecheck e build; 63 focados e 5.376 globais PASS, 4 skipped |
| F1-041 | Scanner RBAC autenticado | NOT RUN | segredo de auditoria ausente; abortou antes de executar |
| F1-042 | Linter Supabase | PASS como baseline | 492 achados preexistentes; novas RPCs verificadas sem grants anon/authenticated |
| F1-043 | Deploy backend | PASS | somente `platform-invite-org-admin`; negativa JWT inválido 401 |
| F1-044 | Job factual pós-deploy | PASS | 1 job; tentativas 1/1; `failed/email_unknown_error`; zero leases; nenhum envio |
| F1-045 | Publicação frontend e smoke oficial | FAIL | Publish solicitado; Lovable e domínio oficial ainda servem `index-B6zZZyrG.js` sem os marcadores do modal ambíguo |
| F1-046 | Contenção imediata pós-forward-fix | PASS | auditoria 15; somente global/e-mail OFF; Test Mode ON, allowlist exclusiva, SMTP/Vault e demais canais preservados; jobs sem alteração ou lease |

## Gate

Fase 0: **PASS**. E01: **PASS**. E02: **FAIL no SMTP (`email_unknown_error`)** após Auth/profile/papel concluídos. Forward-fix aplicado; janela SMTP novamente **OFF/OFF** e **RETRY BLOCKED** até confirmação humana explícita de não recebimento. Fases 2–15: **NOT RUN**.
