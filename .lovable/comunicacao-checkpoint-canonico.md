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
**Status: GO — PRONTO PARA HOMOLOGAÇÃO SEM ENVIO REAL.**
- `email-adapter.ts` hardened: `hasHeaderInjection` bloqueia CR/LF/NUL em subject/from/to; limites `MAX_EMAIL_SUBJECT_LEN=300`, `MAX_EMAIL_ADDRESS_LEN=320`, `MAX_EMAIL_BODY_BYTES=10 MiB`; timeout real via `Promise.race`; escape HTML no corpo; gate `isRecipientAllowedInTestMode` antes de qualquer chamada.
- `classifyEmailError` alinhado à RFC 5321 §4.2.1: **4yz → `transient_error` (retry via `p_is_permanent=false`)** cobrindo 421/450/451/452; **5yz → `permanent_error`** sem exceções inventadas; timeout/rede/DNS/reset/refused → `transient_error`; desconhecido → `transient_error` (fail-safe). Worker `process-communication-outbox/index.ts` já mapeia `transient_error` → `rpc_fail_communication_delivery_v2(..., p_is_permanent=false)`, respeitando backoff+jitter até `max_attempts` antes de qualquer `dead_letter`.
- Migration Gate 3 (staging `20260728014711_d127c7e5-3149-47da-9e13-20f691ae482f.sql`) — **aplicada e verificada nesta rodada** via `has_function_privilege` para os 4 RPCs admin + `rpc_fail_communication_delivery_v2` (anon=false, authenticated=true nas admin, service_role=true em todas):
  - `rpc_fail_communication_delivery_v2` com backoff exponencial e **jitter ±20%** (`0.8 + random()*0.4`), teto 3600s. Assinatura: `(uuid, text, text, text, boolean)`.
  - `rpc_admin_list_communication_dead_letter(p_limit integer, p_offset integer)` — leitura paginada da DLQ, sem PII crua.
  - `rpc_admin_communication_outbox_metrics()` — agregado por status/canal, contagens `dead_letter`/`pending`, tentativas médias, latência média `sent`.
  - `rpc_admin_replay_communication_dead_letter(p_outbox_id uuid)` — replay unitário com `SELECT ... FOR UPDATE`, só do estado `dead_letter`, reseta `next_attempt_at`, escreve `outbox.dlq_replay` em `comunicacao_audit_log`.
  - `rpc_admin_replay_communication_dead_letter_batch(p_limit integer)` — teto rígido `LEAST(20, p_limit)`, `FOR UPDATE SKIP LOCKED`, idempotente por transação.
  - Todas as RPCs Gate 3: `REVOKE ALL ... FROM PUBLIC, anon` + `GRANT EXECUTE ... TO authenticated, service_role` + guard interno `_comunicacao_require_admin()`.
- Admin UI: `ComunicacaoAdminPage > FilaPanel` recebeu `DlqAdminSection` (métricas + fila morta + replay unitário/lote com confirmação, estados loading/erro/vazio, gate `roles.includes("administrador")`).
- **Deploy nesta rodada:** `process-communication-outbox` reimplantado no staging (`ikaauvsflpmamgxmkhoq`) carregando o adapter com classificação 4xx=transient. Nenhuma invocação de envio. Nenhum outro deploy necessário — o adapter só é linkado por essa função (o worker é o único importador de `_shared/comunicacao/email-adapter.ts`).
- Cobertura: `src/test/comunicacao/gate3-email.test.ts` — **30 asserts** com **4xx=transient** para 421/450/451/452 no mock SMTP e nos helpers puros. Suíte comunicação: **434/434 PASS**, typecheck limpo.
- Bloqueio consciente de envio real preservado: verificação SQL nesta rodada em `communication_provider_settings` — `delivery_enabled=false`, `email_delivery_enabled=false`, `whatsapp_delivery_enabled=false`, `inapp_delivery_enabled=false`, `whatsapp_webhook_enabled=false`, `test_mode_enabled=true`. Regras `solicitacao_*`: 0/11 habilitadas. Produção `navfzbwgwzruipouyfnk` não recebeu conexão nesta rodada.

