# Checklist de Homologação — Módulo de Comunicação AR Bio
Versão: 1.0.0 · Ambiente-alvo: staging `ikaauvsflpmamgxmkhoq`. Produção `navfzbwgwzruipouyfnk` permanece proibida até GO externo explícito.

> Distinção obrigatória: **"pronto para homologação"** = todo o software validado sem envio real (estado atual). **"homologado externamente"** = itens abaixo executados por um humano com credenciais reais e evidência anexada.

## 0. Pré-requisitos técnicos (já concluídos pelo agente)
- [x] Todas as flags de entrega OFF (`COMMUNICATION_DELIVERY_ENABLED`, `EMAIL_DELIVERY_ENABLED`, `WHATSAPP_DELIVERY_ENABLED`, `COMMUNICATION_INAPP_ADAPTER_ENABLED`, `WHATSAPP_WEBHOOK_ENABLED`).
- [x] `test_mode_enabled=true` em `communication_provider_settings`.
- [x] Regras `comunicacao_regras` (26 canônicas) com `enabled=false`.
- [x] Suíte `bunx vitest run src/test/comunicacao` 100% verde; `bunx tsgo --noEmit` sem erros.
- [x] Health snapshot admin-only + rate-limit no DLQ replay ativos.

## 1. SMTP sandbox / allowlist
- [ ] Provisionar SMTP sandbox (Mailtrap, Ethereal ou similar) com credenciais dedicadas.
- [ ] Registrar no Vault via UI `Comunicação → Configurações`: `smtp_host`, `smtp_port`, `smtp_user`, `smtp_password`.
- [ ] Definir `from_email` e `from_name` do remetente institucional.
- [ ] Configurar allowlist de destinatários de teste (`test_mode_allowed_recipients`) apenas com e-mails da equipe.
- [ ] Confirmar que `test_mode_enabled=true` continua marcado.
- [ ] Executar rota `POST /functions/v1/communication-health` como admin e conferir `configured.email=true`, `enabled.email=false`.

## 2. Credenciais Meta / WhatsApp Cloud API
- [ ] Publicar app na Meta e verificar o WABA (Business Manager).
- [ ] Registrar no Vault: `whatsapp_access_token`, `whatsapp_app_secret`, `whatsapp_verify_token`, `whatsapp_phone_number_id`, `whatsapp_waba_id`.
- [ ] Confirmar que o adapter só aceita versões `v24.0` e `v25.0`.
- [ ] Configurar webhook Meta apontando para `POST /functions/v1/whatsapp-status-webhook` com o mesmo `verify_token`.
- [ ] Manter `WHATSAPP_WEBHOOK_ENABLED=false` até rodada controlada.

## 3. Templates WhatsApp aprovados
- [ ] Submeter à Meta os templates listados na matriz canônica (`restoration/comunicacao-gate6/matriz-eventos.md`) com nomes exatos `nome_evento_locale`.
- [ ] Após aprovação, atualizar `provider_template_status='approved'` via UI admin (a UI usa `rpc_admin_set_whatsapp_template_metadata`; nunca por INSERT direto).
- [ ] Registrar mapping de variáveis com placeholders `{{n}}` conforme cadastro na Meta.
- [ ] Confirmar que o gate de ativação bloqueia templates não `approved`.

## 4. Telefones e consentimento
- [ ] Recolher opt-in escrito dos destinatários de homologação (equipe + 1 cliente-parceiro).
- [ ] Registrar cada opt-in via UI `Consentimentos WhatsApp` usando `rpc_admin_set_whatsapp_consent` (origem obrigatória, telefone só armazenado se necessário, mascarado na UI).
- [ ] Marcar `telefone_verificado=true` somente após confirmação bidirecional.
- [ ] Registrar cenário de opt-out e validar que o worker respeita (log `outcome=blocked` em outbox, sem chamada de rede).

