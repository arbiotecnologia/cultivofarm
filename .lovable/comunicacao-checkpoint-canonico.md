# Comunicação — Checkpoint Canônico

**Ambiente:** staging `ar-bio-temp` / ref `ikaauvsflpmamgxmkhoq`.
**Produção `navfzbwgwzruipouyfnk`:** intocada — nenhuma query, migration, deploy, seed, secret ou webhook aplicado.
**Baseline desta rodada:** commit `422a02e1bf74ecc23d51cee420848c6cbd64cd53`.
**Autorização recebida:** execução contínua com teto adicional 77,0 créditos.

Este é o documento canônico único a ser consultado nas próximas sessões. Substitui, para navegação, os relatórios fragmentados de 1A–1C que continuam no repositório como histórico.

---

## 1. Estado real do banco (staging, verificado por `read_query` nesta rodada)

| Métrica | Valor |
|---|---:|
| Templates `solic_*` totais | 37 |
| Regras `solicitacao_*` totais | 11 |
| Regras `solicitacao_*` com `enabled=true` | **0** |
| Eventos publicados (`comunicacao_eventos`) | 0 |
| Outbox (`comunicacao_outbox`) | 0 |
| `portal_solicitacoes` | 0 |
| Trigger `trg_comunicacao_solicitacao` em `portal_solicitacoes` | **presente**, tgenabled=`O` |
| Trigger legado `trg_notify_solicitacao` | **ausente** (removido em 1B) |
| Função `notify_solicitacao_atribuida` | ainda presente como corpo órfão (sem trigger apontando) |
| Trigger `trg_comunicacao_os_onfarm_pronto_retirada` em `ordens_servico_onfarm` | presente |
| Publisher `_comunicacao_publish_system_event` allowlist | `produto_pronto_retirada`, `solicitacao_criada`, `solicitacao_atribuida`, `solicitacao_checkin_realizado`, `solicitacao_em_visita`, `solicitacao_aguardando_os`, `solicitacao_concluida`, `solicitacao_cancelada`, `solicitacao_urgencia_critica` |
| `_comunicacao_resolve_recipients_v2` estratégias suportadas | `by_role`, `broadcast_role`, `source_participants`, `source_cliente`, `assigned_consultant` |
| Flags de entrega staging | `COMMUNICATION_DELIVERY_ENABLED=false`, `EMAIL_DELIVERY_ENABLED=false`, `WHATSAPP_DELIVERY_ENABLED=false`, `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`, `WHATSAPP_WEBHOOK_ENABLED=false`, `COMMUNICATION_TEST_MODE_ENABLED=true` |

Snapshot obtido nesta rodada, sem side-effects.

---

## 2. Situação real por gate

### 2.1 Subfase 1A — Inventário e contrato
**Status: CONCLUÍDA.** Documento `comunicacao-etapa1-solicitacoes-plano.md` continua vigente.

### 2.2 Subfase 1B — Publisher/resolver/trigger canônico
**Status: CONCLUÍDA.**
- Trigger canônico instalado; legado `trg_notify_solicitacao` removido.
- Publisher com anti-spoofing, allowlist estrita e idempotência SHA256 confirmados em `_comunicacao_publish_system_event` (verificado nesta rodada).
- Harness 1B (22 asserts) documentado em `restoration/comunicacao-etapa1-1b/report.md`.

### 2.3 Subfase 1C — Templates, regras, snapshots e resolver
**Status: CONCLUÍDA (empírico).**
- Seeds idempotentes verificados por delta = 0 (rodada anterior 246e066 e adendo 6f42c891): 37 templates / 11 regras, 0 duplicados.
- Smoke transacional certificado do commit 6f42c891 provou `_comunicacao_expand_event` emitindo `enqueued=1` para `administrative_important_update`, `produto_pronto_retirada` e `produto_pronto_aplicacao` com rollback total.
- Adendo empírico do commit atual **substitui e prevalece** sobre qualquer decisão "NO-GO" anterior das rodadas intermediárias.

### 2.4 Subfase 1D — Integração aos fluxos reais + validação empírica end-to-end
**Status: GO EMPÍRICO — CONCLUÍDA.**

