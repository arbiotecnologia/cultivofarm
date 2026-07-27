# Relatório de Certificação Corretiva — Módulo de Comunicação (Staging)

- Alvo: `ar-bio-temp` / project ref `ikaauvsflpmamgxmkhoq` (staging).
- Produção `navfzbwgwzruipouyfnk` NÃO foi tocada.
- Commit base desta certificação: `1449602b7a8a0ed254df4176937a0bde0945d46a`.
- Início da execução (UTC): `2026-07-27T04:04:14Z`.
- Término da execução (UTC): `2026-07-27T04:05:46Z`.
- Flags de entrega: TODAS OFF (`COMMUNICATION_DELIVERY_ENABLED`, `EMAIL_DELIVERY_ENABLED`, `WHATSAPP_DELIVERY_ENABLED`, `COMMUNICATION_INAPP_ADAPTER_ENABLED`, `WHATSAPP_WEBHOOK_ENABLED`).
- Frontend NÃO publicado.

## 1. Correção do `supabase/config.toml` e redeploy

- `supabase/config.toml` reescrito para conter apenas:
  ```
  project_id = "ikaauvsflpmamgxmkhoq"

  [functions.whatsapp-status-webhook]
  verify_jwt = false
  ```
- Nenhuma outra função recebeu override de `verify_jwt`. As demais herdam o padrão gerenciado (JWT validado em código via `getClaims`).
- Redeploy executado a partir do config corrigido em `2026-07-27T04:04:14Z` (UTC) para:
  - `communication-health` — PASS (deploy retornou sucesso)
  - `process-communication-outbox` — PASS
  - `whatsapp-status-webhook` — PASS
- Inspeção remota da configuração `verify_jwt` por função: **LIMITADA** — as ferramentas disponíveis nesta sessão não expõem leitura do estado remoto de `verify_jwt` por função. Evidência disponível: config-as-code corrigido e redeploy bem-sucedido das três funções a partir desse arquivo. Não afirmamos além disso.

## 2. Execução das verificações (com evidência sanitizada)

Legenda: PASS = verificado por consulta contra staging. SKIP = não executável nesta sessão; motivo declarado.

