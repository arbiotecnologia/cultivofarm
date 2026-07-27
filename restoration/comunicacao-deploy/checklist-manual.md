# Checklist manual — Homologação Fase 3

Executar em staging, com **destinatários de teste controlados** e ativação por
canal sequencial (email → whatsapp → in_app). Cada bloco deve concluir com OK
explícito antes do próximo.

## Pré-condições
- [ ] `apply-staging.sh` e `deploy-functions-staging.sh` concluídos.
- [ ] `verify-staging.sh` sem erros.
- [ ] Feature flags de comunicação OFF; adapters específicos OFF.
- [ ] Conta admin de teste disponível; conta gestor de teste disponível.

## 1) Saúde dos canais (admin)
- [ ] Painel "Saúde dos canais" abre sem erro para admin.
- [ ] Painel **não** aparece para gestor.
- [ ] Botão "Verificar" retorna apenas `configured/enabled` e timestamp; nenhum
      valor de secret é exibido.
- [ ] Simular função indisponível → UI mostra mensagem amigável (`function_unavailable`).

## 2) Templates WhatsApp
- [ ] Template **sem variáveis** aceita `parameter_mapping=[]` e transiciona
      `draft → pending → approved`.
- [ ] Template **com N variáveis** exige N itens sequenciais 1..N; índice
      duplicado ou faltante bloqueia salvamento.
- [ ] `approved` exige `provider_template_name` + `language_code` não vazios.
- [ ] Após `approved`, `provider_template_name` é imutável; transições fora da
      máquina (`approved → draft`) são rejeitadas.

## 3) Opt-in / verificação de canal
- [ ] Admin marca `email verificado` via UUID colado (canal=email).
- [ ] Admin marca `whatsapp verificado` via UUID colado (canal=whatsapp).
- [ ] Gestor **não** vê o painel de verificação; RPC também recusa gestor.
- [ ] `in_app`/`push` não aparecem nas opções de verificação.

## 4) Evento OS (pronto para retirada)
- [ ] Transitar OS regular para status `pronto_entrega` gera 1 evento e itens
      no outbox (por regra ativa).
- [ ] Transitar OS on-farm com `data_recomendada` preenchido idem.
- [ ] `payload_snapshot` do outbox contém variáveis, não `.payload`.

## 5) Comunicado administrativo por perfil
- [ ] Preview retorna contagem por `target_role` sem expor PII.
- [ ] Publicação exige `titulo`, `mensagem` e `target_role`; `source_*` recusado.
- [ ] Idempotency_key <8 ou >200 rejeitado.

## 6) Worker (process-communication-outbox)
- [ ] Com todas flags OFF, POST autenticado retorna `dry_run:true, disabled:true`.
- [ ] Habilitar apenas `in_app` (adapter) → lote entrega em modo idempotente.
- [ ] Reexecutar o mesmo lote não duplica notificações in-app.
- [ ] Habilitar `email` (adapter) apenas depois de in-app OK; validar 1 envio real.
- [ ] Habilitar `whatsapp` (adapter) por último; validar template `approved`.

## 7) Idempotência e falhas
- [ ] `defer` reverte incremento de `attempts` da claim.
- [ ] `fail_v2` permanente move para `dead_letter` sem incrementar attempts.
- [ ] Segunda entrega com mesmo `idempotency_key` retorna `duplicated`.

## 8) In-App
- [ ] `rpc_dispatch_inapp_notification` protegido por `pg_advisory_xact_lock`;
      duas execuções paralelas resultam em apenas 1 registro.

## 9) Rollback (opcional)
- [ ] `rollback-staging.sh` com `ROLLBACK_COMMUNICATION=true` remove somente
      objetos Fase 2; Fase 1 e dados de negócio intactos; `verify-staging.sh`
      para Fase 1 continua verde.