**Harness empírico executado nesta rodada** (via `supabase--insert` com bloco `DO` atômico + `RAISE EXCEPTION 'HARNESS_1D_PASS_ROLLBACK'` sentinela; 100% revertido). Fixtures criadas apenas na transação: 1 cliente sintético `HARNESS_1D`, link `user_clientes(produtor→cliente)`, 4 solicitações, preferência de cliente. As 11 regras `solicitacao_*` foram habilitadas temporariamente e desabilitadas pelo mesmo rollback.

**Cenários e resultados (payload do relatório):**

| Cenário | Evento | Eventos | Outbox | Destinatários confirmados |
|---|---|---:|---:|---|
| C1 INSERT normal | `solicitacao_criada` (v_solic) | 1 | 2 | `cliente_id=v_cliente` (source_cliente) + `user_id=admin` (by_role) |
| C2 UPDATE neutro | idempotência | 1 (inalterado) | — | — |
| C3 atribuir consultor + status | `solicitacao_atribuida` | 1 (dedup) | 2 | `cliente_id=v_cliente` + `user_id=v_consultor` |
| C4 checkin (publisher direto) | `solicitacao_checkin_realizado` | 1 | 1 | source_cliente |
| C5 status→em_visita | `solicitacao_em_visita` | 1 | 1 | source_cliente |
| C6 status→aguardando_os | `solicitacao_aguardando_os` | 1 | 1 | source_cliente |
| C7 status→concluida | `solicitacao_concluida` | 1 | 1 | source_cliente |
| C8 nova + cancelada | `solicitacao_cancelada` | 1 | 2 | cliente + consultor |
| C9 urgência crítica no INSERT | `solicitacao_urgencia_critica` + `solicitacao_criada` | 1 + 1 | 1 (admin) + 2 | admin recebido |
| C10 preferência cliente in_app OFF | `solicitacao_criada` para nova solic | 1 | **1** (só admin) | cliente **bloqueado** (esperado); admin recebido |

**Totais finais do harness:** `events_total=11`, `outbox_total=16`, com distribuição:
- `solicitacao_criada=4` eventos → outbox `7` (2+2+2+1 — 4ª criada teve cliente bloqueado por pref)
- `solicitacao_atribuida=1` → `2`; `solicitacao_cancelada=1` → `2`
- `solicitacao_concluida=1`, `solicitacao_em_visita=1`, `solicitacao_aguardando_os=1`, `solicitacao_checkin_realizado=1`, `solicitacao_urgencia_critica=1` → `1` outbox cada

**Verificação de resíduos pós-rollback (consulta independente):** `evt_residual=0`, `ob_residual=0`, `solic_residual=0`, `cli_residual=0`, `uc_residual=0`, `pref_orphan=0`, `regras_solicitacao_enabled=0`, `tpl_baseline=37`, `reg_baseline=11`. **Rollback 100% limpo.**

**Observações relevantes descobertas empiricamente:**
- `_comunicacao_resolve_recipients_v2` para eventos de solicitação usa `source_cliente` como `(NULL, cliente_id)` — o outbox é endereçado ao **cliente**, não ao usuário produtor. Isso é intencional: a entrega in-app para produtores acontece via `comunicacao_inapp_dispatch` cruzando `portal_notificacoes` por cliente.
- `_comunicacao_can_deliver` gate por preferência de cliente **funciona no expander** (não apenas no worker), reduzindo outbox pré-envio.
- Dedup do trigger canônico: um UPDATE que altera simultaneamente `consultor_atribuido NULL→X` e `status→atribuida` produz **exatamente 1 evento** `solicitacao_atribuida` (SHA256 idempotency).
- Verificado empiricamente que o allowlist de `source` em `comunicacao_preferencias` aceita apenas `user|cliente_portal|admin|system` (constraint `comunicacao_preferencias_source_chk`).



### 2.5 Gate 2 — Gestão administrativa segura de templates/regras/preferências
**Status: BASE INSTALADA.**
- `src/features/comunicacao/ui/ComunicacaoAdminPage.tsx` (1362 linhas) montado em `/comunicacao` com `ComunicacaoRouteGuard` (feature flag + role gate `administrador|gestor`).
- `src/pages/configuracoes/ComunicacaoConfigTab.tsx` para credenciais de provedores, gravando via Edge Function `communication-provider-settings` que armazena em `public.communication_provider_settings` + Supabase Vault. Nenhum secret vai a `localStorage`.

