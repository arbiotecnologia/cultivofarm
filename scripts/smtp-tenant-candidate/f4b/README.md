# F4b — Ativação por empresa + via SMTP do tenant na outbox existente (CANDIDATO, fechado)

Base `600a94f1` (F4a promovida; remetente AR v2 verificado pelo titular). Nada aplicado/deployado pelo agente.
Gates nascem fechados: `tenant_smtp_dispatch_gate=false` (SQL), `TENANT_SMTP_F4B_REVIEWED=false` (Edge), `TENANT_SMTP_LANE_REVIEWED=false` (worker), `TENANT_SMTP_F4B_PHASE=false` (UI).

## Contrato permitido (único)
`solicitacao_atribuida_consultor_v1`
- Origem: `portal_solicitacoes`, primeira atribuição `consultor_atribuido` NULL→X, somente eventos FUTUROS (trigger novo; sem backfill).
- Tenant: `clientes.organization_id` da solicitação (servidor). Payload nunca informa tenant/destinatário.
- Destinatário: consultor atribuído, perfil ativo da MESMA empresa, papel `consultor_tecnico`/`tecnico_agronomo`, email Auth confirmado, não superadmin. Reprovado no enqueue e de novo no claim (antes de IO).
- Texto fixo no servidor; payload limitado a `numero` (charset saneado, 40), `tipo_demanda`, `urgencia`. Texto puro.
- Empresa inativa/pausada no momento do evento: nada é enfileirado (sem rajada posterior).

## Integração com a outbox existente
- Linha em `comunicacao_eventos` + `comunicacao_outbox` (sem tabela de fila nova). Inserção só passa pelo `notification_outbox_closed` via ticket da mesma transação (ramo diagnóstico F2/F3 mantido literalmente).
- Linha nasce `processing`, `lease NULL`, `attempts 0`, `max_attempts 1`: o claim global (`rpc_claim_communication_outbox`) nunca a vê. Publicador global segue suprimido; política RESTRICTIVE `notif3_global_client_containment` e `deliveryContractAvailable=false` intactos; WhatsApp/in_app/global não mudam. Backlog legado não tem linha de job → invisível.
- Ledger privado `platform_private.tenant_smtp_dispatch_jobs` (sem segredos) prova empresa/origem/destinatário.

## Execução (worker existente, rota `?lane=tenant_smtp`)
`tenant_smtp_lane_claim` (executor, service_role): reconcilia leases vencidos para terminal (`lease_expired` → `dead_letter`, nunca reenviado), cancela fila >24h, trava por empresa, revalida gates/ativação/versão/remetente verificado/destinatário, quota 20 envios/h por empresa (enqueue 50/h), lê senha do Vault só aqui, lease 45s, fence novo. Edge envia pelo transporte pinado 465/TLS homologado (prazo 15s). `finish` com CAS de fence: `sent` | `failed` (definitivo antes do DATA) | `ambiguous` → `dead_letter`. Não existe estado de retry. Erro de finish encerra a rodada.

## Ativação / pausa
`tenant_smtp_activation_set(version,true)`: Admin ativo da própria empresa, CAS versão, gates dispatch+F4+F2/F3, remetente verificado da versão, conexão OK da versão ≤10 min, nada pendente. Pausa sempre permitida e cancela a fila. Edição/rotação (trigger F4a) desativa, invalida verificação e cancela fila. Auditoria `tenant_smtp_activated/paused/lane_*` (ator de sistema zero na via).

## Arquivos
`20261016_smtp_f4b_tenant_dispatch.sql`, `preflight.sql`, `rollback.sql` (não destrutivo), `contract.ts`, `lane.ts`, `worker-index.ts.review` (substitui o index do worker após revisão), `test_sql.py`, `scan_local.py`. Espelho: `f2f3/deploy/supabase/functions/process-communication-outbox/` e `tenant-email-settings/f4b/`.

## Evidências locais
SQL PostgreSQL descartável (2x idempotente, `SET ROLE service_role`, fixtures sintéticas, sem rede): 61 PASS. Vitest F4b 21 + suíte comunicação 859/859. Typecheck `-p tsconfig.app.json` 0 erros. Lint focal 0. Scanner F4b 24/24, F4 20/20. `deno check` espelho: 0 erros novos (6 preexistentes no worker atual, iguais na base).

## Riscos / limites
- Ausência de senha/código em logs de infraestrutura (Edge Invocations, PostgREST, statements) NÃO comprovada; TLS em trânsito, Vault em repouso.
- Pausa durante lease não interrompe envio já em IO (termina honestamente; fila cancelada).
- Finish após lease vencido mas antes da reconciliação registra o resultado real; após reconciliação é terminal.
- Quotas são por hora e por empresa; não há quota diária. Teste de duas sessões concorrentes reais não executado (coberto por SKIP LOCKED + trava por empresa).
- Hosted: revisar triggers existentes em `comunicacao_eventos`/`portal_solicitacoes` e grants do `service_role` (preflight lista).
- Edge F4a em produção valida `dispatch_enabled` literal false: aplicar SQL F4b junto ao deploy do Edge com F4b revisado.
