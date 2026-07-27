# Módulo de Comunicação — Configuração de provedores por frontend

Ambiente-alvo: **staging `ar-bio-temp` (Supabase ref `ikaauvsflpmamgxmkhoq`)**.
Produção `ar-bio` (`navfzbwgwzruipouyfnk`) permanece **INTOCADA** nesta rodada.

Rodada de certificação corretiva encerrada em **2026-07-27** (UTC).

---

## 1. Escopo entregue

Fluxo end-to-end para o administrador configurar SMTP, WhatsApp Cloud API,
webhook de recibos, allowlists de homologação e flags de entrega diretamente
pela tela `Configurações → Comunicação`, salvando via **uma única RPC atômica**
por mutação. Segredos ficam em `vault.secrets` referenciados pela tabela
pública apenas por `uuid`. Todas as três funções de runtime (worker, health,
webhook) leem a mesma configuração viva por RPC de serviço.

## 2. Migrations aplicadas em staging

Ambas gravadas no repositório e executadas com sucesso em
`ikaauvsflpmamgxmkhoq`:

- `supabase/migrations/20260727161408_f3b6bc19-…sql`
  → cria `public.communication_provider_settings` (linha singleton `id=1`) +
  `communication_provider_settings_audit`.
  Cria RPCs `rpc_service_load_provider_runtime_config`,
  `rpc_service_set_provider_secret`, `rpc_service_clear_provider_secret`
  (SECURITY DEFINER, `search_path=public,vault`).
- `supabase/migrations/20260727161544_0316604a-…sql`
  → *hotfix* de grants iniciais (revogação explícita de `public/anon/authenticated`).
- `supabase/migrations/20260727162402_3651e2b6-…sql`
  → adiciona `communication_provider_settings_rate_limit` +
  `rpc_service_check_rate_limit` + a RPC atômica `rpc_service_apply_provider_settings`.
  Reforça grants: todos os RPCs de serviço têm `REVOKE ALL … FROM PUBLIC` e
  `GRANT EXECUTE … TO service_role` somente.

Postcheck read-only (SELECT em `pg_proc`/`has_function_privilege`) — assinaturas
canônicas confirmadas nesta rodada:

| RPC | args | security_definer | search_path |
|---|---|---|---|
| `rpc_service_apply_provider_settings` | `p_actor uuid, p_payload jsonb` | ✅ | `public, vault` |
| `rpc_service_check_rate_limit` | `p_user uuid, p_action text, p_max integer, p_window_seconds integer` | ✅ | `public` |
| `rpc_service_clear_provider_secret` | `p_slot text, p_actor uuid` | ✅ | `public, vault` |
| `rpc_service_load_provider_runtime_config` | *(sem argumentos)* | ✅ | `public, vault` |
| `rpc_service_set_provider_secret` | `p_slot text, p_value text, p_actor uuid` | ✅ | `public, vault` |

## 3. Privilégios efetivos (`has_function_privilege`)

Todas as 5 RPCs de serviço em staging:

| RPC | public | anon | authenticated | service_role |
|---|---|---|---|---|
| `rpc_service_apply_provider_settings` | ❌ | ❌ | ❌ | ✅ |
| `rpc_service_check_rate_limit`        | ❌ | ❌ | ❌ | ✅ |
| `rpc_service_clear_provider_secret`   | ❌ | ❌ | ❌ | ✅ |
| `rpc_service_load_provider_runtime_config` | ❌ | ❌ | ❌ | ✅ |
| `rpc_service_set_provider_secret`     | ❌ | ❌ | ❌ | ✅ |

Nenhuma chamada direta dessas RPCs pode partir do browser/anon/authenticated —
o Edge Function faz JWT + `has_role(admin)` antes de encaminhar como service_role.

## 4. Arquitetura em runtime

### 4.1 Atomicidade
Toda mutação chega em **uma única chamada** `rpc_service_apply_provider_settings(p_actor, p_payload)`.
O payload traz `updates` (colunas simples) e `secret_ops` (`set`/`clear` por slot).
A RPC executa dentro de uma transação; se qualquer operação de segredo, escrita
de coluna ou gate de segurança falhar, a transação é revertida integralmente e o
Edge Function retorna erro com código sanitizado.

Ganchos rígidos aplicados no RPC:
- Desligar `test_mode_enabled` exige que os canais habilitados tenham provider
  configurado (`test_mode_off_requires_email_provider` / `…_whatsapp_provider`).
