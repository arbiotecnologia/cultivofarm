# F4b — Ativação por empresa + via SMTP do tenant na outbox existente (CANDIDATO, fechado; rev. pós-revisão 1cd70701)

Base `600a94f1` (F4a promovida; remetente AR v2 verificado pelo titular). Nada aplicado/deployado pelo agente.
Gates nascem fechados: `tenant_smtp_dispatch_gate=false` (SQL), `TENANT_SMTP_F4B_REVIEWED=false` (Edge), `TENANT_SMTP_LANE_REVIEWED=false` (worker), `TENANT_SMTP_F4B_PHASE=false` (UI).

## Correções da revisão 1cd70701
- P1 fonte revogada: `tenant_smtp_lane_source_reason` relê a solicitação atual (existe, mesmo `cliente_id`, consultor ainda atribuído, `status IN ('pendente','atribuida')`), cliente `status_cliente='ativo'` na mesma empresa e destinatário provado. Usada no enqueue, no claim (antes de IO) e no authorize. Fonte inválida → job/outbox `cancelled` + auditoria, sem destinatário/senha no retorno. Cobertos: desatribuição, reatribuição, cancelamento, exclusão, cliente inativo, troca de cliente, cliente movido de empresa.
- Autorização antes do envelope: `tenant_smtp_lane_authorize(outbox,fence)` é chamada após SMTP AUTH e antes de `MAIL FROM`; revalida fence, lease, versão, gates, ativação, fonte e destinatário; recusa fecha a sessão sem envelope (estado `withheld`, job cancelado). Só `authorized` aceita `sent`/`ambiguous`; `executing` só aceita `failed`. Lease vencido antes da autorização → `failed` (nenhuma mensagem possível); depois → `lease_expired`/`dead_letter`. Corrida residual: alterações confirmadas entre o authorize e o fim do DATA (mesma sessão, milissegundos) não são observadas; nunca há reenvio.
- Fairness: claim varre até 25 jobs, pula empresa ocupada/sem quota/sem credencial e segue para outra elegível; o worker não para por quota/ocupado.
- Quota de enqueue serializada por empresa (`pg_advisory_xact_lock` dedicado à via), 50/h exatos.
- `finish`: `NULL` recusado; replay do mesmo resultado idempotente; resultado diferente → conflito; após `lease_expired` retorna `lost=true`, é auditado e o worker não conta como enviado.
- Auditoria da via em `platform_private.tenant_smtp_lane_audit` (outbox, fonte, destinatário, ator causador, Admin que ativou), sem payload, endereço, assunto, corpo ou credencial; ator zero removido. Ativar/pausar continuam na auditoria pública com o ator real.
- Invocação: não existe agendamento do `process-communication-outbox` hoje (cron.job sem invocador; só um entre pg_cron/pg_net instalado). Opção fechada em `cron_option.sql.review` (pg_net + segredo Vault nomeado, criados por humano); não aplicada.
- UI: `dispatch_enabled` = prontidão SQL **e** execução real da via nos últimos 10 min (heartbeat gravado só pelo claim). Ativa sem processador → "ativado, mas o processador de envio ainda não está em execução".

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
`claim` → (TLS/AUTH pinado 465) → `authorize` → MAIL/RCPT/DATA → `finish`. Claim: reconcilia leases, cancela fila >24h, varre com fairness, revalida tudo, quota 20/h por empresa, lê a senha do Vault só aqui, lease 45s, fence novo. Sem estado de retry; erro de finish encerra a rodada.

## Ativação / pausa
`tenant_smtp_activation_set(version,true)`: Admin ativo da própria empresa, CAS versão, gates dispatch+F4+F2/F3, remetente verificado da versão, conexão OK da versão ≤10 min, nada pendente. Pausa sempre permitida e cancela a fila. Edição/rotação (trigger F4a) desativa, invalida verificação e cancela fila. Auditoria `tenant_smtp_activated/paused/lane_*` (ator de sistema zero na via).

## Arquivos
`20261016_smtp_f4b_tenant_dispatch.sql`, `preflight.sql`, `rollback.sql` (não destrutivo; também remove o agendamento opcional), `cron_option.sql.review`, `contract.ts`, `lane.ts`, `worker-index.ts.review` (substitui o index do worker após revisão), `test_sql.py`, `scan_local.py`. Espelho: `f2f3/deploy/supabase/functions/process-communication-outbox/` e `tenant-email-settings/f4b/`.

## Evidências locais (rev.)
SQL PostgreSQL descartável (2x idempotente, `SET ROLE service_role`, duas empresas sintéticas configuradas pelo fluxo real, sem rede): 91 PASS no total do harness, sendo 90 específicos F4b. Vitest F4b 29 (inclui fio SMTP simulado: recusa após AUTH sem MAIL/RCPT/DATA) + suíte comunicação 867/867. Typecheck `-p tsconfig.app.json` 0. Lint focal 0. Scanner F4b 33/33, F4 20/20. `deno check` espelho: 0 erros novos (6 preexistentes no worker atual).

## Riscos / limites
- Ausência de senha/código em logs de infraestrutura (Edge Invocations, PostgREST, statements) NÃO comprovada; TLS em trânsito, Vault em repouso.
- Pausa/edição entre claim e AUTH: barrada no authorize. Só a janela authorize→DATA permanece (documentada acima).
- Finish após lease vencido mas antes da reconciliação registra o resultado real; após reconciliação é terminal (`lost`).
- Reatribuição X→Y cancela o aviso para X; Y não recebe aviso neste contrato (só primeira atribuição).
- pg_net no invocador opcional mantém cabeçalhos (segredo) em fila interna transitoriamente.
- Quotas são por hora e por empresa; não há quota diária. Teste de duas sessões concorrentes reais não executado (coberto por SKIP LOCKED + trava por empresa).
- Hosted: revisar triggers existentes em `comunicacao_eventos`/`portal_solicitacoes` e grants do `service_role` (preflight lista).
- Edge F4a em produção valida `dispatch_enabled` literal false: aplicar SQL F4b junto ao deploy do Edge com F4b revisado.
