# Subfase 1B — Relatório final (após hardening pós-auditoria)

**Ambiente:** staging `ikaauvsflpmamgxmkhoq` (ar-bio-temp). Produção `navfzbwgwzruipouyfnk` **não tocada**.
**Baseline:** commit `bf77a1beb06042a8afad86b9295c071f7af86f6a`.
**Custo real 1B (corrigido pela contabilidade da plataforma):** 12,1 créditos (execução inicial) + 9,0 créditos (correção pós-auditoria) = **21,1 créditos** (dentro do teto 22). Acumulado Etapa 1 até 1B: planejamento 2 + 1A 7,9 + 1B 21,1 = **31 créditos**; saldo antes da 1C = **69 créditos**.
**Flags:** `COMMUNICATION_DELIVERY_ENABLED=false`, `EMAIL_DELIVERY_ENABLED=false`, `WHATSAPP_DELIVERY_ENABLED=false`, `COMMUNICATION_INAPP_ADAPTER_ENABLED=false`, `WHATSAPP_WEBHOOK_ENABLED=false`. Test mode ON. **Zero envio.**

## 1. Correções de auditoria aplicadas (nova migration de hardening — sem editar migrations anteriores)

| # | Achado | Correção |
|---|--------|----------|
| A1 | Trigger final só emitia `solicitacao_atribuida` quando `status` mudava; primeira atribuição por `consultor_atribuido` (NULL→X) não gerava evento | Adicionado ramo `v_first_assign := (OLD.consultor IS NULL AND NEW.consultor IS NOT NULL AND v_ev IS DISTINCT FROM 'solicitacao_atribuida')`. Deduplicação preservada quando status+consultor mudam juntos. |
| A2 | Testes T12/T13/T14 do harness anterior tinham falso-positivo: o `RAISE EXCEPTION` de falha era capturado no mesmo `EXCEPTION WHEN P0001` que capturaria a rejeição real | Reescritos com flag `v_ok boolean`; `RAISE` de falha fica fora do bloco `BEGIN/EXCEPTION`, propaga direto ao sentinel. |
| A3 | Resolver v2 para `solicitacao_*` permitia `by_role` global para `gestor`/consultor/parceiro (risco cross-tenant) | Fail-closed: nesta 1B só `administrador` (papel corporativo global) resolve por `by_role`; demais retornam 0 até 1C definir vínculo tenant seguro. `source_participants` inalterado. |
| A4 | Publisher validava allowlist de chaves mas não coerência com a linha real | Validações adicionais para `solicitacao_*`: `source_id` deve existir em `portal_solicitacoes`; `payload.solicitacao_id` = `source_id`; `payload.cliente_id` = row.cliente_id; `payload.consultor_atribuido` = row.consultor_atribuido; casts UUID explícitos (fail-fast). Caminho `produto_pronto_retirada` preservado sem regressão. |
| A5 | Grants efetivos não haviam sido registrados após 1B | Adicionado `REVOKE ALL ... FROM PUBLIC, anon, authenticated` explícito nas três funções. Verificado via `has_function_privilege`. |
| A6 | T17 (fail-fast real) estava apenas comentado, sem teste | Implementado T17 usando subtransação PL/pgSQL: UPDATE seguido de `PERFORM` que dispara exceção do publisher; verifica que `descricao` volta ao valor `baseline-antes-t17`. |

## 2. Migrations aplicadas em staging (ordem cronológica)

1. Migration 1B inicial (aplicada anteriormente): habilita eventos `solicitacao_*` no publisher/resolver, cria trigger `_comunicacao_trg_portal_solicitacao`, instala `trg_comunicacao_solicitacao` e desanexa `trg_notify_solicitacao` (função `notify_solicitacao_atribuida` preservada para rollback).
2. Hotfix D1 (turno anterior): trigger passa a usar `SET search_path = public, extensions` e chamada `extensions.digest(...)`.
3. Hotfix D2 (turno anterior): payload do trigger alinhado ao contrato §10 (`status_novo`, `status_anterior`, `numero_solicitacao`, `origem_solicitacao`, `ocorrido_em`, `transicao`).
4. **Migration de hardening (este turno):** publisher com validação anti-spoof (A4), trigger com primeira atribuição (A1), resolver v2 fail-closed (A3), REVOKE explícito nas três funções (A5).

Nenhuma das migrations anteriores foi editada. Nenhuma tabela nova; nenhuma coluna nova; nenhum GRANT concedido a `PUBLIC`/`anon`/`authenticated`.

## 3. Grants efetivos (registrado pós-hardening)

Consulta: `has_function_privilege(role, oid, 'EXECUTE')`.

| Função | PUBLIC | anon | authenticated | service_role |
|--------|--------|------|---------------|--------------|
| `_comunicacao_publish_system_event(text,text,uuid,jsonb,text)` | false | false | false | true |
| `_comunicacao_resolve_recipients_v2(text, comunicacao_regras, text, uuid)` | false | false | false | true |
| `_comunicacao_trg_portal_solicitacao()` | false | false | false | true |