- Ligar `email_delivery_enabled` sem SMTP válido → `email_enabled_requires_provider_configured`.
- Ligar `whatsapp_delivery_enabled` sem WhatsApp válido → `whatsapp_enabled_requires_provider_configured`.
- `secret_op.action='set'` com `value` vazio → `empty_secret_value`.
- `slot` fora da allowlist → `invalid_slot`.

### 4.2 Precedência do runtime (`loadRuntimeConfig`)
Fail-closed em todos os pontos:

1. `rpc_service_load_provider_runtime_config()` responde `{present:true,...}` →
   `source="db"`, o efetivo vem **exclusivamente** do DB.
2. `{present:false}` → `envFallback()` (readWorkerEnv), `source="env"`.
3. Qualquer erro/exceção/payload inesperado → `failClosed()` — todas as flags
   `false`, `TEST_MODE_ENABLED=true`, nenhum segredo em memória, `source="fail_closed"`.

O worker (`process-communication-outbox`) faz **early return** com `dry_run:true`
antes de qualquer `rpc_claim_communication_outbox` sempre que `env.DELIVERY_ENABLED=false`,
garantindo que uma falha de DB/RPC **não** pode reintroduzir uma configuração de
env que reative envios.

### 4.3 CORS restrito
`corsHeadersFor` só retorna cabeçalhos se `isTrustedOrigin(origin)` for `true`:
- `https://*.lovable.app`, `https://*--*.lovable.app`, `https://*.lovableproject.com`
- `http://localhost[:port]`, `http://127.0.0.1[:port]`
- CSV opcional em `COMMUNICATION_ADMIN_ORIGINS` (staging: vazio)

Preflight de origem não confiável recebe **403 sem CORS**. Nenhum padrão
aceita `*`. Requests fora do allowlist são rejeitados com `origin_not_allowed`.

### 4.4 Rate limit
`rpc_service_check_rate_limit(user_id, action, 30, 60s)` chamado a cada
requisição (`action∈{get,mutate}`). Contagem persistente por (user, action) em
janela deslizante de 60 s. Falha de RPC → **fail-closed** (429).

## 5. Frontend

Rota: **`/configuracoes?tab=comunicacao`** (aba visível apenas para
`administrador`, feature-flag `VITE_FEATURE_COMMUNICATION_ADMIN`).

- Arquivo: `src/pages/configuracoes/ComunicacaoConfigTab.tsx`
- Chamadas via `supabase.functions.invoke("communication-provider-settings", …)`
  (sem casts `as any`, sem uso de `supabaseUrl`/`supabaseKey` internos).
- Desligar Test mode pede `confirm()` no navegador e envia
  `confirm_disable_test_mode:"I_UNDERSTAND_REAL_SENDS"`.
- Ligar qualquer flag pede `confirm()` e envia `confirm_enable:"I_UNDERSTAND"`.
- Segredos são **write-only**: campo em branco preserva o valor atual; remoção
  usa o botão dedicado com prompt `REMOVE`.
- A view exibe apenas contagens e valores mascarados de allowlists;
  status booleano dos segredos (`configured` vs `não configurado`).

## 6. Edge Functions deployadas em staging

Redeploy nesta rodada (após refactor pure/testável de payload shaping,
runtime-config e CORS):

- `communication-provider-settings` — CRUD atômico (JWT admin, CORS restrito,
  rate limit, mutações via RPC atômica única).
- `communication-health` — POST-only, auth interna (`INTERNAL_FUNCTION_SECRET`),
  service_role ou admin JWT; retorna apenas booleans + `source`.
- `process-communication-outbox` — worker de outbox; lê `loadRuntimeConfig`;
  early return sem `claim` quando delivery global está OFF.
- `whatsapp-status-webhook` — assinatura HMAC via APP_SECRET do DB; challenge
  GET valida contra VERIFY_TOKEN do DB; flag `WHATSAPP_WEBHOOK_ENABLED`
  respeitada com fail-closed.

`supabase/config.toml` mantém `verify_jwt=false` **exclusivamente** em
`[functions.whatsapp-status-webhook]`. Teste automatizado
`F-CORR (5) config.toml: SOMENTE whatsapp-status-webhook desliga verify_jwt`
falharia se outra função regredisse esse ajuste.

## 7. Testes e verificações desta rodada

### 7.1 Vitest
- Novo arquivo: `src/test/comunicacao/fase-provider-settings-corr.test.ts`
  → **32 tests / 32 pass** (runtime loader, `fromDbPayload`, CORS,
  payload shaping, estáticos de segurança/wiring).
