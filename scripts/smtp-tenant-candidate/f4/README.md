# F4 — Posse do remetente + ativação por tenant (CANDIDATO, fechado)

Base: `2d239edc` (F2/F3 homologado: TLS/pinning IPv4/IPv6, AUTH ok, um envio aceito, caixa confirmada pelo titular).
Nada aplicado/deployado pelo agente. Gates F4 nascem `false`; `dispatch_enabled` permanece literal `false`.

## Entregáveis
| Arquivo | Papel |
|---|---|
| `20261016_smtp_f4_sender_activation.sql` | Migration aditiva (idempotente, testada 2x). Tabelas privadas: gate F4, desafios, verificações, ativação. Trigger de invalidação. |
| `preflight.sql` / `rollback.sql` | Leitura prévia; rollback não destrutivo (fecha gate, pausa, invalida códigos, revoga EXECUTE, preserva histórico/Vault/settings). |
| `contract.ts`, `challenge-code.ts`, `sender-executor.ts`, `dispatch.ts`, `handler.ts` | Edge F4 dentro de `tenant-email-settings` (rota `POST ?op=sender`). Espelho em `f2f3/deploy/.../tenant-email-settings/f4/` via `sync_mirror.py`. |
| `test_sql.py` | PostgreSQL descartável reaproveitando o harness F2/F3 (54 checks, `SET ROLE service_role` real). |
| `scan_local.py` | 20 verificações estáticas. |
| `src/pages/configuracoes/TenantSenderVerification.tsx` | Painel simples no bloco "Email da empresa" (oculto: `TENANT_SMTP_F4_PHASE=false`). |

## Verificação de posse (F4a)
1. Admin ativo da própria empresa (mesmo guard F2/F3; superadmin/outros perfis negados) pede código → `claim` exige CAS da versão, gates F4 e F2/F3, 465/TLS, credencial, **conexão OK da mesma versão nos últimos 10 min**, nenhum job pendente, cooldown 60 s e máximo 5/24 h por tenant. Novo desafio invalida os abertos.
2. Executor (service_role, schema `tenant_smtp_executor`) gera código de 8 dígitos sem viés na memória da Edge, grava só `salt` + `sha256(salt:challenge_id:código)`; destino = `from_email` atual obtido no servidor. Transporte pinado já homologado; mesmo prazo de 15 s e regra de ambiguidade pós-DATA.
3. Confirmação na sessão do **mesmo Admin**: código só no corpo POST → argumento RPC; expira em 15 min; 5 tentativas persistidas (sem RAISE no erro, então o contador não é revertido); uso único; versão/remetente divergentes invalidam.
4. SMTP 250 ou recebimento pelo Admin **não** verificam o remetente: só o código entregue na caixa do remetente.

## Ativação (F4b) — revisão 2300653: operacional BLOQUEADA
Enquanto o contrato worker/outbox não existir, `activation_set(..., true)` retorna `SMTP_OPERATIONAL_NOT_READY`; contrato TS aceita só `active:false`; `tenant_smtp_dispatch_ready` = `false` constante; UI mostra "Remetente verificado; envio operacional ainda indisponível", sem badge Ativo nem botão de ativar. Pausa segura mantida.

Desenho futuro (não habilitado):
`tenant_smtp_activation_set(version, active)`: ativar revalida gates, verificação vigente (org+versão+from), conexão OK da versão e ausência de teste ambíguo/pendente. Pausar é sempre permitido. Auditoria `tenant_smtp_activated/paused`. Qualquer salvamento/rotação (bump de versão) invalida verificação, códigos e ativação via trigger.

## Correções 2300653
- Confirmação exige gates F4 e F2/F3 abertos e revalida o Admin após a trava (gate fechado não consome tentativa).
- Trigger de invalidação inclui `executing`; finish tardio não reabre desafio invalidado.
- Reconciliação conservadora: `claimed/executing` com mais de 2 min viram `invalidated` (hash/salt limpos, auditoria `sender_challenge_reconciled`), sem nova tentativa nem reenvio.
- Harness SQL sem `DISABLE TRIGGER`: pré-requisito de conexão via claim/prepare/finish F2/F3 reais; manipula apenas tempo.
- UI: geração por montagem/versão/bloqueio/conexão descarta respostas tardias (StrictMode/remount); handlers rechecam props vigentes; badge T1 oculto quando F4 habilitado.
- Verificação F4a confirma posse da caixa, NÃO valida domínio/DNS (SPF/DKIM/DMARC).

## Worker/outbox — dependência concreta (NÃO implementado nesta fase)
`process-communication-outbox` retorna `NOTIF3_GLOBAL_CONTRACT_UNAVAILABLE` antes de carregar segredos; mantido intacto. Para F5:
- Linhas elegíveis precisam de vínculo provado: `organization_id` (hoje inexistente na outbox), evento de origem homologado e destinatário individual validado (contrato de `supabase/AGENTS.md`).
- Claim dedicado no RPC existente filtrando `tenant_smtp_dispatch_ready(org)` (já criado, somente leitura) + allowlist de `event_key`; backlog legado (sem org) continua invisível.
- Credencial lida por job via executor (mesmo padrão prepare/finish), sem fallback global; ambíguo → `dead_letter` sem retry; quotas por tenant.
Bloqueio: requer coluna/ticket de origem na outbox e homologação do contrato de notificações — decisão de schema do titular/auditor.

## Riscos residuais
- Código e senha transitam em TLS e repousam (senha) no Vault; **ausência em logs de infraestrutura (Edge Invocations, PostgREST `p_code`/`p_password`, statement logs) não comprovada**. Mitigação do código: 8 dígitos, 15 min, 5 tentativas, uso único, vinculado a versão/remetente.
- Ambíguo mantém o código confirmável; reenvio só manual após cooldown.
- Corrida: mesma trava advisory por tenant do F2/F3; teste de duas sessões específico do F4 não executado (coberto por `SMTP_BUSY` sequencial).
