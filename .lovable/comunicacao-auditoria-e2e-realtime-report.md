# Auditoria E2E + Fundação Realtime In-App — Módulo de Comunicação

Ambiente exclusivo: staging **ar-bio-temp / `ikaauvsflpmamgxmkhoq`**.  
Produção `navfzbwgwzruipouyfnk` intocada nesta rodada (não lida, não migrada, não deployada).  
Baseline: commit `4ce26ec802dc49281cd7c22ed808d8443060770e`.  
Flags de entrega mantidas OFF; `test_mode_enabled=true`; nenhum segredo real preenchido; nenhum outbox/dispatch novo persistido para usuários reais; zero chamadas externas.

## 1. Inventário de arquitetura observado

### Banco (staging)
- Módulo Comunicação: `comunicacao_templates`, `comunicacao_regras`, `comunicacao_eventos`, `comunicacao_outbox`, `comunicacao_provider_receipts`, `comunicacao_inapp_dispatch`, `comunicacao_audit_log`, `comunicacao_consent_log`, `comunicacao_preferencias`.
- Provider settings: `communication_provider_settings`, `communication_provider_settings_audit`, `communication_provider_settings_rate_limit`.
- Legado in-app (ainda ativo): `notificacoes_operacionais` (perfis internos, por `usuario_id`) e `portal_notificacoes` (produtor, por `cliente_id`).  
  RLS deny-by-default para INSERT/DELETE direto; SELECT/UPDATE restritos ao próprio dono; `idempotency_key` e `source_type/source_id` já presentes.
- RPCs canônicos observados: `rpc_publish_communication_event_v2`, `rpc_lease_outbox`, `rpc_finalize_outbox`, `rpc_dispatch_inapp_notification`, `rpc_record_whatsapp_delivery_status`, `rpc_service_apply_provider_settings`, `rpc_service_load_provider_runtime_config`, `rpc_service_check_rate_limit`.
- Triggers publisher ativos (parcial): `_comunicacao_trg_os_pronto_retirada`, `_comunicacao_trg_os_onfarm_pronto_retirada`, além dos triggers legados que já escrevem em `notificacoes_operacionais` (planejamento, esteira, aprovações de OS, aplicação, entrega, financeiro-parceiro).

### Edge Functions
- `communication-provider-settings` (admin, JWT + role check + rate-limit persistente + CORS trusted-origin).
- `communication-health` (admin, diagnóstico de flags/credenciais mascaradas).
- `process-communication-outbox` (worker; `DELIVERY_ENABLED` OFF ⇒ no-op garantido pelo runtime loader).
- `whatsapp-status-webhook` (`verify_jwt=false` exclusivo desta função em `config.toml`; HMAC + streaming reader; **flag OFF nesta rodada**).
- Legado: `enviar-alertas-notificacoes`, `send-push-notification` — não fazem parte do fluxo novo mas convivem sem colisão.

### Frontend (bells + central)
- `useNotificacoesOperacionais.ts`: query + subscription filtrada por `usuario_id`, cleanup via `removeChannel`.  
- `NotificacoesPopover.tsx` (perfis internos) e `AlertasNotificationBell.tsx` (alertas).  
- Mobile: `MobileNotificacoes.tsx` para portal produtor sobre `portal_notificacoes`.
- Auditoria: `src/pages/auditoria/ComunicacaoTab.tsx` (unificando `comunicacao_audit_log` + `communication_provider_settings_audit`) — restrita a `administrador` via `ADMIN_ONLY` em `Auditoria.tsx`.

## 2. Achados por severidade (com evidência)