- Suite completa `src/test/comunicacao`: **265 / 265 pass** (12 arquivos).
  Nenhum teste comunicação foi ignorado, pulado ou marcado `todo`.

Comando reproduzido:
```
bunx vitest run src/test/comunicacao
```

### 7.2 Typecheck + Build
- `bunx tsgo --noEmit` → clean.
- `bun run build` → OK (`✓ built in 33.49s`), PWA gerado.

### 7.3 Postchecks staging read-only

Linha singleton `communication_provider_settings`:
```
id=1
test_mode_enabled=true
delivery_enabled=false
email_delivery_enabled=false
whatsapp_delivery_enabled=false
inapp_delivery_enabled=false
whatsapp_webhook_enabled=false
allowed_emails_count=0
allowed_phones_count=0
secret_smtp_password=NULL
secret_whatsapp_access_token=NULL
secret_whatsapp_app_secret=NULL
secret_whatsapp_verify_token=NULL
updated_at=2026-07-27T16:14:11Z
```

Outbox de comunicação (`comunicacao_outbox`):
```
pending=0  processing=0  sent=0  failed=0  total=0
```
→ **zero mensagens processadas ou enviadas nesta rodada.**

Rate limit (`communication_provider_settings_rate_limit`, últimos 5 min):
```
rows_last_5min=0
```

Assinaturas de RPC e privilégios: ver §2 e §3.

### 7.4 Edge Functions
Deploy confirmado nesta rodada:
```
Successfully deployed edge functions: communication-provider-settings,
communication-health, process-communication-outbox, whatsapp-status-webhook
```
Somente `whatsapp-status-webhook` opera com `verify_jwt=false`; as demais
exigem JWT (admin ou service_role).

## 8. Postura de segurança atual

- Todas as flags de entrega/webhook OFF; `test_mode_enabled=ON`.
- Nenhum segredo real de provedor foi solicitado, digitado ou gravado.
- Nenhum envio real de email/WhatsApp/in-app; nenhum webhook processado.
- Nenhuma alteração em produção (`navfzbwgwzruipouyfnk`).
- Nenhuma tabela de vault (`vault.secrets`) é acessada por `.from()` do Edge
  Function — apenas via RPCs SECURITY DEFINER com `search_path=public,vault`.
- `communication-provider-settings` mantém exatamente **uma** chamada por
  mutação: `rpc_service_apply_provider_settings` (mais o `rpc_service_check_rate_limit`
  do gate). Não há chamada direta a `set/clear_provider_secret` — todas as
  operações de vault são feitas dentro do RPC atômico.

## 9. Bloqueadores remanescentes / próximos passos

- **Provedores reais** (SMTP + Meta) precisam ser cadastrados pela operação
  antes de qualquer plano de ativação. Enquanto os campos estão vazios, o RPC
  atômico bloqueia a ativação de flags e a desativação do test mode.
- **Homologação de canais** com envios de teste (test mode + allowlist) só
  deve ser executada em janela dedicada, com allowlists explícitas e
  autorização humana. Kit de aceite ainda não foi rodado nesta rodada.
- **Rollback** dos artefatos desta feature está coberto pelas migrations,
  mas ainda não foi ensaiado em `ikaauvsflpmamgxmkhoq`.

## 10. Metadados da rodada

- Baseline commit: `9e4f21eb257d9c3fdf661b9e7b4babd8a27a18ef`.
- Commit desta rodada: **a ser preenchido pelo pipeline** (mudanças ficam em:
  `supabase/functions/_shared/comunicacao/{runtime-config,cors,provider-settings-shaping}.ts`,
  `supabase/functions/communication-provider-settings/index.ts`,
  `supabase/functions/communication-health/index.ts`,
  `supabase/functions/process-communication-outbox/index.ts`,
  `supabase/functions/whatsapp-status-webhook/index.ts`,
  `src/test/comunicacao/fase-provider-settings-corr.test.ts`,
  `.lovable/comunicacao-frontend-settings-report.md`).
- Custo estimado desta rodada: ≤ 18 créditos (dentro do orçamento definido).
- Migrations aplicadas nesta rodada: **0** (todas já haviam sido aplicadas
  em rodadas anteriores; apenas leitura para postcheck).
- Redeploys nesta rodada: **4** (funções listadas em §6), motivados por
  refactor que extrai lógica pura para módulos importáveis por Vitest.

**Status:** aprovado para uso administrativo em staging, **sem** liberação
para envios reais. Não é GO absoluto para produção — depende da configuração
real dos provedores e da homologação controlada com allowlists.
