# Módulo de Comunicação — Encerramento de desenvolvimento (Release Candidate)

**Status:** Desenvolvimento das Fases 1/2/3/4 do módulo de Comunicação
**concluído**. Kit de deploy, edge functions, SQL, UI, tipos e testes
automatizados congelados como Release Candidate.

**Base final:** commit posterior a `0ad0bb472bc5665e0710bb87bb22b916f3e7605f`
(após auditoria RC — ver `.lovable/comunicacao-release-candidate-report.md`).

## Concluído (não reabrir sem autorização explícita)

- **Fase 1** — Fundação (templates, regras, eventos, outbox, preferências,
  RLS, RPCs). SQL em `restoration/comunicacao-fase1/`.
- **Fase 2** — Triggers OS regular/on-farm, `_comunicacao_build_snapshot_v2`,
  worker (`process-communication-outbox`), adapters SMTP/WhatsApp
  (v24.0/v25.0 allowlist)/in-app, semântica correta de attempts
  (`fail_v2`/`defer`/`dead_letter`), health function, RPC `_v2` para
  broadcast administrativo com `p_source_type/id = null`. SQL em
  `restoration/comunicacao-fase2/`.
- **Fase 3** — Kit de deploy `restoration/comunicacao-deploy/`
  (validate/apply/deploy-functions/verify/rollback/smokes/checklist/scheduling).
  Endpoint oficial imutável derivado de `STAGING_PROJECT_REF`; sem URL
  arbitrária; sem log de secrets; F2/F4 atômicos via
  `psql --single-transaction`.
- **Fase 4** — Webhook `whatsapp-status-webhook` (HMAC, cap de body,
  concurrency limitada, feature flag real), tabela append-only
  `comunicacao_provider_receipts`, RPC monotônica
  `rpc_record_whatsapp_delivery_status`, coluna
  `provider_delivery_status` e recibos observáveis na fila,
  rollback fail-closed F4→F2 detectando 4 artefatos.
- **Fase 5 (RC)** — Auditoria ponta a ponta, correção de 5 defeitos
  concretos (worker sem raw PG error; `whatsapp_webhook` no health
  tipo+UI; comentário do deploy; títulos env/checklist alinhados a
  Fases 1/2/4; README com Fase 4 e 3 funções). 5 testes de regressão
  adicionados. Relatório em `.lovable/comunicacao-release-candidate-report.md`.

## Sinais de qualidade

- `bunx tsgo --noEmit` limpo.
- `bunx vite build` OK.
- `bunx vitest run src/test/comunicacao` — 212/212.
- `bunx vitest run` (suíte completa) — 2300/2305, 4 skipped, 1 falha
  **pré-existente flaky** em `src/test/portalAcompanhamentoProdutor.test.tsx`,
  fora do escopo do módulo; **preservada sem máscara**.

## Pendências para operação (fora do desenvolvimento)

Bloqueadores externos que impedem **GO PROD**:

1. Projeto Supabase de staging real (ou confirmação explícita
   `I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=true`).
2. Secrets Meta (`WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`) em Project Settings → Secrets. Flag
   `WHATSAPP_WEBHOOK_ENABLED=true` **apenas** após handshake real.
3. SMTP e Push (FCM/APNs) configurados para adapters respectivos.
4. Execução do kit em staging: `validate` → `apply` → `deploy-functions`
   → `verify` (com `STAGING_TEST_ADMIN_JWT` para health check autenticado).
5. Homologação manual completa das seções 1-10 do
   `restoration/comunicacao-deploy/checklist-manual.md`.
6. Handshake real com Meta Cloud API para receipts
   `sent → delivered → read → failed`.
7. Preservar a falha flaky `portalAcompanhamentoProdutor` em backlog
   separado (não relacionada ao módulo de comunicação).

## Parecer

- **GO PARA STAGING** — o pacote está apto a ser aplicado em ambiente de
  staging seguindo o kit e o checklist.
- **NÃO GO PARA PRODUÇÃO** até staging + homologação manual + provider
  handshake concluírem com evidência documentada.
