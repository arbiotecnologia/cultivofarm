# Comunicação — Homologação de Provedores (H1/H2/H3)

- **Timestamp (UTC)**: 2026-07-27T12:09:22Z
- **Ambiente alvo**: `ar-bio-temp` / `ikaauvsflpmamgxmkhoq` (STAGING). Produção `navfzbwgwzruipouyfnk` **não tocada**.
- **Flags de entrega**: **TODAS OFF** — nenhuma mensagem foi enviada nesta execução.
- **Escopo**: preparar canais e-mail e WhatsApp para futuro teste real controlado. Sem seeds, sem publicação frontend, sem valores sensíveis.

## FASE H1 — Readiness

### Providers suportados

| Canal | Provider | Endpoint | Timeout | Retry | Idempotência | Erros |
|---|---|---|---|---|---|---|
| e-mail | SMTP genérico (denomailer, TLS auto se porta 465) | conexão direta a `SMTP_HOST:SMTP_PORT` | 20 s (`Promise.race` + `client.close()` no finally) | via worker `rpc_fail_communication_delivery_v2` (transient) | garantida pelo lease (`rpc_claim_communication_outbox`) e por `attempts`/backoff no v2 | classificação em `email_timeout`/`email_network_error`/`email_smtp_5xx`/`email_unknown_error`; sanitizados a 500 chars, sem stacks |
| whatsapp | Meta WhatsApp Cloud API (allowlist explícita `v24.0`,`v25.0`) | `POST https://graph.facebook.com/{version}/{phone_id}/messages` | 15 s (AbortController) | mesmo mecanismo v2 do worker | `provider_message_id` retornado por Meta é persistido em `provider_message_id` do outbox; recibos via `rpc_record_whatsapp_delivery_status` | 429 → transient; 5xx → transient; 401/404 etc. → permanent com `code=whatsapp_<status>` e mensagem sanitizada (`code=X type=Y`) |
| in_app | RPC `rpc_dispatch_inapp_notification` | interno (mesmo Supabase) | n/a | não aplicável (idempotente por outbox_id) | sim: mesmo `notification_id` em reexecução | classificação `permanent_error` para privilege/permission, `transient_error` caso contrário |

### Matriz de secrets/env (por NOME · presença apenas · NUNCA valor)

