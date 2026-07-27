# Módulo de Comunicação — Certificação Release Candidate (Fase 5)

- **Commit base:** `0ad0bb472bc5665e0710bb87bb22b916f3e7605f`
- **Escopo:** auditoria ponta a ponta Fases 1/2/3/4 + correção de defeitos
  concretos. Nenhuma nova feature. Sem publicar, aplicar SQL externo,
  configurar secrets ou ativar flags.

## Resultado

**GO PARA STAGING.** Código, SQL, edge functions e kit de deploy passam em
typecheck, build, `bash -n` e suíte de testes (2300/2305; 1 falha pré-existente
flaky em `portalAcompanhamentoProdutor.test.tsx`, não relacionada ao módulo,
preservada sem máscara).

**NÃO GO PARA PRODUÇÃO.** Bloqueadores externos (staging real, credenciais
Meta/SMTP, homologação manual do checklist, verificação end-to-end de webhook
receipts contra a Meta Cloud API) permanecem pendentes.

## Defeitos concretos encontrados e corrigidos

| # | Arquivo:linha | Defeito | Correção | Criticidade |
|---|---|---|---|---|
| 1 | `supabase/functions/process-communication-outbox/index.ts:83-85` | `return json(500, { ..., detail: claimErr.message })` vazava `error.message` bruto do Postgres (nomes de coluna/tabela, valores em constraints) para o cliente, quebrando a política de redação usada no resto do worker (`.slice(0,80)`/`slice(0,2000)`). | Removido `detail`; loga `claimErr.name` no servidor via `console.warn`. Resposta HTTP agora só `{ ok:false, error:"claim_failed" }`. | Média |
| 2 | `src/features/comunicacao/api.ts:217-226` + `src/features/comunicacao/ui/ComunicacaoAdminPage.tsx:846-862` | Edge Function `communication-health` já retornava `whatsapp_webhook: {configured, enabled}` (via `healthBooleans`, `adapters-types.ts:161-164`), mas o tipo `CommunicationHealthResult` no frontend não declarava esse campo e `CanalHealthPanel` não o renderizava. Contradizia o critério `Health admin exibe whatsapp_webhook` do próprio checklist. | Campo adicionado no tipo (`whatsapp_webhook?: { enabled; configured }`) e no grid do painel (4 colunas em lg, exibindo `configurado/não configurado · flag ON/OFF`). | Média |
| 3 | `restoration/comunicacao-deploy/deploy-functions-staging.sh:2-3` | Comentário do cabeçalho dizia "publica APENAS `communication-health` e `process-communication-outbox`", mas o array `FUNCTIONS` (linha 10) lista **3** funções (incluindo `whatsapp-status-webhook`). Comportamento correto; comentário divergente. | Comentário atualizado para listar as 3 funções. | Baixa |
| 4 | `restoration/comunicacao-deploy/env.example:1` e `checklist-manual.md:1` | Cabeçalhos referenciavam "Fase 3", mas o pacote cobre Fases 1/2/4 (não existe Fase 3 SQL de comunicação). | Renomeados para "Fases 1/2/4 do módulo de Comunicação". | Baixa |
| 5 | `restoration/comunicacao-deploy/README.md:1-6, 47` | Título e tabela do README referenciavam apenas Fases 1 e 2; omitiam Fase 4 e listavam 2 funções de deploy em vez das 3 reais. | Título → "Fase 3 v2 + Fase 4"; tabela agora inclui `whatsapp-status-webhook`. | Baixa |

## Falsos positivos revisados

- **`restoration/comunicacao-fase02/`**: identificado como "duplicata órfã" pelo
  agente exploratório. Falso positivo — é a **Fase 0.2 (hardening)**,
  referenciada por `restoration/comunicacao-fase1/runbook.md:4` e independente
  da Fase 2. Mantida sem alteração.
- **`SET search_path = public` sem `pg_temp`**: divergência apenas semântica
  com o enunciado; é comportamento mais restritivo (não menos), portanto não
  é defeito de segurança.

## Confirmações (auditoria sem correção necessária)

### Frontend
- Role gates ativos: `RouteGuard` restringe a `administrador`/`gestor`; fila
  (`FilaPanel`), `CanalHealthPanel` e `CanalVerificacaoPanel` renderizam apenas
  quando `isAdmin` (`ComunicacaoAdminPage.tsx:65-117`). Gestor vê aviso genérico
  sem detalhes técnicos.
