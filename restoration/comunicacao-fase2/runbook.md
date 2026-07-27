# Runbook — Comunicação · Fase 2 v2 (staging)

> **Estado do pacote:** proposta. Nada aplicado em Supabase externo.
> Todas as feature flags e adapters permanecem **desligados**.

## Escopo da v2 (o que este runbook cobre)

Sobre a Fase 1 v3, a Fase 2 v2 adiciona:

1. Triggers idempotentes em `ordens_servico` e `ordens_servico_onfarm` que
   publicam `produto_pronto_retirada` apenas na transição real para
   `status = 'pronto_entrega'` (`AFTER UPDATE` com guarda
   `WHEN (NEW.status IS DISTINCT FROM OLD.status)`).
2. Broadcast administrativo (`administrative_important_update`) por
   `app_role`, com **preview server-side** de contagem.
3. Resolução de endereço service_role-only com revalidação de
   opt-in/verificação e normalização (e-mail lower-case; telefone E.164 BR).
4. Adapters reais **separados e desligados**: SMTP (`denomailer`),
   WhatsApp Cloud API (Meta Graph) e in_app via RPC dedicada.
5. Worker `process-communication-outbox` atualizado para v2, usando
   `payload_snapshot` direto e as novas RPCs de terminação
   (`complete` / `defer` / `fail_v2` / `skip` / `cancel`).
6. Metadados de canal em `comunicacao_templates` (assunto obrigatório para
   e-mail; provider template para WhatsApp com `provider_template_status`).
7. Tabela `comunicacao_inapp_dispatch` para idempotência in_app por
   `outbox_id`.

## Pré-requisitos

- Fase 1 v3 aplicada e certificada
  (`restoration/comunicacao-fase1/postcheck.sql`).
- Projeto Supabase de **staging**. Nunca aplicar em produção neste ciclo.
- Feature flags e envios permanecem **OFF**:
  - `COMMUNICATION_DELIVERY_ENABLED=false`
  - `EMAIL_DELIVERY_ENABLED=false`
  - `WHATSAPP_DELIVERY_ENABLED=false`
  - `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`
  - Frontend: `VITE_COMUNICACAO_MODULE_ENABLED=false`,
    `VITE_COMUNICACAO_BROADCAST_TAB_ENABLED=false`

## Ordem de execução em staging

```
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/precheck.sql
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/migration.sql
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/postcheck.sql
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/harness-rls.sql
# opcional em staging:
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/seeds.sql
```

## Assinaturas exatas verificadas pelo postcheck

Todas conferidas via `to_regprocedure('public.<fn>(<tipos>)')` — nomes de
parâmetros/formatação não influenciam.

### RPCs canônicas Fase 2 v2

- `public.rpc_publish_communication_event_v2(text, text, uuid, jsonb, text) → jsonb`
  **autenticada (administrador)** — usada pela UI Fase 2 tanto para
  broadcast administrativo quanto para publicação manual de
  `produto_pronto_aplicacao`. Chama `_comunicacao_expand_event` v2 para
  que o snapshot receba `provider_template_name`, `language_code`,
  `parameter_mapping` e `provider_template_status`, além dos helpers
  source-aware. A RPC v1 `rpc_publish_communication_event` (4-arg
  source_type) permanece intacta para compatibilidade mas **não é mais
  consumida pela UI Fase 2**.
- `public.rpc_set_communication_template_metadata(uuid, text, text, jsonb, text) → jsonb`
- `public.rpc_preview_administrative_broadcast_count(public.app_role) → jsonb`
- `public.rpc_resolve_outbox_address(uuid) → jsonb`
- `public.rpc_skip_communication_delivery(uuid, text, text) → jsonb`
- `public.rpc_cancel_communication_delivery(uuid, text, text) → jsonb`
- `public.rpc_defer_communication_delivery(uuid, text, text, integer) → jsonb`
- `public.rpc_fail_communication_delivery_v2(uuid, text, text, text, boolean) → jsonb`
- `public.rpc_dispatch_inapp_notification(uuid, uuid, uuid, text, text) → jsonb`
- `public.rpc_create_portal_notification_secure(uuid, text, text, text) → jsonb`
- `public.rpc_create_operational_notification_secure(uuid, text, text, text, text) → jsonb`


### Helpers system-side (SECURITY DEFINER, sem grant a authenticated/anon)