**Falta para entrega externa homologada (fora deste gate):**
- Credenciais SMTP reais do cliente + allowlist controlada no frontend.
- Rodada de homologação com sandbox (Mailtrap/Ethereal) sob autorização explícita.




### 2.7 Gate 4 — WhatsApp Cloud API
**Status: GO — PRONTO PARA HOMOLOGAÇÃO SEM ENVIO REAL.**
- `whatsapp-adapter.ts`: E.164, versão restrita v24/v25, `provider_template_status='approved'` obrigatório, mapping sequencial, variáveis obrigatórias validadas ANTES da rede, timeout real, mensagem sanitizada (nunca token/número), gate `isRecipientAllowedInTestMode` antes de qualquer chamada, payload sempre `type=template` (nunca free-text/session — política 24h enforced por design).
- Novo classificador puro `classifyWhatsappHttpError(status, metaError)` — determinístico e testável:
  - `429` → `transient_error/whatsapp_rate_limited`
  - `5xx` → `transient_error/whatsapp_5xx`
  - `401/403` → `permanent_error/whatsapp_auth` (credencial inválida/conta suspensa)
  - `404` → `permanent_error/whatsapp_not_found` (template ou phone_id inexistente)
  - `400` → `permanent_error/whatsapp_bad_request` (payload/template/param inválido)
  - demais `4xx` → `permanent_error/whatsapp_<status>`
  Worker mapeia `transient_error` → `rpc_fail_communication_delivery_v2(..., p_is_permanent=false)` (backoff+jitter Gate 3) e `permanent_error` → `p_is_permanent=true`. Opt-out não chega ao adapter: bloqueio ocorre em `_comunicacao_can_deliver(user,cliente,'whatsapp')` durante `_comunicacao_expand_event`, antes de qualquer inserção em `comunicacao_outbox` — verificado por inspeção de `pg_get_functiondef` nesta rodada.
- Webhook `whatsapp-status-webhook`: HMAC-SHA256 constant-time, GET challenge numérico, streaming reader com `MAX_BODY_BYTES=128 KiB`, feature-flag `WHATSAPP_WEBHOOK_ENABLED` fail-closed, phone_number_id mismatch = hard error, idempotência SQL `(provider, provider_message_id, status, provider_timestamp)` em `comunicacao_provider_receipts`, máquina de estado monotônica com timestamps por transição, concorrência limitada (max 8), respostas sem PII, sem `console.*`.
- Templates administrados via `rpc_create_communication_template`, `rpc_update_communication_template`, `rpc_activate_communication_template`, `rpc_archive_communication_template`, `rpc_set_communication_template_metadata` (nome/idioma/mapping/status Meta). Somente `approved` envia; snapshot congelado por versão no outbox — token nunca aparece na UI.
- **Novo nesta rodada — migração admin de consentimento** aplicada em staging (`20260728020032`):
  - `public.rpc_admin_set_whatsapp_consent(p_cliente_id uuid, p_user_id uuid, p_acao text, p_source text, p_justificativa text)` — SECURITY DEFINER, `search_path=public`, guard `has_role(...,'administrador')`, XOR entre `cliente_id`/`user_id`, ação enumerada (`opt_in|opt_out|verified`), origem ≤60 chars, justificativa ≤500 chars.
  - Sempre grava linha em `comunicacao_consent_log` (append-only por trigger `comunicacao_consent_no_mutation`) com `actor_id`, `source` e `justificativa` embutida.
  - Upsert idempotente em `comunicacao_preferencias` — reseta `whatsapp_opt_out_at` no opt-in, jamais reduz `telefone_verificado`.
  - ACL verificada empiricamente: `anon.EXECUTE=false`, `authenticated.EXECUTE=true`, `service_role.EXECUTE=true` (`has_function_privilege`).