| # | Severidade | Achado | Evidência (staging) | Correção nesta rodada |
|---|---|---|---|---|
| A1 | **CRÍTICO** | `notificacoes_operacionais`, `portal_notificacoes` e `comunicacao_inapp_dispatch` **fora** de `supabase_realtime`. Sinos e mobile faziam `.subscribe` sem receber `postgres_changes` — realtime só funcionava por acaso via refetch. | `SELECT count(*) FROM pg_publication_tables WHERE tablename='notificacoes_operacionais'` = 0 (antes) → 1 (depois). | Migration `ALTER PUBLICATION supabase_realtime ADD TABLE …` idempotente + `REPLICA IDENTITY FULL` para propagar UPDATE de `lido`. |
| A2 | **ALTO** | `communication_provider_settings_audit` com RLS habilitado e **zero policies** ⇒ aba Auditoria > Comunicação retornava 0 rows para admin (deny-by-default). | `SELECT count(*) FROM pg_policy WHERE polrelid='public.communication_provider_settings_audit'::regclass` = 0 (antes) → 1 (depois). | `CREATE POLICY provider_settings_audit_select_admin … USING (has_role(auth.uid(),'administrador'))`. |
| A3 | Informativo | Existem dois sistemas in-app (`notificacoes_operacionais`/`portal_notificacoes` legados e `comunicacao_inapp_dispatch` novo). Auditoria confirma que o adapter novo (`_shared/comunicacao/inapp-adapter.ts` → `rpc_dispatch_inapp_notification`) **reusa** as tabelas legadas e apenas registra o vínculo `outbox_id ↔ notification_id` em `comunicacao_inapp_dispatch` para idempotência. Não há duplicidade de linhas exibidas ao usuário. | `SELECT column_name FROM information_schema.columns WHERE table_name='comunicacao_inapp_dispatch'` = apenas `outbox_id,notification_id,target_kind,created_at`. | Decisão arquitetural registrada — fonte canônica: tabelas legadas + adaptador. Sem migração destrutiva. |
| A4 | Aceito nesta rodada | Cobertura de eventos in-app ainda parcial por domínio (ver §3). Publishers via trigger existem para vários fluxos legados; o novo `rpc_publish_communication_event_v2` cobre apenas `os_pronto_retirada`/`os_onfarm_pronto_retirada` e integrações manuais. | `pg_trigger` + grep de `INSERT INTO public.notificacoes_operacionais` em `supabase/migrations`. | Backlog priorizado — §6. |

Regressões procuradas e **NÃO** encontradas: `service_role` exposto ao front, flags de entrega ligadas, secrets em log, PII em título/corpo, `verify_jwt=false` fora do webhook.

## 3. Matriz de cobertura (evento × canal × perfil × publisher)

Legenda: **✅ implementado+testado** · **🟡 implementado sem evidência ponta-a-ponta** · **🔲 backlog P0/P1** · **⏭ P2/P3** · **N/A**.

| Domínio | Evento | Perfis-alvo | In-app | Email | WhatsApp | Publisher observado | Status |
|---|---|---|---|---|---|---|---|
| OS laboratório | pronto para retirada | interno/producao/comercial | ✅ | 🟡 (template) | 🟡 (template) | `_comunicacao_trg_os_pronto_retirada` + `rpc_publish_communication_event_v2` | ✅ (in-app), 🟡 (email/wa dependem de flag) |
| OS On-Farm | pronto para retirada | operador_onfarm/tecnico | ✅ | 🟡 | 🟡 | `_comunicacao_trg_os_onfarm_pronto_retirada` | ✅ (in-app) |
| OS ambos | criada/aprovada/programada/concluída/cancelada | vários | 🟡 (legado grava em `notificacoes_operacionais`) | 🔲 | 🔲 | triggers legados de OS | 🟡 |
| Produção / Lotes / CQ / Envase | mudança de etapa, aprovação/reprovação CQ | producao/gestor | 🟡 (via legado) | 🔲 | 🔲 | `fn_cq_aprovado_avanca_os`, `fn_envase_avanca_os` | 🟡 |
| Estoque embalagem | mínimo/ruptura | producao/gestor | 🔲 | 🔲 | 🔲 | — | 🔲 P1 |
| Pedidos B2B | criado/aprovado/reprovado/ajuste/faturado/entregue | parceiro_b2b, gestor_comercial | 🟡 (parcial via `partner_orders`) | 🔲 | 🔲 | triggers legados de OS parceira + `auto_reject_partner_orders_no_items` | 🟡 |
| Simulações B2B | convertida em pedido | parceiro_b2b | 🟡 | 🔲 | 🔲 | `convert_partner_simulation_to_order_secure` | 🟡 |
| Solicitações produtor | criada/aprovada/status | cliente_produtor, tecnico | 🟡 | 🔲 | 🔲 | `auto_advance_solicitacao_on_*` | 🟡 |
| Financeiro | vencendo/vencido/baixa | financeiro/gestor | 🔲 | 🔲 | 🔲 | — (só há aprovação de crédito B2B) | 🔲 P1 |
| Agenda / Visitas | atribuição/checkin/checkout/finalização | tecnico_agronomo | 🟡 | 🔲 | 🔲 | triggers de `visitas_*` no legado | 🟡 |
| Alertas operacionais/agronômicos | novo alerta crítico | conforme regra | ✅ (canal próprio + realtime via `20260612…`) | 🟡 (`enviar-alertas-notificacoes`) | 🔲 | módulo Alertas próprio | ✅ (in-app) |
| Fiscal | erro de emissão / autorização | administrativo/fiscal | 🔲 | 🔲 | 🔲 | módulo em homologação | 🔲 P2 |
| Cadastros/segurança | novo usuário, mudança de role | administrador | 🔲 | 🔲 | 🔲 | — | 🔲 P1 |