- `public._comunicacao_expand_event(uuid, text, text, uuid, jsonb) → jsonb`
- `public._comunicacao_publish_system_event(text, text, uuid, jsonb, text) → jsonb`
- `public._comunicacao_resolve_recipients_v2(text, public.comunicacao_regras, text, uuid) → record`
- `public._comunicacao_build_snapshot_v2(text, text, uuid, jsonb, uuid, uuid) → jsonb`

### Fase 1 preservada

- `public.rpc_fail_communication_delivery(uuid, text, text, text) → jsonb`
  **não é alterada** pela Fase 2 (postcheck verifica). A Fase 2 introduz
  `rpc_fail_communication_delivery_v2` com um 5º argumento `boolean` para
  `is_permanent` e é a **única** consumida pelo worker v2.

### Semântica de `attempts` (importante)

- `rpc_claim_communication_outbox` (Fase 1) **já incrementa** `attempts` no
  claim.
- `rpc_fail_communication_delivery_v2` **NÃO** re-incrementa; compara
  `r.attempts` com `max_attempts` e aplica backoff exponencial em cima
  desse valor. `is_permanent=true` ⇒ `dead_letter` imediato.
- `rpc_defer_communication_delivery` **desfaz** o incremento do claim
  (`attempts = GREATEST(r.attempts - 1, 0)`), pois canal OFF / config
  inválida / template não aprovado **não** é tentativa de provedor.

## Variáveis de ambiente

| Env | Uso | Obrigatório para envio real |
|---|---|---|
| `COMMUNICATION_DELIVERY_ENABLED` | Gate global | ✅ |
| `EMAIL_DELIVERY_ENABLED` | Ativa SMTP | ✅ para e-mail |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Config SMTP | ✅ para e-mail |
| `WHATSAPP_DELIVERY_ENABLED` | Ativa Meta Cloud API | ✅ para WA |
| `WHATSAPP_ACCESS_TOKEN` | Token do app Meta | ✅ para WA |
| `WHATSAPP_PHONE_NUMBER_ID` | ID de origem (numérico) | ✅ para WA |
| `WHATSAPP_API_VERSION` | **obrigatório**, sem default; allowlist explícita | ✅ para WA |
| `COMMUNICATION_INAPP_ADAPTER_ENABLED` | Ativa in_app adapter | ✅ para in_app |

**WhatsApp API version — allowlist (jul/2026):** apenas `v24.0` e `v25.0`
são aceitas. Versões anteriores foram removidas por
saírem da janela de suporte operacional da Meta. Qualquer versão fora da
allowlist — inclusive `undefined` — faz `isWhatsappConfigValid()` retornar
`false` e o adapter responder `provider_not_configured`. Não há default
silencioso em `adapters.ts`. Reavaliar trimestralmente contra o catálogo
oficial (Graph API changelog).

## Mapa de outcomes → RPC de terminação (worker v2)

| Outcome adapter | Ação do worker | Efeito em `attempts` |
|---|---|---|
| `sent` | `rpc_complete_communication_delivery` | mantém contagem do claim |
| `provider_not_configured` | `rpc_defer_communication_delivery` | devolve (`-1`) — não é tentativa de provedor |
| `deferred` (config inválida/template não aprovado) | `rpc_defer_communication_delivery` | devolve (`-1`) |
| `opt_out` | `rpc_skip_communication_delivery` | não altera |
| `invalid_recipient` | `rpc_cancel_communication_delivery` | não altera; termina em `cancelled` |
| `transient_error` (timeout, 5xx, 429, rede) | `rpc_fail_communication_delivery_v2(..., is_permanent=false)` | usa `r.attempts` do claim; se `< max_attempts` reagenda com backoff, caso contrário `dead_letter` |
| `permanent_error` (4xx exceto 429, mapping inválido, template meta ausente/não aprovado) | `rpc_fail_communication_delivery_v2(..., is_permanent=true)` | `dead_letter` imediato |

Observações por canal:

- **SMTP:** `4xx` do servidor SMTP em envio é normalmente **transitório**
  (`try again later`) e mapeia para `transient_error`; erros `5xx` de
  protocolo indicam falha permanente do envelope e mapeiam para
  `permanent_error`. Timeouts e falhas de rede/TLS = `transient_error`.