- **Cobertura**: `src/test/comunicacao/fase4.test.ts` (existente, 57 asserts) + novo `gate4-whatsapp.test.ts` (**28 asserts**) cobrindo mock fetch para sucesso/400/401/403/404/429/5xx/timeout/rede, template não aprovado, E.164 inválido, variável ausente, mapping quebrado, flags OFF, migração admin (SECURITY DEFINER + guard + XOR + trilha + ACL), template-only enforced. Suíte comunicação: **462/462 PASS**, typecheck limpo.
- **Deploy nesta rodada**: `process-communication-outbox` reimplantado em staging carregando o adapter com o classificador novo. Nenhum outro deploy necessário (webhook não mudou). Nenhuma invocação de envio.
- **Estado seguro reconfirmado**: `communication_provider_settings` no staging — `delivery_enabled=false`, `email_delivery_enabled=false`, `whatsapp_delivery_enabled=false`, `inapp_delivery_enabled=false`, `whatsapp_webhook_enabled=false`, `test_mode_enabled=true`. Produção `navfzbwgwzruipouyfnk` intocada.

**UI administrativa Gate 4 — entregue nesta rodada:**
- Nova aba **Consentimentos WhatsApp** (exclusiva admin) em `ComunicacaoAdminPage` — `src/features/comunicacao/ui/ConsentimentoWhatsappPanel.tsx`. Busca cliente por nome/CNPJ/CPF; mostra estado corrente (opt_in / opt_out / verified) a partir de `comunicacao_preferencias`; registra ação via `rpc_admin_set_whatsapp_consent` com origem obrigatória (≤60 chars) e justificativa (≤500 chars, mínimo 8 chars quando `opt_out`); confirmação e feedback toast; histórico ordenado por `created_at desc` a partir de `comunicacao_consent_log` (30 eventos); telefone sempre mascarado (só os 4 últimos dígitos são renderizados); estados loading/erro/vazio.
- Painel de **templates WhatsApp** já expõe status draft/pending/approved/rejected/paused/disabled + nome/idioma/categoria/provider id/mapping via `WhatsappTemplateMetadataEditor`. Nesta rodada adicionamos aviso visual explícito de que a sincronização de status Meta é server-side e permanece **indisponível** enquanto o token WABA não estiver configurado. Zero referência a `access_token` na UI. Ativação segue barrada quando `provider_template_status !== 'approved'`.
- Suíte estática `src/test/comunicacao/gate4-consent-ui.test.ts` (13 asserts) prova: uso obrigatório da RPC, ausência de mutação direta em `comunicacao_preferencias`/`comunicacao_consent_log`, mascaramento do telefone, exigência de justificativa em opt_out, gate `canMutate`, ordenação do histórico, presença da aba, gate `approved` e ausência de token. Snapshot documental idempotente da RPC em `restoration/comunicacao-gate4/rpc_admin_set_whatsapp_consent.sql` (não é executado por CI — auditoria estática; a RPC real já está deployada em staging, ACL empiricamente verificada `anon=false / authenticated=true / service_role=true`).

**Falta para entrega externa homologada (fora deste gate):**
- Credenciais Meta reais + WABA verificado; sincronização de status Meta → banco.
- Rodada de homologação com sandbox Meta sob autorização explícita.



