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

## 8. Execução transacional dos 4 testes (adendo `2026-07-27T04:11:50Z` UTC, commit `273bbd18a6dde03a220c51e038796bd6a1541e58`)

Método: cada script foi enviado ao `supabase--migration` (envolve a query em transação); o `BEGIN;/ROLLBACK;` top-level foi removido e um `DO $$ RAISE EXCEPTION 'EXPECTED_TEST_PASS_ROLLBACK:<nome>'; END $$;` foi anexado ao final. PASS = a migration falhou EXATAMENTE no marcador (todos os asserts anteriores passaram; Postgres fez rollback automático). FAIL = a migration falhou em assert anterior. Baseline pré-execução: `receipts=0, outbox=0, templates=0, eventos=0, audit=0, consent=0, schema_migrations=506`. Pós-checks confirmaram identidade com o baseline após cada teste — atualiza os itens 2.17–2.20 anteriores.

| # | Teste | Resultado | Evidência sanitizada |
|---|-------|-----------|----------------------|
| 8.1 | `restoration/comunicacao-fase2/harness-rls.sql` | **FAIL** | Postgres: `P0001: harness Fase 2 v2: 2 violacoes detectadas` (linha 116). Diagnóstico read-only pós-falha: (a) check 3 usa `information_schema.role_routine_grants` e retorna vazio para `service_role` nas 8 RPCs de worker, enquanto `pg_proc.proacl` mostra `service_role=X/postgres` em todas; (b) check 6.b positivo para `authenticated` em `rpc_publish_communication_event_v2` também retorna vazio na view, mas `proacl` mostra `authenticated=X/postgres`. ACL real está correta; falha é lacuna de método do harness (view `information_schema.role_routine_grants` não enumera as grants que `pg_proc.proacl` confirma existirem nesta instância). Nenhuma correção aplicada nesta etapa (fora de escopo — proibido tocar config/EF/flags/secrets/frontend). **Rollback confirmado**. |
| 8.2 | `restoration/comunicacao-fase4/harness-rls.sql` | **PASS** | Postgres: `P0001: EXPECTED_TEST_PASS_ROLLBACK:f4_harness`. Marcador terminal alcançado; todos os asserts com `set_config('role','authenticated'/'anon')` e as tentativas negativas de INSERT/EXECUTE passaram. **Rollback confirmado**. |
| 8.3 | `restoration/comunicacao-deploy/smoke-staging.sql` | **FAIL** | Postgres: `P0001: smoke: anon possui EXECUTE indevido em rpc_create_portal_notification_secure` (check 4). Diagnóstico: existem DUAS sobrecargas homônimas — `rpc_create_portal_notification_secure(uuid,text,text,text)` (service_role-only, correta) e `rpc_create_portal_notification_secure(uuid,text,text,text,text,text,uuid,text)` com ACL `anon=X, authenticated=X, service_role=X`. A sobrecarga larga é artefato pré-existente de outro módulo (portal_notificacoes) e NÃO foi introduzida por F1/F2/F4 — mas o smoke casa por nome de rotina e sinaliza. Achado legítimo a triar (revoke da sobrecarga larga OU rename da RPC-alvo do módulo de comunicação para evitar colisão por nome), fora desta etapa. **Rollback confirmado**. |
| 8.4 | `restoration/comunicacao-deploy/smoke-staging-fase4.sql` | **PASS** | Postgres: `P0001: EXPECTED_TEST_PASS_ROLLBACK:smoke_fase4`. Todos os checks contratuais F4 passaram: assinatura e retorno `jsonb` de `rpc_record_whatsapp_delivery_status`, grants `service_role`-only, RLS ligada em `comunicacao_provider_receipts`, `authenticated` com SELECT, ausência de DML direto a `service_role/PUBLIC`, colunas novas em `comunicacao_outbox`, CHECK do enum, índice UNIQUE parcial `ix_comunicacao_outbox_wa_provider_msgid` com predicado `whatsapp`, trigger append-only, e presença de `FOR UPDATE`/`ON CONFLICT`/`RETURNING id` no fonte da RPC. **Rollback confirmado**. |

### 8.5 Pós-checks agregados e resíduos

- Contagens após os 4 testes: `receipts=0, outbox=0, templates=0, eventos=0, audit=0, consent=0` — idênticas ao baseline.
- `supabase_migrations.schema_migrations = 506` antes e depois — nenhuma migration de teste registrada.
- Zero objetos auxiliares criados (nenhuma função/tabela temporária), zero Edge Functions alteradas nesta etapa, flags OFF preservadas.
- Produção `navfzbwgwzruipouyfnk` intocada. Frontend não publicado.

### 8.6 Resultado consolidado

- **PASS**: 8.2 (harness F4) e 8.4 (smoke F4).
- **FAIL** com achados classificados e não corrigidos nesta etapa:
  - 8.1 — harness F2 depende de `information_schema.role_routine_grants`, que nesta instância não enumera grants que `pg_proc.proacl` confirma existirem. Não é regressão de segurança. Recomendação: reescrever o harness usando `has_function_privilege(role, oid, 'EXECUTE')` ou consulta direta a `pg_proc.proacl`.
  - 8.3 — smoke F1/F2 detectou sobrecarga larga pré-existente de `rpc_create_portal_notification_secure` com EXECUTE para `anon` e `authenticated`. Recomendação: revogar EXECUTE de `anon`/`authenticated` da sobrecarga `(uuid,text,text,text,text,text,uuid,text)` ou renomear a RPC-alvo do módulo de comunicação.
- **Status**: os itens 2.17–2.20 do relatório principal ficam substituídos por 8.1–8.4 (2 PASS, 2 FAIL a triar). GO absoluto pendente das duas correções acima; F4 fica certificado ponta a ponta.

### 8.7 Custo

- 4 chamadas ao `supabase--migration` (todas revertidas pelo Postgres) + 3 queries read-only de diagnóstico.
- Sem redeploys, sem builds, sem typecheck nesta etapa.
- Bem abaixo do teto de 90 créditos.