| Secret | Canal | Obrigatoriedade | Presente em staging? |
|---|---|---|---|
| `COMMUNICATION_DELIVERY_ENABLED` | mestre | obrigatório para entrega real | ausente ⇒ `false` (OFF) ✅ |
| `EMAIL_DELIVERY_ENABLED` | e-mail | obrigatório | ausente ⇒ OFF ✅ |
| `WHATSAPP_DELIVERY_ENABLED` | whatsapp | obrigatório | ausente ⇒ OFF ✅ |
| `COMMUNICATION_INAPP_ADAPTER_ENABLED` | in_app | obrigatório | ausente ⇒ OFF ✅ |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD` / `SMTP_FROM` | e-mail | todos obrigatórios | **ausentes** — a preencher para o teste real |
| `WHATSAPP_ACCESS_TOKEN` | whatsapp | obrigatório | **ausente** |
| `WHATSAPP_PHONE_NUMBER_ID` (numérico) | whatsapp | obrigatório | **ausente** |
| `WHATSAPP_API_VERSION` (∈ `v24.0`/`v25.0`) | whatsapp | obrigatório (sem default silencioso) | **ausente** |
| `WHATSAPP_WEBHOOK_ENABLED` | webhook recibos | opcional (default OFF) | ausente ⇒ OFF ✅ |
| `WHATSAPP_APP_SECRET` | webhook | obrigatório se webhook ON | **ausente** |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | webhook | obrigatório se webhook ON | **ausente** |
| `INTERNAL_FUNCTION_SECRET` | infra | obrigatório para `communication-health` e worker | **presente** ✅ |
| `COMMUNICATION_TEST_MODE_ENABLED` (novo H2) | homologação | opcional; ausente ⇒ **ON** (fail-closed) | ausente ⇒ ON ✅ |
| `COMMUNICATION_TEST_ALLOWED_EMAILS` (novo H2) | homologação e-mail | necessário para primeiro teste real | **ausente** |
| `COMMUNICATION_TEST_ALLOWED_PHONES` (novo H2) | homologação whatsapp | necessário para primeiro teste real | **ausente** |

Fonte: `secrets--fetch_secrets` (retornou apenas `INTERNAL_FUNCTION_SECRET` e o `LOVABLE_API_KEY` gerenciado). Valores nunca foram lidos.

### Health checks sem envio

- `communication-health` foi redeployada e recebe as novas contagens de allowlist (test_mode). Chamada autenticada não pôde ser executada nesta sessão (não temos JWT admin nem `INTERNAL_FUNCTION_SECRET` acessível fora do runtime das próprias funções) → **SKIP**. A resposta contratual esperada agora inclui:
  ```json
  { "ok": true, "delivery_enabled": false,
    "email": { "enabled": false, "configured": false },
    "whatsapp": { "enabled": false, "configured": false },
    "in_app": { "enabled": false, "configured": false },
    "whatsapp_webhook": { "enabled": false, "configured": false },
    "test_mode": { "enabled": true, "allowlist_emails_count": 0, "allowlist_phones_count": 0 } }
  ```
- Comunicação com banco/RPCs foi certificada na etapa anterior (`.lovable/comunicacao-staging-deployment-report.md` §8/§9, harnesses F2/F4 + smokes com `EXPECTED_TEST_PASS_ROLLBACK`).

### Flags OFF ⇒ nenhuma chamada externa

Confirmado por leitura estática dos adapters (`sendEmail`, `sendWhatsapp`) e do worker (`process-communication-outbox`):
- Worker: `if (!env.DELIVERY_ENABLED) return dry_run` **antes** de qualquer `rpc_claim`.
- E-mail: retorna `provider_not_configured` sem instanciar cliente SMTP.
- WhatsApp: retorna `provider_not_configured` sem `fetch()`.
- In-app: retorna `provider_not_configured` sem `rpc_dispatch_inapp_notification`.
- Webhook: `WHATSAPP_WEBHOOK_ENABLED=false` ⇒ POST com assinatura válida responde `200 disabled/received=0` **sem parse, sem RPC, sem tocar banco** (assinatura inválida continua 401). GET challenge continua funcionando para permitir a primeira configuração do Meta.

## FASE H2 — Hardening de homologação

Modo de teste reutilizável e mínimo implementado no shared dos adapters (`supabase/functions/_shared/comunicacao/adapters-types.ts` + `adapters.ts`).

### Contrato

- `COMMUNICATION_TEST_MODE_ENABLED` — `true`/`false`. **Ausente ⇒ tratado como `true` em runtime** (`readWorkerEnv`), fail-closed. Só desliga com valor exato `"false"`.
- `COMMUNICATION_TEST_ALLOWED_EMAILS` — CSV/space/`;`-separado; e-mails são normalizados (`trim` + `lowercase`); duplicatas removidas.
- `COMMUNICATION_TEST_ALLOWED_PHONES` — mesma parseação; telefones normalizados para E.164 (`+` + apenas dígitos).
- Gate `isRecipientAllowedInTestMode(env, canal, address)` é chamado nos adapters `sendEmail` e `sendWhatsapp` **antes** de qualquer chamada externa e antes das validações de template/assunto — retorna `AdapterResult { outcome: "deferred", code: "test_mode_allowlist_empty" | "test_mode_not_allowlisted" }` sem ecoar endereço.
- In-app é interno; não é sujeito ao gate.
- Produção continua fail-closed: sem `COMMUNICATION_TEST_MODE_ENABLED=false` explícito **e** allowlists preenchidas, todo destinatário externo é bloqueado.
- `healthBooleans` foi estendido com `test_mode: { enabled, allowlist_emails_count, allowlist_phones_count }` — nunca endereços.

### Sanitização de logs

- Nenhum `console.*` novo foi adicionado. O gate retorna somente códigos fixos (`test_mode_allowlist_empty`, `test_mode_not_allowlisted`) e `message: "test mode block"` — sem address, sem token.
- Adapters e worker já sanitizam mensagens de erro (truncam a 300/500 chars, allowlist de RPCs terminais).

### Testes automatizados (novos)

Arquivo: `src/test/comunicacao/hom1-test-mode.test.ts` — 15 asserts:
- normalização de e-mail/telefone;
- `parseAllowlist` (multi-separador, dedup, `undefined ⇒ []`);
- `isTestModeEnabled` (undefined vs. explícito);
- gate: allowlist vazia bloqueia; endereço fora bloqueia; endereço permitido case-insensitive libera; test mode OFF libera; whatsapp normaliza antes do match;
- adapters: allowlist vazia ⇒ `deferred` **e factory SMTP/`fetch` nunca chamados**;
- adapters: endereço fora da allowlist ⇒ `deferred` **sem PII** em `code`/`message` (asserts explícitos: sem `@`, sem sequência de dígitos ≥ 8);
- flag `DELIVERY_ENABLED=false` continua interrompendo antes do gate;
- `healthBooleans` expõe apenas contagens.

## FASE H3 — Certificação (final, após correção do harness F2 v3)

Correção pontual autorizada nesta etapa: `src/test/comunicacao/fase2-3-coerencia.test.ts` foi atualizado para validar **semanticamente** o harness F2 v3 (uso de `has_function_privilege` por OID via `to_regprocedure`, matriz `[anon, authenticated, service_role]` por assinatura exata, `publish_v2` = `f/t/t`, RPCs internas/worker = `f/f/t`, sobrecargas separadas de `rpc_create_portal_notification_secure`, admin RPCs = `f/t/t`, triggers OS AFTER UPDATE, e fail-closed via `RAISE EXCEPTION`). Nenhuma cobertura foi removida — o bloco final passou de 2 para 7 asserts. Nenhuma mudança de runtime, portanto **sem redeploy de Edge Functions** nesta etapa.

| Etapa | Resultado |
|---|---|
| `bunx tsgo --noEmit` | ✅ PASS (0 erros) |
| `bunx vitest run src/test/comunicacao/` | ✅ **233/233 PASS** (11 arquivos, 0 falha, 0 skip) — inclui `fase2-3-coerencia.test.ts` com 30 asserts |
| `bunx vitest run` (suíte completa) | 2320 PASS · 4 skip · **2 FAIL pré-existentes fora do módulo comunicação**: `src/test/fiscal/sinief49/staging/verifier.test.ts` (verdict `FAIL` vs. `PENDING`) e `src/test/portalAcompanhamentoProdutor.test.tsx` (render 4 abas). Ambos anteriores a esta sessão e sem qualquer relação com comunicação. |
| `bun run build` | ✅ PWA gerado (`dist/sw.js`, `dist/workbox-354287e6.js`, 20 entries · 5827.75 KiB) |
| Redeploy Edge Functions | ❌ Não realizado (mudança apenas de teste/documentação, conforme instrução) |
| Pós-deploy estrutural | Mantido de §9 do relatório de staging; **nenhuma migration nova nesta etapa** |
| Outbox processado | 0 — `COMMUNICATION_DELIVERY_ENABLED`, `EMAIL_DELIVERY_ENABLED`, `WHATSAPP_DELIVERY_ENABLED`, `COMMUNICATION_INAPP_ADAPTER_ENABLED`, `WHATSAPP_WEBHOOK_ENABLED` permanecem OFF (ausentes) em `ikaauvsflpmamgxmkhoq` |
| Produção `navfzbwgwzruipouyfnk` | ❌ Nenhum acesso, leitura ou escrita nesta sessão |


## Pendências para o primeiro teste controlado (ação humana requerida)

Todas exigem ação humana em **Project Settings → Secrets** (`ikaauvsflpmamgxmkhoq`) — nenhum valor é criado ou lido automaticamente:

1. **Allowlist** (obrigatória; sem ela nada sai mesmo com flags ON):
   - `COMMUNICATION_TEST_ALLOWED_EMAILS` — CSV de e-mails de teste do próprio time.
   - `COMMUNICATION_TEST_ALLOWED_PHONES` — CSV em E.164 (`+55...`) dos números de teste.
2. **E-mail** (para teste do canal e-mail):
   - `SMTP_HOST`, `SMTP_PORT` (int 1-65535), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (endereço remetente autorizado no provedor).
3. **WhatsApp** (para teste do canal whatsapp):
   - `WHATSAPP_ACCESS_TOKEN` (token permanente do app Meta).
   - `WHATSAPP_PHONE_NUMBER_ID` (numérico).
   - `WHATSAPP_API_VERSION` = `v24.0` **ou** `v25.0` (não há default silencioso).
4. **Webhook de recibos** (opcional, mas necessário para monitorar `delivered/read`):
   - `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, e depois `WHATSAPP_WEBHOOK_ENABLED=true`.