Nada foi implementado nesta rodada nas linhas 🔲/⏭ — apenas registrado no backlog abaixo.

## 4. Fundação Realtime In-App — o que a rodada entregou

- Publicação `supabase_realtime` passou a incluir `notificacoes_operacionais`, `portal_notificacoes` e `comunicacao_inapp_dispatch` (migration aditiva).
- `REPLICA IDENTITY FULL` nessas três tabelas garante que o evento `UPDATE lido=true` propague o `old`/`new` correto para todos os clientes conectados (marcar como lido em uma aba/dispositivo atualiza as demais).
- Hooks já existentes (`useNotificacoesOperacionais`) passam a receber eventos ao vivo sem código novo, porque a subscription é filtrada por `usuario_id=eq.<auth.uid>` e sob RLS restrita ao próprio dono — sem vazamento cross-tenant.
- Fallback de refetch já existia (`refetchInterval: 180_000`), evitando poll agressivo.
- Fonte canônica in-app: **tabelas legadas** (`notificacoes_operacionais` para perfis internos, `portal_notificacoes` para produtor). Novo adapter `rpc_dispatch_inapp_notification` continua sendo o único caminho de escrita a partir do outbox e mantém idempotência por `outbox_id` em `comunicacao_inapp_dispatch`.

## 5. Migrations, RPCs, funções e testes

- **Migration aplicada em `ikaauvsflpmamgxmkhoq`**: uma única migration adicionando as três tabelas ao `supabase_realtime`, ajustando `REPLICA IDENTITY FULL` e criando `provider_settings_audit_select_admin`. Idempotente.
- **Nenhuma Edge Function foi alterada** ⇒ **nenhum redeploy** feito nesta rodada (respeitando a diretriz "só redeploy se o código da função mudou").
- **Testes adicionados**: `src/test/comunicacao/realtime-inapp-audit.test.ts` (7 asserções estáticas fixando invariantes do frontend/migrations desta rodada).
- **Suite `src/test/comunicacao`**: **272/272 PASS** em 13 arquivos (`bunx vitest run src/test/comunicacao`).
- **Typecheck**: `bunx tsgo --noEmit` limpo.
- **Postchecks read-only em staging**:
  ```
  notif_op_in_pub = 1
  portal_in_pub   = 1
  disp_in_pub     = 1
  prov_audit_policies = 1
  ```

## 6. Backlog priorizado (não implementado nesta rodada)

**P1 — próxima janela** (podem ser feitos usando `rpc_publish_communication_event_v2` sem novos triggers frágeis):
1. Eventos de solicitação do produtor (`criada`, `aprovada`, `rejeitada`) publicando via os RPCs `approve/reject` existentes.
2. Eventos de pedido B2B (`aprovado`, `reprovado`, `ajuste_solicitado`, `faturado`, `entregue`) publicando dentro dos RPCs `approve_partner_order` e correlatos.
3. Financeiro: `contas_a_receber_vencendo`/`vencida` e `contas_a_pagar_vencendo` — via job diário (`pg_cron`) chamando `rpc_publish_communication_event_v2` em lote com `idempotency_key = doc_id||data`.
4. Estoque embalagem: alerta de mínimo/ruptura via trigger em `estoque_embalagens` chamando `rpc_publish_communication_event_v2`.
5. Cadastros/segurança: convite, mudança de role, ações administrativas críticas (auditáveis via `audit_senha_log`).