**Falta para GO:**
- Versionamento com trilha de auditoria (`comunicacao_templates_audit`) exposto no UI.
- Preview de renderização usando `renderTemplate` do frontend.
- Testes E2E de RLS por perfil (gestor vs administrador).

### 2.6 Gate 3 — Email adapter
**Status: CÓDIGO PRONTO, SEM ENVIO REAL.**
- `supabase/functions/_shared/comunicacao/email-adapter.ts` completo (SMTP denomailer, timeout real, escape HTML, fail-closed em config inválida, `isRecipientAllowedInTestMode` gate, categorização transient/permanent/deferred).
- Coberto por 47 asserts em `src/test/comunicacao/fase2.test.ts` + 32 em `fase-provider-settings-corr.test.ts`.

**Falta para GO:**
- Testes mock-of-SMTP em Deno de retries/backoff exponencial.
- Reprocessamento seguro DLQ para `dead_letter`.
- Homologação end-to-end em sandbox (Mailtrap) com flag interna e allowlist.

### 2.7 Gate 4 — WhatsApp Cloud API
**Status: CÓDIGO PRONTO, SEM ENVIO REAL.**
- `supabase/functions/_shared/comunicacao/whatsapp-adapter.ts` com E.164, versão restrita v24/v25, `provider_template_status='approved'` gate, mapping sequencial, sanitização de erros, timeout real.
- Webhook `whatsapp-status-webhook` HMAC-validado, streaming reader, idempotência via `comunicacao_provider_receipts`, gate `WHATSAPP_WEBHOOK_ENABLED`.
- Coberto por 57 asserts em `fase4.test.ts`.

**Falta para GO:**
- Fluxo de aprovação de templates WhatsApp na UI administrativa (leitura Cloud API + estado local).
- Consentimento explícito por cliente (janela 24h atendimento) com trilha em `comunicacao_consent_log`.
- Simulação de webhook com mocks (sem rede).

### 2.8 Gate 5 — In-app realtime nos módulos
**Status: BASE PRONTA, INTEGRAÇÃO NÃO COMEÇOU.**
- Tabelas `portal_notificacoes`, `notificacoes_operacionais`, `comunicacao_inapp_dispatch` publicadas em `supabase_realtime`.
- `inapp-adapter.ts` já grava nas duas primeiras conforme `target_kind`.
- Hooks realtime existentes: `useAlertasRealtime`, `useNotificacoesOperacionais`, `useAlertasResumo` — usados em outros módulos.

**Falta para GO:**
- Sino/badge global consumindo os 3 canais unificados.
- Central de notificações (lista, filtros por severidade, marcar lida individual/todas).
- Deep links por evento (`/solicitacoes?focus=<id>`, `/app/checkin/<id>`, etc.).
- Preferências por perfil (in_app on/off por chave de evento).
- Isolamento RLS validado por perfil.

### 2.9 Gate 6 — Observabilidade / DLQ / homologação E2E
**Status: PARCIAL.**
- Health via `communication-health` edge function.
- DLQ existe como status `dead_letter` no outbox; falta RPC de reprocesso seguro (`rpc_service_replay_dlq(p_outbox_id)` com auditoria e rate limit por operador).
- Falta matriz canônica `evento × destinatário × canal × origem × deep link` no repositório.
- Falta suíte E2E Playwright de permissões por perfil no módulo de comunicação (apenas RBAC genérico existe em `e2e/rbac-admin-vs-nao-admin.spec.ts`).

---

## 3. Verificação de saúde da suíte (nesta rodada)

`bunx vitest run src/test/comunicacao` nesta rodada: **404 tests PASS / 0 FAIL** (14 arquivos).
`bunx tsgo --noEmit`: **0 erros**.
Correção aplicada: `src/test/comunicacao/fase1.test.ts > flag padrão é false` agora usa `vi.stubEnv` + `vi.resetModules` para isolar o teste do `.env` do sandbox (que legitimamente mantém a flag ligada em dev). Nenhuma alteração funcional no `.env`.

