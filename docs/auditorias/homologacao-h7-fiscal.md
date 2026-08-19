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

## 3.2 FASE H7b — correção focada pós-auditoria independente

A auditoria independente do H7 apontou que o H7-004 continuava **P1**: a RPC
`rpc_fiscal_event_manual` aceitava `p_idempotency_key` NULL e, sem chave, cada
retry inseria novo evento; o runner `62` provava a tabela, não a RPC.

| ID | Sev | Achado | Correção |
|----|-----|--------|----------|
| H7B-001 | **P1** | RPC de evento sem chave obrigatória; retry duplicava | Chave obrigatória (`FISCAL_IDEMPOTENCY_REQUIRED`), `payload_fingerprint` na própria `fiscal_events`, replay estável e `FISCAL_IDEMPOTENCY_CONFLICT` para mesma chave com payload diferente; advisory lock por documento mantido |
| H7B-002 | P1 | Emitente ativo do staging com `nfe_environment_code` NULL | `tpAmb='2'` (homologação) aplicado sob guard do marcador (`ikaauvsflpmamgxmkhoq`/`STAGING`/`production_emission_allowed=false`) e fail-closed se houver 0 ou >1 emitente ativo |
| H7B-005 | **P1** | `rpc_upsert_fiscal_invoice_manual` podia registrar `ISSUED` sem evidência externa e sem marcar origem | Classificada como **registro manual de documento externo**: força `document_origin='MANUAL_RECORD'` e `provider='NONE'`, exige chave de acesso de 44 dígitos + número para estado emitido (`FISCAL_MANUAL_EVIDENCE_REQUIRED`), recusa documento terminal (`FISCAL_DOCUMENT_LOCKED`) e documento do motor (`FISCAL_DOCUMENT_ENGINE_MANAGED`) |
| H7B-006 | **P1** | `rpc_fiscal_xml_record_v1` gravava resultado de XML sem gate de ambiente | Gate injetado como primeira instrução, preservando a lógica; grants restritos |
| H7B-007 | P2 | `fiscal_environment_marker` com GRANT de escrita a `anon`/`authenticated` (bloqueado só por RLS) | `REVOKE` total; apenas `SELECT` para `authenticated` e `ALL` para `service_role` |
| H7B-004 | P3 | 2 `fiscal_invoices` DRAFT órfãs (total 0, sem origem, item, número, chave, evento, reserva ou XML) | Removidas por script escopado; **antes 2 → depois 0**, zero resíduos |
| H6-P2 | P2 | `EXECUTE` herdado por PUBLIC/anon nas trigger functions H6c | `REVOKE` explícito, sem mudança de lógica (registrado no relatório H6) |

Migrations: `20260920000000_h7b_fiscal_idempotencia_ambiente_v1.sql` e
`20260920010000_h7b_gate_xml_record_e_marcador_v1.sql`
(cópias idênticas em `restoration/homologacao-h7b/`).

### Classificação da RPC manual

`rpc_upsert_fiscal_invoice_manual` **não pertence ao motor SEFAZ**: não reserva
número, não gera XML e não transmite. É registro de documento emitido fora do
sistema. Por isso não passa pelo gate de transmissão — mas, após H7b, também
não consegue mais se passar por autorização interna: só assume estado emitido
com chave de acesso de 44 dígitos e número do documento externo, sempre marcada
como `MANUAL_RECORD`/`provider=NONE`, e nunca sobre documento do motor.

### Teste real de concorrência da RPC (`63-h7b-idempotencia-rpc.sh`)

Todas as evidências vêm de chamadas à RPC sob `role authenticated` +
`request.jwt.claims`, com duas sessões paralelas — nenhum INSERT direto:

| Caso | Resultado |
|------|-----------|
| A — sem chave | PASS (`FISCAL_IDEMPOTENCY_REQUIRED`, 0 eventos) |
| B — 2 sessões simultâneas, mesma chave/payload | PASS (mesmo `event_id`, 1 evento) |
| C — retry sequencial idêntico | PASS (mesmo `event_id`, 1 evento) |
| D — mesma chave, payload diferente | PASS (`FISCAL_IDEMPOTENCY_CONFLICT`, 1 evento) |
| E — chave distinta | PASS (evento distinto, 2 eventos) |

**5/5 PASS.** O runner limpa a massa criada mesmo em falha/interrupção
(`trap ... EXIT INT TERM` + varredura de segurança pelo marcador do harness).

### Postcheck consolidado H7b (`65-h7b-postcheck.sql`)