`service_role` mantém EXECUTE por herança do owner Supabase — necessário para o trigger executar em nome do sistema. Nenhum caminho autenticado do PostgREST/anon pode chamar essas funções diretamente. Todas com `SECURITY DEFINER` e `search_path` fixo.

## 4. Harness completo pós-hardening (22 asserts) — resultado

Todos os asserts abaixo passaram; a sentinela `HARNESS_1B_HARDENING_OK_ROLLBACK_SENTINEL` foi disparada na linha 205 (após o último assert), abortando toda a transação.

| ID | O que valida | Resultado |
|----|--------------|-----------|
| T01 | INSERT normal → 1 `solicitacao_criada` | PASS |
| T02 | INSERT já crítica → `solicitacao_criada` + `solicitacao_urgencia_critica` | PASS |
| T03a | Primeira atribuição SOMENTE por `consultor_atribuido` (sem mudança de status) → 1 `solicitacao_atribuida` | PASS |
| T03b | Joint: status→atribuida + consultor NULL→X mesmo comando → **1** `solicitacao_atribuida` (dedup) | PASS |
| T04–T08 | Transições `checkin_realizado`, `em_visita`, `aguardando_os`, `concluida`, `cancelada` | PASS |
| T09 | UPDATE só de `descricao` → nenhum evento novo | PASS |
| T10 | Replay 2× do mesmo UPDATE com `updated_at` fixo → nenhum evento novo (idempotência SHA-256) | PASS |
| T11 | UPDATE urgência não-crítica → crítica → `solicitacao_urgencia_critica` | PASS |
| T12 | Publisher rejeita `event_key` inválido (flag boolean, teste REAL) | PASS |
| T13 | Publisher rejeita `source_type` inválido para `solicitacao_*` | PASS |
| T14 | Publisher rejeita chave de payload fora da allowlist | PASS |
| T14b | Publisher rejeita `payload.solicitacao_id` divergente de `source_id` | PASS |
| T14c | Publisher rejeita `payload.cliente_id` cross-tenant | PASS |
| T14d | Publisher rejeita `source_id` inexistente em `portal_solicitacoes` | PASS |
| T15 | Resolver `source_participants` → produtor + consultor atribuído (2 rows) | PASS |
| T15tenant | Resolver de sol A não retorna consultor/cliente de sol B | PASS |
| T16 | Resolver `by_role='administrador'` = count global de admins ativos | PASS |
| T16fc-gestor | `by_role='gestor'` → 0 (fail-closed) | PASS |
| T16fc-consultor | `by_role='consultor_tecnico'` → 0 | PASS |
| T16fc-parceiro | `by_role='parceiro_b2b'` → 0 | PASS |
| T17 | Fail-fast subtransação: exceção do publisher reverte UPDATE prévio (`descricao` volta ao baseline) | PASS |
| T18 | `portal_notificacoes` inalterada (legado desanexado) | PASS |
| T19 | Preserva rejeição de `produto_pronto_retirada` com source errado (não regrediu) | PASS |

## 5. Zero-resíduo verificado após rollback (query independente)

```
clientes_res | sol_res | eventos_res | outbox | portal_notif
      0      |    0    |      0      |   0    |      0
```

Estado dos objetos observado após rollback:

- `trg_comunicacao_solicitacao`: **ativo** (`pg_trigger.tgenabled='O'`).
- `trg_notify_solicitacao`: **desanexado** (0 rows em `pg_trigger` com esse nome).
- `notify_solicitacao_atribuida()`: **preservada** (1 row em `pg_proc`) — rollback rápido para o legado ainda é possível.
- `supabase_realtime.portal_solicitacoes`: **0** (tabela não publicada em Realtime — inalterado).
- Flags de entrega: **inalteradas** (todas OFF).

## 6. Compatibilidade e rollback

Rollback do hardening pode ser feito recompilando as três funções com a versão anterior (todas foram `CREATE OR REPLACE`, sem mudança de assinatura). Rollback completo da 1B continua disponível via:

```sql
DROP TRIGGER IF EXISTS trg_comunicacao_solicitacao ON public.portal_solicitacoes;
CREATE TRIGGER trg_notify_solicitacao
  AFTER INSERT OR UPDATE ON public.portal_solicitacoes
  FOR EACH ROW EXECUTE FUNCTION public.notify_solicitacao_atribuida();
```

## 7. GO / NO-GO para 1C

**GO**. Todos os achados da auditoria foram tratados por nova migration; grants confirmados; testes negativos são reais; primeira atribuição e dedup joint validados; publisher blindado contra spoof cross-tenant; `by_role` fail-closed para tudo que não seja `administrador`; fail-fast subtransação comprovado; produto_pronto_retirada preservado; zero resíduo em staging; produção não tocada.

## 8. Artefatos

- `restoration/comunicacao-etapa1-1b/harness.sql` — harness completo (22 asserts, sentinela rollback, sem PII).
- `restoration/comunicacao-etapa1-1b/report.md` — este relatório.
- `.lovable/comunicacao-etapa1-solicitacoes-1b-report.md` — relatório consolidado para audit trail de decisão (referencia este arquivo).
- `.lovable/comunicacao-etapa1-solicitacoes-plano.md` — atualizado com o encerramento da 1B.
