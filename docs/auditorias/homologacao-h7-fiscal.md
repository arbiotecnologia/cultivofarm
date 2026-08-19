# FASE H7 — Auditoria, Correção e Homologação do Módulo Fiscal

**Ambiente**: staging `ikaauvsflpmamgxmkhoq` (exclusivo). Produção `navfzbwgwzruipouyfnk` **não foi acessada**.
**Escopo**: auditar antes de alterar, corrigir o necessário, retestar e **parar ao final de H7**.
**Emissão real**: permanece **DESLIGADA** (`tpAmb=1` bloqueado por gate server-side).

## 1. Inventário auditado (H7.0)

- 21 tabelas `fiscal_%`, 22 migrations fiscais dedicadas (`20260721…` → `20260824…`).
- RPCs centrais: `rpc_fiscal_calculate_invoice_v1`, `rpc_fiscal_reserve_nfe_number_v1`,
  `rpc_fiscal_xml_prepare_v1`, `rpc_fiscal_xml_record_v1`, `rpc_fiscal_draft_save`,
  `rpc_fiscal_event_manual`, `rpc_upsert_fiscal_invoice_manual`.
- Unicidade de numeração já protegida por `ux_fi_env_doc_model_series_number_company`
  e por índices em `fiscal_number_reservations`.
- Estado inicial da base fiscal: **0 documentos** (`fiscal_invoices`), portanto nenhuma
  correção exigiu backfill ou reescrita de dado histórico.

## 2. Achados e correções

| ID | Sev | Achado | Correção |
|----|-----|--------|----------|
| H7-001 | P1 | Gate de ambiente sem código de erro estável; RPCs manuais fora do gate | `fn_fiscal_environment_gate_v1` como **fonte única**, com códigos `FISCAL_ENV_NOT_READY` / `FISCAL_PRODUCTION_DISABLED`; o assert legado passou a delegar (tokens antigos preservados) |
| H7-002 | **P0** | `rpc_upsert_fiscal_invoice_manual` podia sobrescrever número, série, chave de acesso, total e status de documento **já autorizado/cancelado** | Guarda na RPC (`FISCAL_DOCUMENT_LOCKED`, `FISCAL_DOCUMENT_ENGINE_MANAGED`) + trigger `trg_h7_fiscal_invoice_immutable` com máquina de estados |
| H7-003 | P1 | `status='ISSUED'` normalizava para `DRAFT`, **reabrindo itens** de documento emitido | Mapeamento canônico `ISSUED → AUTHORIZED` |
| H7-004 | P1 | `rpc_fiscal_event_manual` sem idempotência: retry duplicava evento | `idempotency_key` + índice único + lock consultivo por documento + replay estável; assinatura legada de 3 argumentos removida |
| H7-005 | P2 | `fiscal_events` aceitava UPDATE/DELETE | Trigger append-only `FISCAL_EVENTS_APPEND_ONLY` |
| H7-006 | P2 | `anon` com EXECUTE em 7 helpers fiscais | REVOKE em bloco; grants restritos a `authenticated`/`service_role` |

Migration canônica: `supabase/migrations/20260919000000_h7_fiscal_hardening_v1.sql`
(cópia idêntica em `restoration/homologacao-h7/`).

## 3. Retestes

`restoration/homologacao-h7/60-h7-postcheck.sql` (transacional, com `ROLLBACK` final):

| Teste | Resultado |
|-------|-----------|
| T1 gate único presente | PASS |
| T2 assert legado fail-closed com código estável | PASS |
| T3 produção (`tpAmb=1`) bloqueada | PASS |
| T4 `ISSUED → AUTHORIZED` | PASS |
| T5 imutabilidade econômica em estado terminal | PASS |
| T6 regressão de estado bloqueada | PASS |
| T7 `AUTHORIZED → CANCELED` permitido | PASS |
| T8 eventos append-only | PASS |
| T9 idempotência de evento | PASS |
| T10 `anon` sem EXECUTE fiscal | PASS |
| T11 assinatura legada removida | PASS |

**11 PASS / 0 FAIL.**

Validações de repositório: Vitest **3111 PASS** (4 skipped), typecheck **0 erros**, build **SUCCESS**.

## 3.1 Harnesses complementares H7 (segurança, ambiente, concorrência)

Além do postcheck `60-h7-postcheck.sql`, foram criados três artefatos executáveis:

| Artefato | Escopo | Resultado |
| --- | --- | --- |
| `restoration/homologacao-h7/guard-staging.sh` | Guard duro: aborta se o DSN apontar para a produção (`navfzbwgwzruipouyfnk`), se o marcador de ambiente não for `ikaauvsflpmamgxmkhoq/STAGING/prod=0`, ou se o emitente ativo estiver com `tpAmb=1` | OK |
| `restoration/homologacao-h7/61-h7-seguranca-ambiente.sql` | 12 testes: RLS em todas as tabelas fiscais, `anon` sem EXECUTE, `search_path` fixo em SECURITY DEFINER, buckets privados, material de certificado fail-closed, marcador imutável e bloqueio duplo de produção, negação de `anon` em preflight/numeração/XML/documentos | **12 PASS / 0 FAIL** |
| `restoration/homologacao-h7/62-h7-concorrencia.sh` | Sessões paralelas reais: 2 tentativas simultâneas + 1 retry da mesma chave lógica geram **1 único** evento; reserva de numeração com `FOR UPDATE` + advisory lock + idempotência + gate; índice único de documento ativo por origem | **4/4 PASS** |

Os três scripts são transacionais/idempotentes e limpam a massa que criam
(`61` termina em `ROLLBACK`; `62` remove documento e eventos no `trap`).

## 4. Pendências registradas (não bloqueiam H7)

1. **`nfe_environment_code` do emitente ativo está ausente/inválido no staging** — o gate
   responde corretamente `FISCAL_ENV_NOT_READY`. Preencher `tpAmb='2'` antes de qualquer
   ensaio de homologação SEFAZ.
2. **Eventos de cancelamento/CC-e formais** ainda não implementados em RPC dedicada; o
   manual só aceita `MANUAL_UPDATED` / `RECONCILIATION_*`.
3. `src/integrations/supabase/types.ts`, `.env` e `client.ts` sofrem *drift* quando a plataforma regenera tipos
   fora do staging; restaurado a partir do baseline `c75bb87f` (21.850 linhas).

## 5. Veredito

**GATE H7 — APROVADA (staging).** Nenhuma promoção para produção executada ou autorizada.