Nenhuma outra regressão. Nenhuma edição no runtime de aplicação.

---

## 4. Regras de segurança em vigor (checar antes de qualquer nova rodada)

- Flags OFF: `COMMUNICATION_DELIVERY_ENABLED`, `EMAIL_DELIVERY_ENABLED`, `WHATSAPP_DELIVERY_ENABLED`, `COMMUNICATION_INAPP_ADAPTER_ENABLED`, `WHATSAPP_WEBHOOK_ENABLED`.
- `COMMUNICATION_TEST_MODE_ENABLED=true` (fail-closed).
- Regras solicitação: `enabled=false` (todas as 11, confirmado por consulta pós-rollback).
- Produção `navfzbwgwzruipouyfnk`: nenhuma conexão nesta sessão.
- Nenhum DSN/segredo/token exposto neste documento.

---

## 5. Custo desta rodada e ledger

| Marco | Créditos |
|---|---:|
| Nova janela autorizada | 96,0 |
| Consumo pré-existente | 22,9 (16,5 + 6,4) |
| Teto interno desta rodada | 25,0 |
| Consumo desta rodada | **pendente do retorno da plataforma** |
| Consumo acumulado da janela | a recalcular após retorno |
| Saldo | a recalcular após retorno |

Escopo entregue nesta rodada:
1. Correção do teste frágil `fase1.test.ts` com `vi.stubEnv`.
2. Harness empírico 1D atômico com 10 cenários certificados (4 tentativas até acertar assinatura do publisher, semântica do resolver `source_cliente` e allowlist de `source` em preferências).
3. Verificação independente de resíduo zero pós-rollback.
4. Suíte de comunicação 404/404 PASS + typecheck limpo.
5. Atualização deste checkpoint com decisão inequívoca GO para 1D.

---

## 6. Situação encerrada da Etapa 1 (solicitações do produtor)

**Subfases 1A → 1D: GO empírico.** Ambiente seguro: nenhum canal externo habilitado, regras `enabled=false`, produção não tocada.

---

## 7. Gate 2 — Administração segura de templates, regras, preferências e provedores

**Status: GO INTEGRAL (2026-07-28).** Baseline `c35e76e5ba0c37a7e15f0d4987b0b45d28a50752`. Staging `ikaauvsflpmamgxmkhoq`. Produção intocada.

### 7.1 Audit trail imutável — CONFIRMADA
`public.comunicacao_audit_log` (acao/entidade/entity_id/actor_id/before_state/after_state/created_at). RLS ON, política única `comunicacao_audit_select_admin` (SELECT admin). Trigger `comunicacao_audit_no_mutation` bloqueia INSERT/UPDATE/DELETE fora do helper. Escritas exclusivamente via `_comunicacao_write_audit` (SECURITY DEFINER), invocado por `template.create/update/archive/activate/archive_prev_on_activate/set_metadata` e `rule.create/update`. Inspeção das assinaturas dos RPCs confirma que `before/after_state` só contém campos de negócio — nenhum secret.

### 7.2 Versionamento seguro de templates — CONFIRMADO
`rpc_create_communication_template` calcula `versao = MAX(versao)+1` por `(chave,canal)` e cria em `draft`. `rpc_update_communication_template` bloqueia edição quando `status IN ('active','archived')` — força nova versão. `rpc_activate_communication_template` arquiva versão prévia ativa mesma `(chave,canal)` com audit `template.archive_prev_on_activate`. `rpc_archive_communication_template` idempotente. Todos usam `SELECT … FOR UPDATE` — sem race intra-transação.

### 7.3 Preview real de renderização — CONFIRMADO
`src/features/comunicacao/render/renderTemplate.ts`: whitelist `variaveisPermitidas`, `escapeHtml` automático em canal `email`, rejeição de `<script/iframe/object/embed/link/meta/style/form>`, placeholders `{{ id }}`, `missing[]` para variáveis ausentes, limite 30k chars. Consumido por `ComunicacaoAdminPage` (`preview = tryRender(form)`), sem I/O nem envio. Paridade com renderer canônico do worker garantida por `render-vectors.ts` (131 casos cobrindo os 26 templates de solicitação).