## 5. Perfis de teste
- [ ] Criar/reutilizar usuários dedicados a homologação:
  - `admin_hom@arbio.com` (administrador)
  - `gestor_hom@arbio.com` (gestor)
  - `tec_hom@arbio.com` (tecnico_agronomo)
  - `consultor_hom@arbio.com` (consultor_tecnico)
  - `produtor_hom@arbio.com` (cliente_produtor com vínculo em `user_clientes`)
- [ ] Confirmar isolamento por RLS: cada perfil só enxerga o que a matriz autoriza.
- [ ] Nenhum destes perfis deve receber `service_role`.

## 6. Cenários E2E manuais (evidências obrigatórias)
Para cada cenário: capturar (a) screenshot da tela, (b) linha resultante em `comunicacao_outbox`/`comunicacao_audit_log`, (c) resposta 2xx da Meta/SMTP quando aplicável.

### 6.1 E-mail
- [ ] Solicitação criada por produtor → e-mail `solicitacao.created.email` chega no sandbox.
- [ ] OS pronta para entrega → e-mail `os.pronto_entrega.email` chega para o produtor.
- [ ] Ativar temporariamente `EMAIL_DELIVERY_ENABLED=true` apenas durante a rodada, com allowlist ativa; desativar ao final.

### 6.2 WhatsApp
- [ ] Ativar `WHATSAPP_DELIVERY_ENABLED=true` + `WHATSAPP_WEBHOOK_ENABLED=true` na janela.
- [ ] Disparar template aprovado para número opt-in verificado.
- [ ] Validar recebimento no aparelho + webhook Meta → `comunicacao_provider_receipts` atualiza `provider_delivery_status` para `sent/delivered/read`.
- [ ] Reverter para OFF ao final.

### 6.3 In-app
- [ ] Ativar `COMMUNICATION_INAPP_ADAPTER_ENABLED=true`.
- [ ] Produzir evento `solicitacao.assigned` → sino do técnico assinalado incrementa em Realtime, deep link `/solicitacoes?focus={id}` navega correto.
- [ ] Central `/notificacoes` exibe o item, marcar-lido funciona, filtro "não lidas" atualiza contador.
- [ ] Perfil não autorizado ao clicar em deep link inválido cai na central com toast.

### 6.4 DLQ / Observabilidade
- [ ] Simular falha permanente controlada (ex.: template inexistente) → item entra em `dead_letter`.
- [ ] `Comunicação → DLQ` lista o item; replay unitário funciona; replay em lote respeita teto de 20 e rate-limit de 6 lotes/min.
- [ ] Chamada admin a `rpc_admin_communication_health_snapshot` retorna `queue.oldest_pending_age_seconds` coerente e `throughput_24h.success_rate_pct` calculado.
- [ ] `comunicacao_dlq_replay_audit` registra cada replay do admin.

## 7. Segurança
- [ ] Confirmar via `has_function_privilege` que `anon` não executa nenhuma RPC admin.
- [ ] Confirmar via inspeção que nenhuma resposta de Edge Function contém `access_token`, `smtp_password`, `verify_token` ou telefone completo.
- [ ] Rodar `bun run test src/test/comunicacao` novamente após a rodada e anexar log verde.
- [ ] Rodar `security--run_security_scan` e resolver findings introduzidos na janela.

## 8. Encerramento da janela
- [ ] Desligar todas as flags de delivery.
- [ ] Marcar `test_mode_enabled=true` novamente.
- [ ] Anexar ao ticket de homologação: matriz assinada, screenshots, IDs de outbox, IDs de audit, IDs Meta message_id.
- [ ] Registrar decisão final (GO/NO-GO externo) no checkpoint canônico.

## Contatos de escalonamento
- Falha SMTP sandbox: responsável de infra.
- Falha Meta / WABA: responsável de canais.
- Regressão em RLS/RPC: responsável de plataforma (halt imediato, sem promoção para produção).