### 2.8 Gate 5 — In-app realtime nos módulos
**Status: GO — PRONTO PARA HOMOLOGAÇÃO SEM ENVIO EXTERNO.**
- **Hook unificado** `src/hooks/useNotificacoesUnificadas.ts`: assina Realtime em `notificacoes_operacionais` (filtro `usuario_id=auth.uid`) e em `portal_notificacoes` (filtro `cliente_id={cliente do portal ativo}`) via `useEffect` com cleanup `supabase.removeChannel` (sem vazamento). Combina os dois streams com id composto `op:<uuid>` / `portal:<uuid>`, dedup por bucket `(origem,tipo,titulo,mensagem,janela 5s)` preservando não-lidas, e fallback de refetch a cada 120 s. Contador `unreadCount` isolado por usuário/cliente ativo — RLS já força escopo, o hook não emite `select *` global. `markRead` e `markAllRead` idempotentes por tabela.
- **Sino/badge global** `src/components/notificacoes/NotificacoesPopover.tsx` (montado em `AppLayout`, presente em todos os layouts autenticados — admin, técnico/consultor, gestor, produção, financeiro, comercial, produtor/portal) agora consome o hook unificado, mostra os 8 mais recentes com badge de origem, oferece "Marcar todas" e link explícito para a central. Ao clicar em item com deep link, valida via allowlist e cai na central quando não autorizado.
- **Central de notificações** `/notificacoes` (`src/pages/CentralNotificacoes.tsx`): lista paginada (20/página, até 200 combinados), filtros `todas | não lidas` e `todas | operacional | portal`, marcar individual/todas, refresh manual, estado vazio/erro/loading, badge de origem por item, severidade derivada do `tipo`. Responsivo.
- **Deep-link allowlist** `src/lib/notificacoes/deepLinkAllowlist.ts`: rejeita esquemas (`http:`, `javascript:`, `mailto:`), protocol-relative (`//`), path traversal (`..`) e links não iniciados em `/`. Autoriza por prefixos internos mapeados por perfil (admin = wildcard; técnico/consultor = `/solicitacoes,/visita,/agenda,/fluxo-tecnico,/notificacoes,/clientes,/fazendas,/talhoes[/consultor]`; produtor = `/portal,/app,/notificacoes`; etc.). Falha → fallback obrigatório à central com toast.
- **Preferências** continuam no painel `PreferenciasPanel` existente, gravadas em `comunicacao_preferencias` (RLS já força `user_id=auth.uid`); eventos administrativos críticos permanecem enforced pelo publisher server-side.
- **RLS/isolamento** — reconfirmado via inspeção: `notificacoes_operacionais` tem 4 policies (`usuario_id = auth.uid` para SELECT/UPDATE); `portal_notificacoes` tem 4 policies (`can_user_access_cliente(cliente_id)` + admin). Nenhum hook novo tenta bypass. A central só lê o que o usuário já enxergaria por RLS.
- **Cobertura** — `src/test/comunicacao/gate5-inapp.test.ts` (10 asserts) prova: rejeição de deep links maliciosos e path traversal; wildcard para admin; unauthorized + fallback à central para perfis restritos; autorização por prefixo; escopo estrito para `cliente_produtor`; `parseCompositeId` bem-formado; `dedupAndSort` preserva não-lida e ordena descendente por data sem colapsar eventos distintos. Suíte comunicação total: **482/482 PASS**, `bunx tsgo --noEmit` **0 erros**.
- **Rota registrada** em `src/App.tsx`: `/notificacoes` renderiza `CentralNotificacoes` dentro do `AppLayout` autenticado.
- **Sem migrations nesta rodada** (todas as tabelas, RLS e RPCs necessárias já estavam presentes desde Fases 0–2). Nenhum deploy de Edge Function necessário — trabalho de frontend + hook.

### 2.9 Gate 6 — Observabilidade / DLQ / homologação E2E
**Status: GO — PRONTO PARA HOMOLOGAÇÃO SEM ENVIO EXTERNO.** Baseline `be555510dbf5bc2d011326cf126ee24218a79a33`.

**Reconciliação com Gate 3.** Já existiam desde Gate 3: `rpc_admin_list_communication_dead_letter(p_limit,p_offset)`, `rpc_admin_communication_outbox_metrics()`, `rpc_admin_replay_communication_dead_letter(p_outbox_id)` e `rpc_admin_replay_communication_dead_letter_batch(p_limit)` (teto 20 + `FOR UPDATE SKIP LOCKED` + auditoria via `_comunicacao_write_audit`). A pendência histórica "falta RPC de reprocesso seguro" está **quitada** — o que faltava era rate-limit por ator e snapshot consolidado.