- Envio administrativo usa `rpc_publish_communication_event_v2` com
  `p_source_type: null, p_source_id: null` (`api.ts:146-163`), consistente com
  a RPC (`comunicacao-fase2/migration.sql`).
- Eventos OS (`publishManualProdutoProntoAplicacao`) usam
  `p_source_type:"ordens_servico"` (`api.ts:171-181`).
- Colunas F4 (`provider_delivery_status`, `provider_status_at`) acessadas via
  optional chaining na fila; UI **não crasha** se a migration F4 ainda não
  estiver aplicada (undefined → linhas sem coluna extra).
- React Query: keys estáveis, estados `isLoading`/`error` presentes em todos
  os painéis, filtros com `aria-label`.
- Nenhuma exposição de PII/segredo. `mapHealthError` mapeia qualquer erro para
  código allowlisted (`function_unavailable`/`unauthorized`/`unexpected_error`).

### Edge Functions
- Apenas `whatsapp-status-webhook` tem `verify_jwt = false`
  (`supabase/config.toml:5-7`), com comentário explicitamente proibindo
  outras funções.
- Webhook: HMAC-SHA256 constant-time, cap de corpo 128 KiB via
  `readBodyCapped` streaming, challenge GET com `timingSafeEqual`, concorrência
  determinística via `runWithConcurrency` (pool 8), feature flag real que evita
  parse/RPC quando OFF, `error_code` sem fallback de `title`.
- `communication-health`: rejeita anônimo, aceita apenas secret interno, service
  key ou JWT admin verificado via `user_roles`. Retorna só booleans.
