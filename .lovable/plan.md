# Fase 4 — Recibos de Entrega WhatsApp e Observabilidade

Base: commit `b09c7bcda5e308032524327aa0dbf276865f0257`. Uma edição econômica, aditiva. Nada é publicado, aplicado externamente ou tem flags ativadas. Nenhum segredo entra no repositório.

## Princípio de design

O estado de aceite pelo provedor continua sendo `outbox.status='sent'` (retorno do send Meta com `messages[].id`). Os webhooks Meta chegam depois, possivelmente fora de ordem, e alimentam **campos separados** — nunca reescrevem o enum atual do outbox nem interferem no worker. Correlação exclusiva por `canal='whatsapp'` + `provider_message_id`.

## 1) SQL — `restoration/comunicacao-fase4/`

Arquivos: `precheck.sql`, `migration.sql`, `postcheck.sql`, `rollback.sql`, `harness-rls.sql`, `runbook.md`.

### migration.sql (aditivo)
- `ALTER TABLE public.comunicacao_outbox ADD COLUMN`:
  - `provider_delivery_status text` com `CHECK (provider_delivery_status IS NULL OR provider_delivery_status IN ('sent','delivered','read','failed','deleted'))`
  - `provider_status_at timestamptz`
  - `delivered_at timestamptz`
  - `read_at timestamptz`
  - `provider_failed_at timestamptz`
- Índice parcial `CREATE INDEX ... ON comunicacao_outbox (canal, provider_message_id) WHERE canal='whatsapp' AND provider_message_id IS NOT NULL`. Não unique (precheck detecta duplicidades e aborta se houver colisão que impeça correlação).
- Tabela append-only `comunicacao_provider_receipts`:
  - `id uuid pk default gen_random_uuid()`
  - `outbox_id uuid references comunicacao_outbox(id) on delete cascade`
  - `provider text not null check (provider IN ('whatsapp'))`
  - `provider_message_id text not null`
  - `status text not null check (status IN ('sent','delivered','read','failed','deleted'))`
  - `provider_timestamp timestamptz not null`
  - `received_at timestamptz not null default now()`
  - `error_code text` (allowlist sanitizada, ≤80 chars)
  - `UNIQUE (provider, provider_message_id, status, provider_timestamp)` para idempotência
  - Sem `payload`, sem `recipient_id`, sem telefone/nome/token/mensagem.
  - GRANTs: `service_role ALL`; `authenticated`: apenas `SELECT` via política admin; `anon` sem grant.
  - RLS ON; `POLICY "admins read receipts" FOR SELECT USING (public.has_role(auth.uid(),'administrador'))`. Sem INSERT/UPDATE/DELETE policy — só service_role escreve.
- RPC `public.rpc_record_whatsapp_delivery_status(p_provider_message_id text, p_status text, p_timestamp timestamptz, p_error_code text)`:
  - `SECURITY DEFINER`, `SET search_path=public`.
  - `REVOKE ALL ... FROM PUBLIC, anon, authenticated`; `GRANT EXECUTE ... TO service_role`.
  - Valida comprimentos (`p_provider_message_id` 1..255, `p_error_code` até 80 e allowlist regex `^[a-z0-9_.:-]{1,80}$`), `p_status` no enum, `p_timestamp` não nulo e razoável.
  - Localiza a linha `SELECT ... FOR UPDATE` em `comunicacao_outbox WHERE canal='whatsapp' AND provider_message_id=p_provider_message_id`. Se ausente: retorna `jsonb_build_object('ok',true,'ignored',true,'reason','unmatched')` sem inserir receipt e sem PII.
  - Insere em `comunicacao_provider_receipts` com `ON CONFLICT (provider,provider_message_id,status,provider_timestamp) DO NOTHING`.
  - Máquina monotônica com ordem `sent=1 < delivered=2 < read=3`; `failed` só grava estado se atual < delivered; um `delivered/read` posterior supera `failed`; `deleted` grava receipt mas não rebaixa `provider_delivery_status`. Timestamps por campo preservam o primeiro válido (`COALESCE`), `provider_status_at` acompanha o estado vencedor.