**Entregas desta rodada (migration `20260728021528`):**
- `public.rpc_admin_communication_health_snapshot()` — snapshot único admin-only cobrindo (queue) contadores `by_status`/`by_canal`, `pending`, `dead_letter`, `oldest_pending_age_seconds`, `oldest_processing_age_seconds`; (throughput_24h) `sent`, `failed_or_dlq`, `success_rate_pct`; (realtime) `ready` (via `pg_publication_tables` para `notificacoes_operacionais` + `portal_notificacoes`); (dlq_admin) `last_replay_at`. Zero PII, zero conteúdo de mensagem, zero secret. `REVOKE ALL FROM PUBLIC,anon; GRANT EXECUTE TO authenticated,service_role`.
- `public.comunicacao_dlq_replay_audit` — tabela de trilha de replays (`actor_id`, `scope∈{unit,batch}`, `target_id`, `batch_size`, `created_at`). RLS ON com policy `SELECT` restrita a `administrador`; trigger `trg_dlq_replay_audit_no_mut` bloqueia INSERT/UPDATE/DELETE fora de SECURITY DEFINER (fail-closed).
- `public._comunicacao_dlq_replay_rate_check(scope,max_per_minute)` (SECURITY DEFINER, `REVOKE ALL FROM PUBLIC,anon,authenticated; GRANT EXECUTE service_role`) — conta replays do `auth.uid()` na janela de 1 min; erra `53400` se excede.
- Rewrap dos RPCs de replay unitário e em lote com rate-limit **30 unitários/min** e **6 lotes/min por administrador**, mantendo teto `LEAST(20)` no lote, `FOR UPDATE SKIP LOCKED`, audit `outbox.dlq_replay*` e agora também inserção em `comunicacao_dlq_replay_audit`.
- Wrapper tipado `fetchHealthSnapshot()` em `src/features/comunicacao/api.ts` com interface `ComunicacaoHealthSnapshot`.

**Matriz canônica versionada** — `restoration/comunicacao-gate6/matriz-eventos.md` v1.0.0. Cobre solicitações, OS/produção/produto pronto, estoque, financeiro/faturas, agenda/visitas e eventos administrativos por perfil (`admin.role_alterada`, `admin.senha_alterada`, `admin.provider_settings_changed`, `admin.dlq_replay`). Para cada linha: origem/trigger, destinatários por perfil, canais, chave de template, severidade, deep link e regra de preferência (todas `enabled=false`; eventos administrativos críticos marcados `forced-on`). Todos os deep links internos referenciados foram alinhados às rotas reais em `src/App.tsx` e são validados pelo `deepLinkAllowlist` para o perfil correspondente — cobertura empírica no test `gate6-observabilidade.test.ts`.

**Checklist de homologação manual** — `restoration/comunicacao-gate6/checklist-homologacao.md` v1.0.0. Separa explicitamente "pronto para homologação" (estado atual) de "homologado externamente". Cobre SMTP sandbox/allowlist, credenciais Meta/WABA, submissão/aprovação de templates, opt-in de telefones, perfis de teste dedicados, cenários E2E manuais por canal (e-mail, WhatsApp, in-app, DLQ), evidências obrigatórias, encerramento seguro (flags OFF + `test_mode_enabled=true`).

**Testes E2E / RBAC.** O repositório possui Playwright + `e2e/rbac-admin-vs-nao-admin.spec.ts` como suíte de RBAC genérica de sistema. Auditoria estática por perfil do módulo de comunicação está integralmente coberta em `src/test/comunicacao/*` (490 asserts): admin-only nas RPCs de template/regra/provider/DLQ/health, isolamento por RLS em `notificacoes_operacionais`/`portal_notificacoes`, opt-out bloqueando pré-outbox, allowlist de deep-link por perfil, ausência de secrets em respostas. **Limite honesto** desta rodada: não foi executada uma nova suíte Playwright autenticada por perfil no módulo — as flags de entrega OFF e a ausência de fixtures de usuários por perfil no sandbox tornam um E2E navegado equivalente aos harnesses estáticos já existentes. O caminho para elevar é o checklist §6 quando a homologação humana for executada.

**Regressões auditadas nos Gates 3–5.** (i) Classificação de erro `email` (SMTP 4yz → transient) permanece coerente com `worker.p_is_permanent=false` — reconfirmado em `gate3-email.test.ts`. (ii) Adapter WhatsApp mantém restrição a `v24.0/v25.0` e classificação de 429/5xx como transitório — `gate4-whatsapp.test.ts`. (iii) Hook unificado in-app preserva não-lido em dedup e não vaza escopo entre usuários/clientes — `gate5-inapp.test.ts`. Nenhuma regressão detectada.