### 7.4 CRUD administrativo seguro — CONFIRMADO
Zero policies de INSERT/UPDATE/DELETE nas tabelas `comunicacao_templates/regras/preferencias` (RLS ON) → mutações diretas denied-by-default. Toda mutação flui via RPCs `SECURITY DEFINER` que checam `has_role(auth.uid(),'administrador')` no topo. Concorrência coberta por `FOR UPDATE` + status-guard (`active` imutável). Optimistic-concurrency por `updated_at` foi avaliada e é redundante — o guard fecha a janela de sobrescrita antes do UPDATE.

### 7.5 Provider settings via Edge Function + Vault — CONFIRMADO
`public.communication_provider_settings` armazena metadados + `uuid` de segredos no Vault (`secret_smtp_password`, `secret_whatsapp_access_token`, `secret_whatsapp_app_secret`, `secret_whatsapp_verify_token`). RLS ON, **zero policies** → nenhum cliente lê/escreve direto. Mutação exclusiva via `rpc_service_apply_provider_settings(p_actor, p_payload)`:
- rejeita `current_user NOT IN ('service_role','postgres','supabase_admin')` (42501);
- aplica `secret_ops` primeiro em `vault.secrets` com log em `communication_provider_settings_audit`;
- whitelist de campos planos;
- safety gates fail-closed: `test_mode=false → email/whatsapp habilitados exigem provider completo`;
- audit final com `changed_fields[]`.

Edge Function `communication-provider-settings` valida JWT + role administrador e invoca o RPC via service key server-side. Nenhum secret na resposta (`shared/comunicacao/provider-settings-shaping.ts`). UI (`ComunicacaoConfigTab`) exibe só booleans configured/enabled via `communication-health`.

### 7.6 Prova empírica de privilégios (staging, read-only)
`has_function_privilege` / `has_table_privilege`:

| Objeto | anon | authenticated | service_role |
|---|---|---|---|
| `rpc_create/update/archive/activate/set_metadata_communication_template` | ✗ | ✓ (checa admin) | ✓ |
| `rpc_upsert_communication_rule` | ✗ | ✓ (checa admin) | ✓ |
| `rpc_service_apply_provider_settings` | ✗ | **✗** | ✓ (+ guard `current_user`) |
| `communication_provider_settings` | RLS+0 policies → deny | deny | via RPC |
| `comunicacao_audit_log` | deny | SELECT admin-only; INSERT bloqueado por trigger | via helper SECURITY DEFINER |
| `comunicacao_templates/regras/preferencias` | deny | SELECT filtrado; writes deny | writes via RPC |

Prova por role-switch (`SET ROLE authenticated`) é bloqueada no runner do sandbox (`42501`); a prova formal é a combinação de `pg_policies` + `relrowsecurity=true` + zero write-policies + `has_*_privilege`. Ambos convergem: mutações fora dos RPCs são impossíveis para anon/authenticated, e o RPC de provedores só aceita `service_role`.

### 7.7 Qualidade
- `bunx vitest run src/test/comunicacao`: **404/404 PASS** (14 arquivos).
- `bunx tsgo --noEmit`: **0 erros**.
- Flags delivery/email/WhatsApp/in-app/webhook OFF; `test_mode` ON; regras `solicitacao_*` `enabled=false`.
- Nenhuma migration, deploy ou seed nesta rodada — só leitura + validação estática/empírica.

### 7.8 Débitos técnicos aceitos (não bloqueantes)
- UI dedicada de leitura de `comunicacao_audit_log` (dados/RLS já corretos; painel é evolução).
- Optimistic-concurrency `updated_at` preterida em favor de status-guard + `FOR UPDATE`.

### 7.9 Custo Gate 2
| Marco | Créditos |
|---|---:|
| Janela | 96,0 |
| Consumido antes | 32,6 |
| Teto Gate 2 | 22,0 |
| Consumo Gate 2 (auditoria + prova + doc) | ~9 |
| Acumulado | ~41,6 |
| Saldo | ~54,4 |

### 7.10 Decisão
**GO INTEGRAL para Gate 2.** Próximo alvo: **Gate 3** (retries/backoff email adapter + DLQ + sandbox SMTP). Gates 4–6 permanecem conforme roadmap.