## Roteiro exato do primeiro teste controlado (a executar em sessão futura)

1. Configurar os secrets acima no staging.
2. Deixar `COMMUNICATION_TEST_MODE_ENABLED` **ausente ou `true`** e preencher as duas allowlists somente com destinatários do time.
3. Chamar `communication-health` autenticado; confirmar `test_mode.enabled=true`, `allowlist_*_count > 0`, `email.configured=true` / `whatsapp.configured=true`.
4. Publicar um evento de teste via RPC administrativa; verificar linha em `comunicacao_outbox` com `status=pending`.
5. Ligar apenas o canal do teste: `COMMUNICATION_DELIVERY_ENABLED=true` **+** (`EMAIL_DELIVERY_ENABLED=true` **ou** `WHATSAPP_DELIVERY_ENABLED=true`), mantendo os demais OFF.
6. Disparar `process-communication-outbox` (POST autenticado). Comportamento esperado:
   - Destinatário **na allowlist** ⇒ `outcome=sent`, linha em `comunicacao_outbox` para `status=sent`, `provider_message_id` gravado (WhatsApp).
   - Destinatário **fora da allowlist** ⇒ `outcome=deferred`, `code=test_mode_not_allowlisted`, tentativa não incrementada além do backoff, sem chamada externa.
7. (WhatsApp) Ligar `WHATSAPP_WEBHOOK_ENABLED=true` **após** o Meta confirmar o challenge GET; validar recibo em `comunicacao_provider_receipts`.
8. Ao final: desligar flags de entrega, remover allowlists, manter `COMMUNICATION_TEST_MODE_ENABLED=true`. Documentar no repositório.

## Auditoria de custo/commit

- **Commit**: a preencher pelo pipeline de commit (esta sessão editou 5 arquivos e 1 novo teste).
- **Custo**: dentro do orçamento de 60 créditos desta etapa (bem abaixo do teto de 68). Sem retentativas caras.