22 testes: idempotência obrigatória e conflito, fingerprint, advisory lock,
unique de evento, emitente único com `tpAmb=2`, gate aprovando homologação,
`tpAmb=1` bloqueado em simulação transacional, marcador sem escrita para
`authenticated`, `anon` sem EXECUTE fiscal, H6c com menor privilégio, RLS em
todas as tabelas fiscais, `search_path` fixo em SECURITY DEFINER, evidência
obrigatória no registro manual, origem canônica, respeito a lock/motor,
append-only, imutabilidade, numeração protegida, XML prepare/record sob gate,
preflight, e ausência de resíduos: **22 PASS / 0 FAIL**.

Reexecutados sem regressão: `60-h7-postcheck.sql` **11/11**,
`61-h7-seguranca-ambiente.sql` **12/12**, `62-h7-concorrencia.sh` **4/4**.

### Frontend

`src/lib/fiscal/eventIdempotency.ts` deriva a chave de forma determinística
(`FISCEV:{tipo}:{invoice}:{hash}`), de modo que duplo clique/retry da mesma
tentativa lógica reutiliza o evento. Callers atualizados:
`useFiscalDocuments.useRegisterManualEvent` e
`useFiscalReconciliation` (desvínculo). Cobertura em
`src/test/fiscal/h7b.idempotencia.test.ts`.

## 4. Pendências registradas (não bloqueiam o hardening H7)

1. ~~`nfe_environment_code` ausente no emitente ativo~~ — **resolvido em H7b**:
   staging configurado explicitamente com `tpAmb='2'` (homologação), sob guard do marcador.
2. **Eventos de cancelamento/CC-e formais** ainda não implementados em RPC dedicada; o
   manual só aceita `MANUAL_UPDATED` / `RECONCILIATION_*`.
3. `src/integrations/supabase/types.ts`, `.env` e `client.ts` sofrem *drift* quando a plataforma regenera tipos
   fora do staging; restaurado a partir do baseline `c75bb87f` (21.850 linhas).

### Pendências EXTERNAS (pré-requisito real, não corrigível por código)

- **`fiscal_certificates` está vazio**: não há certificado A1 carregado no staging.
- Sem certificado não há assinatura, logo **não houve transmissão nem protocolo
  real da SEFAZ em homologação**. Nada de NF-e autorizada foi declarado.
- Credenciais SEFAZ/CSC/token não foram criados nem inventados.

## 5. Veredito

Separando explicitamente os dois escopos:

| Escopo | Situação |
|--------|----------|
| **H7 hardening / preflight interno** | **APROVADO** — zero P0/P1 em aberto após H7b (6 achados H7 + 7 achados H7b corrigidos e reprovados por teste) |
| **H7 smoke externo SEFAZ (homologação)** | **NÃO EXECUTADO** — bloqueado por pré-requisito externo: certificado A1 ausente e integração SEFAZ não configurada |

**GATE H7 — APROVADA COM RESSALVAS / PRONTA PARA SMOKE EXTERNO.**

Nenhuma NF-e foi homologada ou autorizada pela SEFAZ. Emissão produtiva
permanece DESLIGADA e bloqueada em duas camadas (marcador de ambiente
server-side + gate `tpAmb`). Nenhuma promoção para produção foi executada ou
autorizada; a produção permanece intocada. **H8 não iniciada.**

### Validações finais H7b

- Postcheck H7b **22/22**, concorrência real da RPC **5/5**, H7 `60` **11/11**,
  `61` **12/12**, `62` **4/4**.
- Typecheck: **0 erros**. Vitest: **3120 passed / 4 skipped**. Build: **SUCCESS**.
- Binding conferido e mantido no staging `ikaauvsflpmamgxmkhoq` (drift de
  `types.ts`/`.env`/`client.ts` restaurado a partir da baseline `c75bb87f`).

## 6. Reverificação H7 (2026-08-19)

Reexecução somente-leitura do gate H7 a pedido, sem novas migrations e sem
tocar a produção `navfzbwgwzruipouyfnk`.

- Binding: `src/integrations/supabase/client.ts` permanece fixado no staging
  `ikaauvsflpmamgxmkhoq`.
- **Drift detectado e corrigido**: `.env` e `src/integrations/supabase/types.ts`
  haviam sido regenerados fora do staging (types reduzido a 2.052 linhas,
  `VITE_SUPABASE_URL` apontando para outro ref), derrubando 14 testes
  contratuais (binding, SINIEF 49, Fase 3.15/3.19, schema on-farm).
  Restaurados a partir da baseline `c75bb87f` (21.850 linhas).
- Após restauração: typecheck **0 erros**; Vitest **3120 passed / 4 skipped**.
- Migrations H7/H7b inalteradas: `20260919000000`, `20260919010000`,
  `20260920000000`, `20260920010000`.
- Veredito mantido: **GATE H7 — APROVADA COM RESSALVAS / PRONTA PARA SMOKE
  EXTERNO**. Emissão de produção continua desligada nas duas camadas
  (marcador de ambiente + gate `tpAmb`). **H8 não iniciada.**