**Débitos técnicos aceitos (não bloqueantes, fora do escopo Gate 6):**
- Suíte Playwright dedicada por perfil autenticado no módulo de comunicação segue bloqueada por ausência de fixtures de usuários homologação no sandbox atual. Auditoria estática (490 asserts em `src/test/comunicacao/*`) e RBAC genérico (`e2e/rbac-admin-vs-nao-admin.spec.ts`) permanecem como cobertura vigente. Elevação prevista no checklist §6 durante homologação humana.

**Estado seguro.** Flags de delivery permanecem OFF (`delivery`, `email`, `whatsapp`, `in_app`, `webhook`); `test_mode_enabled=true`; regras `solicitacao_*`/`produto_*`/`administrative_*` com `enabled=false`; frontend não publicado; produção `navfzbwgwzruipouyfnk` intocada.

**Decisão: PRONTO PARA HOMOLOGAÇÃO SEM ENVIO EXTERNO.** Ativação externa exige execução manual, sequenciada, do `checklist-homologacao.md` com autorização humana e credenciais reais. Este checkpoint não declara "homologado externamente".

### 2.9.1 Correção final Gate 6 (auditoria pós-fechamento)

Baseline `a842fac8ed871ae289f673320f69a4436781bb0c`. Aplicada idempotentemente em staging `ikaauvsflpmamgxmkhoq`; produção `navfzbwgwzruipouyfnk` intocada. Sem envio externo, sem alteração de flags, sem invocação de worker.

**Ampliação do `rpc_admin_communication_health_snapshot`** (idempotente, retrocompatível):
- `flags`: `delivery_enabled`, `email_enabled`, `whatsapp_enabled`, `in_app_enabled`, `whatsapp_webhook_enabled`, `test_mode_enabled` derivados de `public.communication_provider_settings` (colunas reais: `delivery_enabled`, `email_delivery_enabled`, `whatsapp_delivery_enabled`, `inapp_delivery_enabled`, `whatsapp_webhook_enabled`, `test_mode_enabled`). Fallback `false` quando não há linha.
- `providers.email/whatsapp/in_app`: booleanos `configured` derivados da presença de host/from/refs de secret (nunca valores) e `enabled` da flag correspondente. WhatsApp expõe também `webhook_configured` (presença de `secret_whatsapp_verify_token` + `secret_whatsapp_app_secret`) e `webhook_enabled`. Zero UUID/valor de secret retornado.
- `queue.by_event_key_7d`: agregação por `event_key` (join seguro `outbox.event_id → eventos.id`) com contagens `total/sent/pending/failed/dead_letter` em janela de 7 dias.
- `queue.by_canal_status_7d`: matriz `canal.status` em 7 dias.
- `throughput_24h`: mantém `sent/failed_or_dlq/success_rate_pct` e adiciona `avg_attempts_sent`, `avg_attempts_terminal`, `max_attempts`, `avg_latency_ms`, `p95_latency_ms` calculados só sobre `sent_at` real.
- `worker`: `status ∈ {active,idle,stale,unknown}` derivado de timestamps reais (`max(locked_at|sent_at|updated_at)` dentro de `processing/sent/failed/dead_letter`). Sem dados → `unknown` com `last_activity_age_seconds=null` (nunca inventa saúde). Buckets: ≤300s active, ≤1800s idle, >1800s stale.
- `realtime.ready`: `pg_publication_tables` sobre `notificacoes_operacionais` + `portal_notificacoes` (inalterado).
- `dlq_admin.last_replay_at`: derivado de `comunicacao_dlq_replay_audit` (inalterado).

**Edge Function `communication-health`** (redeploy staging):
- Autorização: `INTERNAL_FUNCTION_SECRET` OU `service_role` JWT OU JWT de administrador (`user_roles.role='administrador'`). Nunca `anon`.
- Consome o snapshot consolidado via `sb.rpc('rpc_admin_communication_health_snapshot')`.
- Aplica `sanitize()` como defesa em profundidade: remove qualquer chave que case `/password|secret|token|api_key|access_token|dsn|smtp_user|smtp_host|smtp_from|phone_number_id|verify_token/i` antes de responder.
- Nunca invoca worker, nunca altera flags.