- **WhatsApp Cloud API:** `429` e `5xx` HTTP = `transient_error`;
  `4xx` (401/403/400) = `permanent_error`, com mensagem sanitizada (sem
  token). Template sem `provider_template_status='approved'`,
  `parameter_mapping` inválido ou variáveis ausentes = `permanent_error`
  **antes** do fetch.
- **in_app:** entrega principal via
  `rpc_dispatch_inapp_notification(outbox_id, user_id, cliente_id, titulo, mensagem)`,
  idempotente por `outbox_id` (grava em `comunicacao_inapp_dispatch`).
  As antigas RPCs `rpc_create_portal_notification_secure` e
  `rpc_create_operational_notification_secure` permanecem apenas como
  **compat administrativa** e não são o caminho principal do worker.

## Resolução source-aware e datas

`_comunicacao_resolve_recipients_v2` e `_comunicacao_build_snapshot_v2`
recebem `(source_type, source_id)` e resolvem destinatários e payload
diretamente contra a tabela de origem:

- `source_type = 'ordens_servico'` ⇒ `FROM public.ordens_servico`; usa
  `o.data_programada`.
- `source_type = 'ordens_servico_onfarm'` ⇒
  `FROM public.ordens_servico_onfarm`; usa **`o.data_recomendada`**
  (a tabela on-farm **não** possui `data_programada`). O rótulo do payload
  continua `data_prevista` (contrato do template).

O worker usa **`payload_snapshot` direto** da linha de outbox (gravado no
publish) e não recomputa payloads na entrega.

## Broadcast administrativo

- `rpc_preview_administrative_broadcast_count(role)` retorna estimativa
  para o admin sem materializar destinatários.
- `_comunicacao_publish_system_event(..., source_type)` materializa o
  broadcast em outbox usando `nonce UUID` gerado no cliente (reset apenas
  após sucesso/limpeza explícita). Impede duplicação por duplo clique.
- Perfil `gestor` é **read-only** em templates, regras e comunicados
  (nenhum botão de escrita renderizado; RLS reforça no servidor).

## Sequência segura de ativação em staging

Ativar por canal, um por vez, observando por 24h antes de avançar.

1. **in_app** primeiro (baixo risco, sem custo, canal interno):
   1. `COMMUNICATION_DELIVERY_ENABLED=true`
   2. `COMMUNICATION_INAPP_ADAPTER_ENABLED=true`
   3. Validar `communication-health` e verificar `comunicacao_outbox`
      sem `dead_letter`/`cancelled` inesperado por 24h.
2. **e-mail** (SMTP) depois do in_app estável:
   1. Configurar `SMTP_*` completos.
   2. `EMAIL_DELIVERY_ENABLED=true`.
   3. Validar entrega em caixa controlada; observar
      `transient_error`/`permanent_error` por 24h.