| # | Verificação | Resultado | Evidência |
|---|-------------|-----------|-----------|
| 2.1 | F1 postcheck: 7 tabelas `comunicacao_*` presentes | PASS | `tables_missing=0` sobre `comunicacao_templates, comunicacao_regras, comunicacao_eventos, comunicacao_outbox, comunicacao_preferencias, comunicacao_audit_log, comunicacao_consent_log` |
| 2.2 | F1 postcheck: RLS habilitada nas 7 tabelas | PASS | `rls_disabled=0` em `pg_class.relrowsecurity` |
| 2.3 | F1 postcheck: RPCs de outbox presentes | PASS | Presentes com nomes v3: `rpc_claim_communication_outbox`, `rpc_complete_communication_delivery`, `rpc_fail_communication_delivery`, `rpc_fail_communication_delivery_v2`, `rpc_defer_communication_delivery`, `rpc_cancel_communication_delivery`, `rpc_skip_communication_delivery`, `rpc_publish_communication_event`, `rpc_resolve_outbox_address`. Divergência do texto original (`rpc_lease_outbox_batch`/`rpc_mark_outbox_sent`/`rpc_mark_outbox_failed`) é somente de nomenclatura no postcheck — as funções equivalentes v3 existem e são as chamadas pelo worker. |
| 2.4 | F2 postcheck: colunas novas em `comunicacao_templates` | PASS | `provider_template_name, language_code, parameter_mapping, provider_template_status` presentes |
| 2.5 | F2 postcheck: CHECK constraints de metadata | PASS | `comunicacao_templates_email_assunto_chk`, `comunicacao_templates_whatsapp_meta_chk`, `comunicacao_templates_non_whatsapp_meta_chk` presentes em `pg_constraint` |
| 2.6 | F2 postcheck: gatilhos `AFTER UPDATE OF status` para `pronto_entrega`/`pronto_retirada` em `ordens_servico` e `ordens_servico_onfarm` | PASS | `trg_comunicacao_os_pronto_retirada` (em `ordens_servico`) e `trg_comunicacao_os_onfarm_pronto_retirada` (em `ordens_servico_onfarm`) instalados com `WHEN (new.status IS DISTINCT FROM old.status)`. Nomes divergem do texto original (`trg_os_pronto_entrega_communication`) — presentes com a mesma semântica funcional. |
| 2.7 | F2 postcheck: RPCs de publicação/metadata | PASS | `rpc_publish_communication_event_v2`, `rpc_set_communication_template_metadata`, `rpc_verify_communication_channel` presentes |
| 2.8 | F4 postcheck: colunas de delivery em `comunicacao_outbox` | PASS | `provider_delivery_status, provider_status_at, delivered_at, read_at, provider_failed_at` presentes |
| 2.9 | F4 postcheck: tabela `comunicacao_provider_receipts` presente | PASS | presente em `information_schema.tables` |
| 2.10 | F4 postcheck: índice UNIQUE em `provider_message_id` | PASS | 1 índice UNIQUE contendo `provider_message_id` em `pg_indexes` |
| 2.11 | F4 postcheck: RPC `rpc_record_whatsapp_delivery_status` presente | PASS | 1 função encontrada com assinatura `(text,text,timestamptz,text)` |
| 2.12 | Grants públicos em `comunicacao_*` | PASS | Consulta a `information_schema.role_table_grants` filtrando `anon/authenticated/service_role` retornou vazio. Acesso é feito somente por RPCs `SECURITY DEFINER`, coerente com o hardening F4 (revoke direto e canal único). |
| 2.13 | 1 policy RLS por tabela `comunicacao_*` | PASS | 8/8 tabelas com policy única em `pg_policies` |
| 2.14 | `search_path` fixo em todas as funções `SECURITY DEFINER` do módulo (aditivo, sem regressão) | PASS | 19/19 funções `SECURITY DEFINER` de `comunicacao/rpc_*` retornam `search_path=public` em `pg_proc.proconfig`. Funções de trigger auxiliares (`comunicacao_outbox_touch`, `*_no_mutation`, `comunicacao_templates_guard_immutable`) também têm `search_path=public`. Nenhuma regressão detectada; nenhuma correção necessária. |
| 2.15 | Typecheck (`bunx tsgo --noEmit`) | PASS | `TSC=0`, log limpo. |
| 2.16 | Build de produção (`bun run build`) | PASS | `BUILD=0`, `✓ built in 24.24s`, PWA `precache 20 entries`. |
| 2.17 | harness-rls F2 (`restoration/comunicacao-fase2/harness-rls.sql`) | SKIP | Requer bloco transacional `BEGIN/ROLLBACK` com escrita simulada de sessão RLS. Ferramentas expostas nesta sessão são `supabase--read_query` (SELECT-only) e `supabase--migration` (comita ao final). Nenhuma delas executa harness gravável+rollback contra staging sem risco de resíduo, o que viola a exigência explícita "não deixar dados". Recomendado executar via `psql --single-transaction` no runbook oficial do kit F3. |
| 2.18 | harness-rls F4 (`restoration/comunicacao-fase4/harness-rls.sql`) | SKIP | Mesmo motivo do 2.17. |
| 2.19 | `smoke-staging.sql` (F1+F2) | SKIP | Mesmo motivo do 2.17. Verificação estrutural equivalente coberta por 2.1–2.14. |
| 2.20 | `smoke-staging-fase4.sql` | SKIP | Mesmo motivo. Verificação estrutural equivalente coberta por 2.8–2.14. |

## 3. Endpoints públicos sem JWT

- Config-as-code: apenas `whatsapp-status-webhook` marcada `verify_jwt = false`. `communication-health` e `process-communication-outbox` NÃO recebem override — permanecem sob a política padrão gerenciada (validação de JWT em código com `getClaims`).
- Redeploy aplicado a partir desse config. Inspeção do estado remoto por função: **LIMITADA** (sem ferramenta de leitura remota nesta sessão). Sem afirmação além do que a evidência de config+deploy suporta.

## 4. Escopo e não-alterações

- Zero migrations aplicadas nesta certificação (só leitura + redeploy).
- Zero seeds, zero mensagens reais, zero secrets alterados, zero flags ligadas.
- Produção `navfzbwgwzruipouyfnk` intocada.
- Frontend não publicado.

## 5. Custo estimado

- Redeploy de 3 Edge Functions + ~7 queries read-only + typecheck + build.
- Bem abaixo do teto de 90 créditos estipulado.

## 6. Resultado

- **GO CONDICIONADO** para staging estrutural: todos os artefatos F1/F2/F4 e as três Edge Functions estão instalados/deployados corretamente; `search_path` blindado; RLS ativa; endpoint público restrito ao webhook.
- **Pendências para GO absoluto**: executar harnesses RLS (2.17, 2.18) e smokes transacionais (2.19, 2.20) via runbook oficial `restoration/comunicacao-deploy/*.sh` com `psql --single-transaction`, fora deste canal read-only.