- Auditoria: entrada mínima em `comunicacao_audit_log` (se existente) com `action='whatsapp_receipt'`, `outbox_id`, `status`, sem payload/PII.

### precheck.sql
- Confirma Fase 2 aplicada (funções/tabelas). Detecta linhas existentes com `(canal='whatsapp', provider_message_id)` duplicado; aborta com mensagem se `>0`.
- Verifica ausência das colunas/tabela/rpc novas para permitir aplicação aditiva.

### postcheck.sql
- Colunas presentes com CHECK correto; índice existe; RLS habilitada; grants exatos; assinatura da RPC via `to_regprocedure`; política admin SELECT única; UNIQUE de idempotência presente; enum outbox intacto.

### harness-rls.sql
- Como `authenticated` não-admin: `SELECT` em receipts retorna 0 linhas; INSERT/UPDATE/DELETE em receipts rejeitados; `EXECUTE` da RPC negado.
- Como `anon`: sem acesso.
- Como `service_role`: RPC executa; INSERT direto proibido por policy (só service_role bypassa RLS).

### rollback.sql
- `DROP` da RPC, tabela receipts, índice e colunas novas. Não toca em nada da Fase 2.

## 2) Edge Function — `supabase/functions/whatsapp-status-webhook/index.ts`

- `supabase/config.toml`: adiciona `[functions.whatsapp-status-webhook] verify_jwt = false` (só esta).
- **GET**: extrai `hub.mode`, `hub.verify_token`, `hub.challenge`. Se `mode='subscribe'` e `verify_token` bate com `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (comparação constant-time), retorna `challenge` como `text/plain` 200. Caso contrário 403.
- **POST**:
  - Lê raw body como `Uint8Array`; rejeita se `> 1MB` (413).
  - Header `X-Hub-Signature-256` obrigatório; HMAC-SHA256 do raw body com `WHATSAPP_APP_SECRET`; comparação constant-time real (`crypto.subtle` importKey + verify, ou compare byte-a-byte com XOR acumulado). Falta/erro → 401 sem detalhes.
  - Depois: `JSON.parse`; valida `object==='whatsapp_business_account'`; para cada `entry.changes` valida `field==='messages'`, `value.messaging_product==='whatsapp'`, `value.metadata.phone_number_id === WHATSAPP_PHONE_NUMBER_ID`.
  - Para cada `statuses[i]`: extrai `id` (string ≤255), `status` (allowlist), `timestamp` (int → `to_timestamp`), `errors[0].code`/`title` sanitizado allowlist regex → `error_code`.
  - Ignora silenciosamente `messages` (recebidas), contatos, conteúdo.
  - Limita: `entry ≤10`, `changes ≤10`, `statuses ≤100`; strings truncadas antes de RPC.
  - Chama `rpc_record_whatsapp_delivery_status` com service_role client. Erros da RPC contam para métrica agregada; nunca retorna detalhe.
  - Retorna 200 com `{ok:true, processed:n}` sempre que assinatura foi válida e parser terminou, mesmo com itens `unmatched`.
  - Logs: só contadores (`processed`, `unmatched`, `rpc_failures`) — nenhum wamid, telefone, corpo ou secret.
- Health: `communication-health` passa a expor `whatsapp_webhook: { configured: bool, enabled: bool }` derivado de `WHATSAPP_APP_SECRET && WHATSAPP_WEBHOOK_VERIFY_TOKEN` presentes (sem revelar valores). `enabled` reflete flag existente (mantida OFF).
- Testes puros em `src/test/comunicacao/whatsapp-webhook-*.test.ts` (parser + verificação HMAC via WebCrypto Node) cobrindo: assinatura válida, inválida, ausente, body>limite, `phone_number_id` incorreto, evento `messages` ignorado, status fora de ordem, timestamp inválido, error_code fora da allowlist virando `unknown`, ausência de PII nas respostas/logs.

## 3) UI / Observabilidade

- `src/pages/comunicacao/FilaComunicacao.tsx` (admin): adiciona colunas `Provedor` (aceito/entregue/lido/falhou/excluído), `Último status em`, `Código`. Sem dados novos para gestor (mantém colunas atuais).
- Filtros: selects para `canal`, `outbox.status`, `provider_delivery_status`. Refresh manual + polling ≥30s (sem realtime agressivo).
- `CanalHealthPanel`: card novo "Webhook WhatsApp" — `configured/enabled` booleanos, sem valores.
- `src/features/comunicacao/api.ts` / `types.ts`: campos novos opcionais no tipo `ComunicacaoOutbox`; `WhatsappWebhookHealth` no tipo do health. Casts localizados até regenerar types.

## 4) Kit de deploy — `restoration/comunicacao-deploy/`

- `apply-staging.sh`: nova etapa atômica `fase4/precheck+migration+postcheck` em `psql --single-transaction`, depois `fase4/harness`, depois smoke Fase 4 (adicionado a `smoke-staging.sql` como bloco read-only extra). Ordem: F1 postcheck → F2 atômica → F2 harness → F4 atômica → F4 harness → smoke → seeds opcionais.
- `deploy-functions-staging.sh`: allowlist agora `("communication-health" "process-communication-outbox" "whatsapp-status-webhook")`.
- `rollback-staging.sh`: quando `ROLLBACK_COMMUNICATION_FASE4=true`, roda `fase4/rollback.sql` **antes** de qualquer rollback Fase 2. Sem esse flag, Fase 4 fica intacta.
- `verify-staging.sh`: valida via health que `whatsapp_webhook.enabled=false` (kit não ativa).
- `smoke-staging.sql`: bloco read-only cobrindo colunas novas, índice, RLS receipts, assinatura RPC, unicidade idempotência.
- `checklist-manual.md`: casos GET challenge, POST assinatura inválida (401), sent→delivered→read, evento fora de ordem, duplicata (idempotente), unmatched (ignored), deleted não rebaixa.
- `env.example`: `WHATSAPP_APP_SECRET=` e `WHATSAPP_WEBHOOK_VERIFY_TOKEN=` vazios + aviso "definir em Project Settings → Secrets; nunca commitar valor".
- Testes contratuais em `src/test/comunicacao/fase3-deploy-kit.test.ts` (ou novo `fase4-deploy-kit.test.ts`): allowlist de três funções, ordem apply, rollback F4 antes de F2 sob flag, ausência de secrets no env.example, smoke inclui F4.

## 5) Testes & docs

- SQL contratuais (leitura do arquivo `migration.sql` + assinatura RPC + regex allowlist) em `src/test/comunicacao/fase4-sql-contract.test.ts`.
- RLS/grants contratuais em `fase4-rls-contract.test.ts` (parseia migration).
- Parser/crypto em `fase4-webhook-parser.test.ts` e `fase4-webhook-signature.test.ts`.
- UI teste leve em `FilaComunicacao.provider-columns.test.tsx`.
- Deploy kit em `fase4-deploy-kit.test.ts`.
- Suíte comunicação + suíte completa. Flags OFF preservadas; flaky não relacionado mantido.
- `.lovable/comunicacao-fase4-report.md` com parecer real e bloqueios externos (Meta: precisa registrar webhook URL no App Meta Developer, gerar `APP_SECRET`/`VERIFY_TOKEN`, subscrever field `messages`).

## Detalhes técnicos

- HMAC constant-time em Deno: `crypto.subtle.importKey('raw', keyBytes, {name:'HMAC',hash:'SHA-256'}, false, ['sign'])`, `sign` do raw body, hex, comparar com header (`sha256=...`) via loop XOR acumulando em `diff |= a[i]^b[i]`, retornando `diff===0 && sameLength`.
- Timestamp Meta é epoch seconds string → `new Date(parseInt(ts,10)*1000)`.
- `error_code`: primeiro tenta `errors[0].code` numérico → `wa_${code}`; senão `errors[0].title` normalizado; fallback `unknown`. Sanitiza com regex allowlist.
- Índice parcial evita conflito com linhas legadas sem `provider_message_id`.
- Máquina monotônica implementada em uma única `UPDATE ... WHERE id=$1` usando `CASE` sobre valores atuais lidos no `FOR UPDATE`, evitando race.

## Fora de escopo

- Não altera enum `comunicacao_outbox_status`.
- Não modifica worker `process-communication-outbox`.
- Não ativa nenhuma flag; não configura secrets; não publica funções; não aplica migration externamente.