3. **WhatsApp** por último (custo, aprovação de template, allowlist):
   1. Configurar `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
      (numérico) e `WHATSAPP_API_VERSION` (obrigatório, `v25.0`
      recomendado; `v24.0` aceito).
   2. Garantir `provider_template_status='approved'` para o template.
   3. `WHATSAPP_DELIVERY_ENABLED=true`.
   4. Iniciar com número de teste; observar 401/403/429/5xx.

Reverter é sempre válido: desligar a flag do canal reduz o risco a zero
sem rollback de schema.

## Rollback

```
psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f restoration/comunicacao-fase2/rollback.sql
```

O `rollback.sql` remove **apenas** objetos criados pela Fase 2 v2:

- Triggers `trg_comunicacao_os_pronto_retirada` e
  `trg_comunicacao_os_onfarm_pronto_retirada` e suas funções.
- Helpers v2: `_comunicacao_publish_system_event`,
  `_comunicacao_expand_event`, `_comunicacao_resolve_recipients_v2` e
  `_comunicacao_build_snapshot_v2`.
- RPCs novas: `rpc_set_communication_template_metadata`,
  `rpc_preview_administrative_broadcast_count`,
  `rpc_resolve_outbox_address`, `rpc_skip_communication_delivery`,
  `rpc_cancel_communication_delivery`,
  `rpc_defer_communication_delivery`,
  `rpc_fail_communication_delivery_v2`,
  `rpc_dispatch_inapp_notification`,
  `rpc_create_portal_notification_secure`,
  `rpc_create_operational_notification_secure`.
- Tabela `comunicacao_inapp_dispatch`.
- Colunas e constraints de meta em `comunicacao_templates`.

Não toca em objetos da Fase 1. Em particular, **não restaura**
`_comunicacao_build_snapshot` (helper Fase 1) — porque a Fase 2 v2 **não o
substitui nem o remove**; a versão v2 é aditiva
(`_comunicacao_build_snapshot_v2`). Se algum dia o helper Fase 1 for
depreciado, o rollback será revisto explicitamente.

## Nota sobre `produto_pronto_aplicacao`

Continua como **ação manual/admin** — não há trigger adicionado nem
mapeamento automático a partir de `entregue`/`finalizada`. O acionamento
manual está exposto no painel administrativo
(`ManualProdutoProntoAplicacaoPanel`), usando o mesmo caminho de publish
system-side com `source_type`.

---

## Fase 2.4 — Hardening operacional (2026-07-27)

### rpc_set_communication_template_metadata (WA)
- Status aceitos: `draft | pending | approved | rejected | paused | disabled` (o valor legado `submitted` foi removido; se surgir em UI antiga, mapear para `pending`).
- `parameter_mapping`: array com objetos `{index:int>=1, variavel:text}`, índices sequenciais 1..N, sem duplicidade, `variavel ∈ comunicacao_templates.variaveis`. Template sem variáveis exige `[]`.
- `approved` exige `provider_template_name` e `language_code` não vazios e mapping completo (N = tamanho de `variaveis`).
- `provider_template_name` é imutável a partir do momento em que o status atinge `approved` (persiste em `paused|disabled`).
- Máquina de estados: `draft→pending`, `pending→{draft,approved,rejected}`, `approved→{paused,disabled}`, `paused→{approved,disabled}`, `rejected→{draft,pending}`, `disabled` terminal.

### rpc_publish_communication_event_v2
- `idempotency_key` obrigatório com **8..200** caracteres.
- `administrative_important_update` exige `source_type IS NULL AND source_id IS NULL`; `payload.titulo` e `payload.mensagem` obrigatórios e não vazios após `trim`; `target_role` obrigatório e válido.
- Eventos de OS continuam exigindo `source_type ∈ {ordens_servico, ordens_servico_onfarm}` e `payload = {}`.

### UI de comunicação (admin)
- Novos painéis restritos a `administrador`:
  - **Saúde dos canais** — invoca `communication-health` sob demanda. Nunca exibe segredos, apenas `configured/enabled`. Falha/função ausente é tratada como aviso (não quebra a tela). Sem polling.
  - **Verificar canal** — chama `rpc_verify_communication_channel`. Aceita **apenas UUID colado** (`user_id` OU `cliente_id`), canal, e flags `email_verificado/telefone_verificado`. **Não** listamos perfis de terceiros na UI para evitar exposição de PII via RLS ampla; UUIDs devem ser obtidos em Gestão de Usuários/Clientes. Gestor não pode verificar terceiros (RPC restringe a admin).
- Sem alterações em grants/RLS.

### Runbook operacional
- Nenhuma mudança em envio real: adapters permanecem desligados por padrão (flags globais + adapter-específicas).
- Rollback: reaplicar `restoration/comunicacao-fase2/rollback.sql` (assinaturas Fase 2.4 não introduziram novos objetos).

---

## Fase 2.5 — Correção pontual (2026-07-27)

### `fetchCommunicationHealth`
- Nunca propaga `error.message` bruto (Edge Function/Supabase/exception) para a UI.
- Retorna apenas códigos allowlisted: `unauthorized`, `function_unavailable`, `unexpected_error`. Detalhes técnicos ficam em `console.warn` do cliente.
- Mapeamento: 401/403 → `unauthorized`; 404/405/501/503 → `function_unavailable`; demais → `unexpected_error`.

### Verificar canal (admin)
- UI restrita a `email` e `whatsapp` (canais com verificação externa real). `in_app`/`push` **não** são verificáveis por este fluxo.
- O canal determina a flag: `email` → `p_email_verificado=true, p_telefone_verificado=null`; `whatsapp` → `p_email_verificado=null, p_telefone_verificado=true`.
- Esta tela **apenas marca verificado**. Revogar/limpar verificação segue fluxo específico (RPC direta em suporte, com trilha de auditoria) e não é exposta aqui para evitar operação ambígua.
- Continua admin-only na UI e no RPC; gestor não vê os painéis de saúde nem de verificação.