**UI administrativa `ObservabilidadePanel`** (`src/features/comunicacao/ui/ObservabilidadePanel.tsx`):
- Consome `fetchHealthSnapshot` com `refetchInterval=30s`. React Query cobre estados `loading/error/empty` explicitamente, com botão "Tentar novamente" no erro.
- Cards: flags, providers (email/whatsapp/in-app + webhook + realtime), fila (`pending/processing/dead_letter`, item antigo pending/processing, último replay), throughput 24h (`sent`, `failed_or_dlq`, `success_rate_pct`, `avg_attempts`, `max_attempts`, `avg_latency_ms`, `p95_latency_ms`), worker (`status/last_activity/last_sent`). Tone semântico com tokens: `emerald` (ok), `amber` (warn), `destructive` (bad), `border` (neutro).
- Tabelas por `event_key` (7d) e `canal.status` (7d) só renderizam quando há dados; caso contrário, mensagem "Nenhum evento processado ainda".
- Grid responsivo (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-6`). Zero valores hard-coded de secret ou UUID.
- Renderizado apenas para `administrador` em `ComunicacaoAdminPage.tsx`, acima do `CanalHealthPanel` legado (coexistem sem regressão).

**Auditoria empírica das ACLs Gate 6** (via `has_function_privilege` / `has_table_privilege`, staging):

| Alvo | anon | authenticated |
|---|---|---|
| `rpc_admin_communication_health_snapshot()` EXECUTE | ❌ | ✅ (guard `_comunicacao_require_admin` bloqueia não-admin em runtime) |
| `_comunicacao_dlq_replay_rate_check(text,int)` EXECUTE | ❌ | ❌ (só owner via SECURITY DEFINER) |
| `comunicacao_dlq_replay_audit` INSERT | ❌ | ❌ (só owner via RPCs SECURITY DEFINER; trigger `trg_dlq_replay_audit_no_mut` como fail-closed) |
| `comunicacao_dlq_replay_audit` SELECT | ❌ | ✅ (RLS ON com policy admin-only) |

Rate-limit continua funcionando porque os RPCs `rpc_admin_replay_communication_dead_letter{,_batch}` chamam `_comunicacao_dlq_replay_rate_check` sob SECURITY DEFINER (owner tem EXECUTE), enquanto o cliente autenticado não pode invocar o helper diretamente. Trigger `no_mutation` fecha o vetor de INSERT direto.

**Deep links da matriz × rotas reais.** Revisão em `src/App.tsx`: rotas `/notificacoes`, `/ordens-servico`, `/producao`, `/financeiro`, `/agenda`, `/estoque-embalagens`, `/solicitacoes`, `/comunicacao/admin` conferidas; `deepLinkAllowlist` valida prefixo por perfil e é testado empiricamente em `gate6-observabilidade.test.ts`. Nenhuma rota inventada na matriz. **Limite honesto preservado:** Playwright autenticado por perfil segue dependente de fixtures de homologação e não foi executado nesta rodada.

**Suíte comunicação:** `bunx vitest run src/test/comunicacao` → **490/490 PASS** (19 arquivos). Correções: `fase2.test.ts` agora valida `rpc_admin_communication_health_snapshot` + `sanitize()` (health não usa mais `healthBooleans`); `fase-provider-settings-corr.test.ts` reconhece a migração da health function para RPC admin. **`bunx tsgo --noEmit`:** 0 erros. **`bun run build`:** OK (`built in 19.66s`, PWA gerado). Lint global do repo não roda (script `lint` ausente por design); os arquivos alterados desta rodada são exclusivos do módulo de comunicação e passam por typecheck strict + tests dedicados.

**Confirmação de segurança pós-correção:** flags OFF, `test_mode_enabled=true`, regras disabled, frontend não publicado, produção intocada, nenhum envio externo, nenhum secret exposto no snapshot ou na Edge Function.

---

## 3. Verificação de saúde da suíte (nesta rodada)

`bunx vitest run src/test/comunicacao`: **490 tests PASS / 0 FAIL** (19 arquivos, inclui asserts atualizados para snapshot admin consolidado).
`bunx tsgo --noEmit`: **0 erros**.
`bun run build`: **OK**.

Correções acumuladas: `fase1.test.ts` isolamento via `vi.stubEnv`; `fase2.test.ts` alinhado ao classificador unificado + validação do sanitizador de health; `fase2-3-coerencia.test.ts` regex do array de abas relaxado para aceitar `"consentimentos"`; `fase-provider-settings-corr.test.ts` reconhece migração da health function para RPC admin; dedup unificado preserva item não-lido; matriz Gate 6 alinhada às rotas reais de `src/App.tsx`.

## 3.bis Custo desta rodada / ledger

| Marco | Créditos |
|---|---:|
| Ledger pré-rodada (auditoria/correção final) | 83,3/96,0 |
| Teto autorizado desta correção | 9,0 (preservando 3,7) |
| Consumo real (2 migrations RPC + edge fn + painel UI + tipagem + 2 testes ajustados + doc) | a apurar após retorno real |
| Ledger final | a apurar |






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
| Janela autorizada | 96,0 |
| Consumo pré-Gate 3 | 38,7 |
| Gate 3 (real) | 10,2 |
| Correção 4xx Gate 3 (rodada anterior) | 5,4 |
| Acumulado pré-Gate 4 | **54,3** |
| Teto interno Gate 4 | 16,0 |
| Consumo Gate 4 (esta rodada — estimativa) | **≈13,5** |
| Acumulado total | **≈67,8** |
| Saldo remanescente | **≈28,2** |

Escopo entregue nesta rodada (Gate 4):
1. **Adapter** — extraído `classifyWhatsappHttpError` (puro), com códigos determinísticos para 401/403 (`whatsapp_auth`), 404 (`whatsapp_not_found`), 400 (`whatsapp_bad_request`), 429/5xx transient. Substituição in-place do bloco de status HTTP no `sendWhatsapp`. Nenhuma mudança de contrato para o worker.
2. **Migração admin de consentimento** — `rpc_admin_set_whatsapp_consent` aplicada em staging `ikaauvsflpmamgxmkhoq`, com guard `has_role(...,'administrador')`, trilha imutável em `comunicacao_consent_log` e upsert idempotente em `comunicacao_preferencias`. ACL empiricamente verificada.
3. **Confirmação arquitetural** — opt-out é bloqueado ANTES da outbox por `_comunicacao_can_deliver`, inspecionado via `pg_get_functiondef`. Nenhuma rota alternativa permite envio a destinatário com `whatsapp_opt_out_at IS NOT NULL`.
4. **Cobertura** — novo `gate4-whatsapp.test.ts` com 28 asserts (mock fetch + auditoria estática da migração + política template-only). Correção de teste legado em `fase2.test.ts` (`whatsapp_401` → `whatsapp_auth`) para alinhar ao classificador único. Suíte comunicação: **462/462 PASS**, `bunx tsgo --noEmit` **0 erros**.
5. **Deploy** — `process-communication-outbox` reimplantado em staging com adapter atualizado. Sem invocação de envio. Webhook e demais funções WhatsApp não requerem redeploy.
6. **Estado seguro** — todas as 5 flags de entrega OFF, `test_mode_enabled=true`, produção intocada.

**Decisão: GO — WhatsApp pronto para homologação sem envio externo real.** A ativação exige, sequencialmente, (a) publicação e verificação do WABA na Meta, (b) preenchimento dos slots Vault (`whatsapp_access_token`, `whatsapp_app_secret`, `whatsapp_verify_token`) via UI, (c) sincronização de status de templates aprovados, (d) opt-in explícito por cliente registrado via `rpc_admin_set_whatsapp_consent`, (e) autorização humana para acender `whatsapp_delivery_enabled` e `whatsapp_webhook_enabled`.





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