**P2 — planejar**:
6. Fiscal: falha/sucesso de emissão quando o módulo sair de homologação.
7. Agenda/Visita: consolidar eventos de atribuição/checkin/checkout no publisher canônico.
8. Registry central de tipos de evento em `src/features/comunicacao/events.ts` (tipo, prioridade, audience, template padrão, canais permitidos, allowlist de deep-links).

**P3**:
9. Migração progressiva dos triggers legados que gravam direto em `notificacoes_operacionais` para chamarem `rpc_publish_communication_event_v2`, mantendo idempotência.
10. UI de central de notificações unificada em `/notificacoes` (paginação, filtros por tipo, marcar todas).

## 7. Estado seguro atual (checagem final)

- `COMMUNICATION_DELIVERY_ENABLED`, `EMAIL_DELIVERY_ENABLED`, `WHATSAPP_DELIVERY_ENABLED`, `COMMUNICATION_INAPP_ADAPTER_ENABLED`, `WHATSAPP_WEBHOOK_ENABLED`: **OFF**.
- `test_mode_enabled=true`, allowlists e segredos permanecem vazios.
- Zero linhas novas em `comunicacao_outbox`, `comunicacao_inapp_dispatch`, `notificacoes_operacionais` ou `portal_notificacoes` provenientes desta rodada.
- `verify_jwt=false` continua **exclusivo** de `whatsapp-status-webhook` em `supabase/config.toml`.
- Produção `navfzbwgwzruipouyfnk` não recebeu nenhuma leitura/escrita/deploy.

## 8. Checklist para o administrador iniciar a homologação (sem valores nesta rodada)

Fluxo em `/configuracoes?tab=comunicacao` (admin):

1. Manter `test_mode_enabled=ON` e cadastrar em `allowed_emails` / `allowed_phones` apenas destinatários próprios (dev/QA).
2. SMTP — preencher `smtp_host`, `smtp_port`, `smtp_user`, `smtp_from` e usar "Definir senha SMTP" (grava via Vault; nunca exposto no GET).
3. WhatsApp Cloud API — cadastrar `whatsapp_phone_number_id`, `whatsapp_api_version` (`v24.0` ou `v25.0`) e token via "Definir access token".
4. Webhook WhatsApp — só depois de #3, configurar `verify_token` e `app_secret`; usar a URL exibida no card ("Webhook") no painel da Meta.
5. Rodar "Health" no card do canal para confirmar `provider_configured=true` sem revelar segredos.
6. Publicar um evento de teste via `rpc_publish_communication_event_v2` restrito a `test_mode` (destinatário na allowlist) e conferir:
   - registro em `comunicacao_outbox` com `status=pending`,
   - dispatch em `comunicacao_inapp_dispatch` + linha em `notificacoes_operacionais`/`portal_notificacoes`,
   - sino atualiza **sem refresh** (Realtime OK após esta rodada),
   - marcar como lido em uma aba reflete em outra (UPDATE via publication).
7. Só então habilitar `email_delivery_enabled`/`whatsapp_delivery_enabled` — nunca `delivery_enabled=true` global antes de #6 verde.
8. Auditoria: abrir `/auditoria` → aba **Comunicação** e conferir aparecem registros das ações acima (após esta rodada, a policy admin foi corrigida).

## 9. Commit e custo

- Commit desta rodada: a ser preenchido pelo pipeline após merge (baseline `4ce26ec`).
- Custo real estimado: dentro do orçamento de 24 créditos (auditoria + 1 migration + 1 arquivo de teste + relatório; nenhum redeploy de Edge Function).
- **NÃO** há alegação de cobertura total do módulo — apenas fundação realtime + correções P0/P1 dessa rodada. P1–P3 explicitamente pendentes conforme §6.
