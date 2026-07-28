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
**Status: PARCIAL — código integrado, validação empírica pendente.**

**Pronto (aplicado nas subfases anteriores, verificado nesta rodada):**
- Trigger `trg_comunicacao_solicitacao` já cobre INSERT + todas as transições de `status` mapeadas + primeira atribuição de consultor + escalada `urgencia='critica'`.
- Triggers auxiliares `auto_advance_solicitacao_on_{checkin,registro,os}` continuam atualizando `portal_solicitacoes.status`, o que dispara o canônico automaticamente.
- Publisher rejeita `event_key` fora da allowlist e faz anti-spoofing em `cliente_id`/`consultor_atribuido`.
- Resolver v2 cobre as 5 estratégias necessárias.

**Falta (pendente, escopo 1D):**
1. **Harness empírico end-to-end via `psql`** — o sandbox atual não tem `PGHOST` disponível; executar via `supabase--migration` com sentinel `RAISE EXCEPTION 'HARNESS_PASS_ROLLBACK: ...'` continua sendo o padrão certificado. Requer aprovação da migration.
2. **Fixtures autorizadas** para 2 clientes / 1 consultor / 1 outro tenant / 1 admin.
3. **Cenários a comprovar (dentro da transação com rollback):**
   - `INSERT portal_solicitacoes` → gera 1 evento `solicitacao_criada` e (com regras habilitadas temporariamente) 1 linha em `comunicacao_outbox` por regra `source_cliente`/`by_role`/`assigned_consultant` aplicável.
   - `UPDATE consultor_atribuido NULL→X` → gera evento `solicitacao_atribuida` (dedup: se o mesmo UPDATE também move `status→atribuida`, apenas 1 evento).
   - `INSERT visitas_checkin` → advance trigger → 1 evento `solicitacao_checkin_realizado`.
   - `UPDATE registros_consultor.hora_inicio NULL→now()` → 1 evento `solicitacao_em_visita`.
   - `UPDATE registros_consultor.status='convertido_os'` → 1 evento `solicitacao_concluida`.
   - `INSERT ordens_servico_onfarm.registro_consultor_id=X` → advance → 1 evento `solicitacao_aguardando_os`.
   - `UPDATE portal_solicitacoes.status='cancelada'` → 1 evento `solicitacao_cancelada` (2 destinatários: produtor + consultor atribuído).
   - `INSERT` com `urgencia='critica'` → 1 evento adicional `solicitacao_urgencia_critica`.
4. **`_comunicacao_can_deliver`** — comprovar bloqueio quando `comunicacao_preferencias.email_verificado=false` e quando `whatsapp_opt_out_at IS NOT NULL`.
5. **Reversão automática** das regras habilitadas via mesmo `ROLLBACK`.

Nenhum código de aplicação depende dessa validação para funcionar (regras ficam `enabled=false` em produção), mas o gate 1D **só pode ser marcado GO** depois desse harness.

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

`bunx vitest run src/test/comunicacao`:
- **403 tests PASS**
- **1 test FAIL** — `fase1.test.ts > flag padrão é false` — falha porque `.env` local do sandbox contém `VITE_COMUNICACAO_MODULE_ENABLED=true` (necessário para as telas admin funcionarem em dev). Não é regressão de código; é fragilidade do teste ao ambiente. Correção segura: reescrever o teste para stubar `import.meta.env` via `vi.stubEnv`. Não alterado aqui para preservar escopo mínimo desta rodada.

Nenhuma outra regressão. Nada foi editado no runtime nesta rodada.

---

## 4. Regras de segurança em vigor (checar antes de qualquer nova rodada)

- Flags OFF: `COMMUNICATION_DELIVERY_ENABLED`, `EMAIL_DELIVERY_ENABLED`, `WHATSAPP_DELIVERY_ENABLED`, `COMMUNICATION_INAPP_ADAPTER_ENABLED`, `WHATSAPP_WEBHOOK_ENABLED`.
- `COMMUNICATION_TEST_MODE_ENABLED=true` (fail-closed).
- Regras solicitação: `enabled=false` (todas as 11).
- Produção `navfzbwgwzruipouyfnk`: nenhuma conexão desta sessão.
- Nenhum DSN/segredo/token exposto neste documento.

---

## 5. Custo desta rodada e ledger

| Marco | Créditos |
|---|---:|
| Nova janela autorizada | 96,0 |
| Consumo pré-existente (rodadas anteriores) | 16,5 |
| Teto adicional desta execução contínua | 77,0 |
| Consumo desta rodada | **pendente do retorno da plataforma** |
| Consumo acumulado da janela | a ser recalculado após retorno |
| Saldo | a ser recalculado após retorno |

Não há estimativa inventada. O valor real é reportado pela plataforma após commit.

---

## 6. Próxima parada segura recomendada

O trabalho seguro dentro do teto de 77 créditos foi entregue como diagnóstico consolidado, sem alterar código. O próximo gate produtivo com custo previsível é **1D-empírico**: aplicar uma migration com harness transacional sentinela, aprovada, com fixtures e regras temporariamente habilitadas. Estimativa realista da própria plataforma: ~25 créditos.

Gates 2 → 6 exigem trabalho substancial de UI, RPCs administrativas, testes de mock e infraestrutura de observabilidade — cada um provavelmente maior que o teto restante. Recomenda-se abrir novas janelas dedicadas por gate, com escopo explícito e teto próprio, para evitar entregas pela metade.