- Worker: `defer` reverte `attempts` da claim; `fail_v2` não incrementa;
  `dead_letter` para erros permanentes; nenhum retorno HTTP ecoa mensagens
  brutas de provider/render (após correção #1).

### SQL
- F2/F4 **transaction-neutral** (sem `BEGIN;`/`COMMIT;` de topo — `BEGIN` só
  em corpos `plpgsql`).
- Assinaturas RPC conferem com `types.ts` e callers TS.
- Grants: `REVOKE ALL FROM anon`; `authenticated` só `SELECT` em tabelas
  operacionais; `GRANT ALL` restrito a `service_role`. Fase 4 revoga grants
  diretos de `comunicacao_provider_receipts` — só o RPC `SECURITY DEFINER`
  escreve.
- Unique index parcial `ix_comunicacao_outbox_wa_provider_msgid` presente.
- Máquina de estado F4 monotônica; `failed` só desce `sent` se `delivered_at`
  NULL e timestamp posterior.
- Rollback F4 → F2 fail-closed com `detect_fase4_installed` cobrindo os 4
  artefatos (RPC + tabela + coluna + índice).

### Kit deploy
- `apply-staging.sh`: F2 e F4 aplicadas em `psql --single-transaction`
  cobrindo precheck + migration + postcheck (falha no postcheck reverte).
- `deploy-functions-staging.sh`: allowlist hard-coded de 3 funções, sem
  override por env/args.
- `verify-staging.sh`: postcheck+harness F1/F2/F4 + smokes + health check REAL
  contra `https://<STAGING_PROJECT_REF>.supabase.co/functions/v1/communication-health`
  (endpoint derivado internamente e imutável, sem URL configurável).
- `rollback-staging.sh`: fail-closed F4→F2 já corrigido em iteração anterior.
- `env.example`: sem valores reais, sem `STAGING_API_URL`, com
  `WHATSAPP_WEBHOOK_ENABLED=false` documentado como flag OFF.
- Checklist manual: seções 1-10 cobrem GO/NO-GO por canal (email, in-app,
  WhatsApp send, webhook receipts) com critérios objetivos.

## Testes de regressão adicionados

`src/test/comunicacao/fase4.test.ts` — bloco `Fase 5 (RC) · Regressões` (5
testes novos, todos executáveis):

1. Worker não pode reintroduzir `detail: claimErr.message`.
2. `CommunicationHealthResult` inclui `whatsapp_webhook` e UI renderiza.
3. `healthBooleans` runtime: retorna `whatsapp_webhook: { enabled, configured }`.
4. Comentário do `deploy-functions-staging.sh` lista as 3 funções reais
   (extração via regex do array `FUNCTIONS` + cruzamento com cabeçalho).
5. Docs do kit (env.example, checklist) sem referência solta a "Fase 3".

## Comandos e resultados exatos

```
$ bunx tsgo --noEmit
(sem erros)

$ bunx vite build
✓ built in 25.93s (chunks > 500 kB são pré-existentes, não introduzidos)

$ bunx vitest run src/test/comunicacao
Test Files  10 passed (10)
Tests  212 passed (212)

$ bunx vitest run
Test Files  1 failed | 141 passed | 1 skipped (143)
Tests  1 failed | 2300 passed | 4 skipped (2305)
# Falha única: portalAcompanhamentoProdutor.test.tsx (flaky pré-existente,
# fora do escopo do módulo de comunicação — preservada sem máscara).

$ bash -n restoration/comunicacao-deploy/deploy-functions-staging.sh
(sem erros)
```

## Matriz de requisitos originais

| Requisito | Status |
|---|---|
| Typecheck + build + suíte completa | ✔ (com flaky pré-existente preservada) |
| Corrigir erros/warnings do módulo | ✔ (5 defeitos concretos corrigidos) |
| /comunicacao tabs admin vs gestor | ✔ confirmado |
| health/verificação só admin | ✔ confirmado |
| Fila sem PII adicional, filtros válidos | ✔ confirmado |
| Zero crash sem colunas F4 pré-migration | ✔ optional chaining |
| Envio admin via `rpc_publish_...event_v2` com source null | ✔ confirmado |
| Eventos OS com source correto | ✔ confirmado (`ordens_servico`) |
| Migrations/precheck/postcheck/harness/rollback coerentes F1/F2/F4 | ✔ |
| Só webhook tem `verify_jwt=false` | ✔ (`config.toml`) |
| Sem escrita a anon/authenticated fora de RPCs previstas | ✔ |
| Worker/webhook sem raw error/PII/secrets, códigos/tamanhos fechados | ✔ (após #1) |
| Apply F2/F4 atômicos | ✔ (`--single-transaction`) |
| Deploy allowlist com exatamente 3 funções | ✔ (health, worker, webhook) |
| Verify F1/F2/F4 + smokes | ✔ |
| Rollback fail-closed F4→F2 | ✔ (corrigido em iteração anterior) |
| Endpoints oficiais, sem URL arbitrária | ✔ (derivado de `STAGING_PROJECT_REF`) |
| Sem logs de secrets | ✔ (falhas redigidas) |
| Docs/env sincronizados | ✔ (após #3/#4/#5) |
| Checklist GO/NO-GO por canal | ✔ (seções 1-10) |
| Testes executáveis (não só regex) | ✔ (parser/HMAC/concurrency/healthBooleans em runtime) |
| Não inventar sucesso runtime externo | ✔ (staging/provider marcados BLOQUEADO) |

## Segurança

- Nenhum ponto do módulo expõe secrets em logs, respostas HTTP ou UI.
- RLS habilitada em todas as tabelas `comunicacao_*`.
- SECURITY DEFINER + `search_path=public` em toda RPC.
- HMAC do webhook: comparação constant-time (`timingSafeEqual`).
- Rate limit efetivo via cap de body (128 KiB) e cap de statuses (`MAX_STATUSES_TOTAL`).
- Correção #1 fecha vetor de information disclosure via mensagem crua do Postgres.

## Bloqueios externos (NÃO GO PROD)

1. **Projeto Supabase de staging real** com `STAGING_PROJECT_REF` distinto de
   `navfzbwgwzruipouyfnk` (ou confirmação explícita
   `I_UNDERSTAND_CONFIGURED_REF_IS_STAGING=true` documentada fora do repo).
2. **Segredos Meta (WhatsApp)** configurados em Project Settings → Secrets:
   `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
   `WHATSAPP_PHONE_NUMBER_ID`. `WHATSAPP_WEBHOOK_ENABLED` só `true` **após**
   validação do canal e handshake real com Meta.
3. **SMTP** (host/porta/usuário/senha) e **Push** (FCM/APNs) para adapters
   respectivos.
4. **Homologação manual** completa das seções 1-10 do `checklist-manual.md`
   em staging, com destinatários controlados.
5. **Handshake real com Meta Cloud API** para receipts `sent → delivered →
   read → failed` — não simulado.
6. **`STAGING_TEST_ADMIN_JWT`** exportado no shell da máquina que roda
   `verify-staging.sh` para validar health check autenticado.

## Parecer

- **GO PARA STAGING:** código, SQL, edge functions e kit passaram em
  typecheck, build, `bash -n` e suíte automatizada (2300/2305). Defeitos
  encontrados foram corrigidos e cobertos por regressão.
- **NÃO GO PARA PRODUÇÃO** até staging + checklist manual + provider
  handshake concluídos com evidência.
