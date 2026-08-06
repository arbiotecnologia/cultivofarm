# FASE F3.1 — CORREÇÃO FINAL APÓS AUDITORIA INDEPENDENTE (commit bba810c5)

Ambiente alvo: **staging `ikaauvsflpmamgxmkhoq`**.
Produção `navfzbwgwzruipouyfnk` **não foi acessada**. Nada publicado, nenhuma NF-e transmitida.
Nenhum dado, snapshot, reserva ou trilha de auditoria foi apagado.

## Artefatos (canônicos, sem drift)

| Artefato | Migration |
| --- | --- |
| `restoration/fase-f3-1-correcao-final/migration.sql` | `supabase/migrations/20260818000000_fase_f3_1_correcao_final.sql` |
| `restoration/fase-f3-1-correcao-final/postcheck.sql` | 52 gates estruturais |
| `restoration/fase-f3-1-correcao-final/runtime-harness.sql` | 35 casos autenticados, transação sempre revertida |
| `restoration/fase-f3-1-correcao-final/rollback.sql` | reversão controlada, não destrutiva |

SHA-256 (idêntico nos dois caminhos): `9159196fd5caf4d23743805f47a7d8258e257a98933921cb5e0a08081e70f0ac`.

Migration única, incremental, idempotente e posterior a `20260817030000`.
Nenhuma migration já aplicada foi editada.

## Correções por bloqueio da auditoria

### 1. Devedor / destinatário
- `fn_fiscal_partner_fiscal_customer(partner_id)` resolve o cliente fiscal canônico do parceiro
  via `partner_accounts.client_id` (coluna real, confirmada no schema).
- `fn_fiscal_assert_debtor_recipient(invoice_id)` exige, para `PARTNER_ORDER` e `ENTREGA`,
  igualdade entre `fiscal_invoices.customer_id` e o cliente fiscal do parceiro devedor
  devolvido por `fn_fiscal_invoice_eligibility.debtorPartnerId`.
- Ausência, duplicidade (duas contas ativas com o mesmo `client_id`) ou divergência
  levantam **`FISCAL_DEBTOR_RECIPIENT_MISMATCH`**, antes de qualquer efeito colateral.
- Divergência de `debtor_partner_id` / `debtor_customer_id` gravados no documento também bloqueia.
- O produtor final vinculado ao pedido B2B **nunca** é aceito como devedor.
- O gate roda tanto em `rpc_fiscal_calculate_invoice_v1` quanto em `rpc_fiscal_reserve_nfe_number_v1`.

### 2. Contexto tributário encadeado
- `rpc_fiscal_calculate_invoice_v1` (engine `F3.3`) recompõe o contexto a cada etapa:
  `icmsOwnValue`, `ipi`, `icmsSt` e `baseST` passam a refletir o que já foi apurado.
  Uma regra com `base_components = ['PRODUTO','ICMS_ST']` agora recebe a base correta.
- FCP próprio (`v_fcp_own`), FCP-ST (`v_fcp_st`) e FCP da UF destino no DIFAL (`v_fcp_dest`)
  são acumulados em variáveis distintas — sem perda e sem dupla contagem.
- Totais expõem `vFCP` e `vFCPST` sempre; `vICMSUFDest`, `vICMSUFRemet` e `vFCPUFDest`
  apenas quando há DIFAL, com semântica compatível com NF-e.
- Cada item grava `chainedContext`, `taxOrder`, `itemTotals` e `contextIn` por tributo.
- `vNF = vProd − vDesc + vFrete + vSeg + vOutro + vST + vFCPST + vIPI`.

### 3. Cobertura real
- `fn_fiscal_scenario_coverage` deixou de apenas resolver a regra: para cada cenário ela
  executa `fn_fiscal_apply_tax_v2` com **contexto sintético neutro encadeado**
  (`fn_fiscal_rule_validate_synthetic`), sem persistência (`STABLE`).
- Gaps distinguem `NOT_FOUND`, `AMBIGUOUS`, `INCOMPLETE` e `ENGINE_UNAVAILABLE`.
- Cenários derivam apenas de dados reais: destinatários com `nfe_readiness_status='READY'`,
  canais efetivamente presentes em documentos NF-e (mais `B2B_PARTNER`) e NCM de perfis
  de microrganismos **ativos**, `is_active`, `profile_status='VALIDATED'`, com validação
  contábil e dossiê `status='VALIDATED'` vigente com `published_ncm`. Nenhum cenário com NCM nulo.
- Inventário segregado: `active`, `ready`, `draft`, `blocked`, `inactive`.
  **Inativos não bloqueiam a prontidão**; apenas ativos em rascunho ou bloqueados geram `BLOCK`.

### 4. Homologação / produção
- `tg_fiscal_emitter_refresh_readiness` não produz mais `READY_PRODUCTION`: o estado
  **persistido** máximo é `READY_HOMOLOGATION`.
- Ambiente `tpAmb=1` gera pendência `EMITTER_PRODUCTION_BLOCKED_F3` (BLOCK) e derruba o emitente
  para `NOT_READY`.
- `trg_fiscal_homologation_evidence_guard` recusa UPDATE direto em `sefaz_homologation_at`
  e `sefaz_homologation_evidence` (`FISCAL_HOMOLOGATION_EVIDENCE_IMMUTABLE`); a transição só
  poderá ocorrer por RPC controlada de fase posterior (contexto `fiscal.homologation_ctx`).
- O gate de ambiente é reavaliado **no cálculo** e **na reserva** (`FISCAL_PRODUCTION_BLOCKED`),
  não apenas no painel.
- O painel declara `maxAllowedStatus = READY_HOMOLOGATION` e rebaixa qualquer resíduo.

### 5. RLS / policies
- Policies SELECT redundantes removidas explicitamente (`fcr_select`, `fds_select`,
  `fnr_select`, `ftr_select`, `frso_select`, `fop_admin_read`) — elas se somavam por `OR`
  e liberavam técnico/parceiro/produtor.
- Resta **uma** policy SELECT por relação fiscal F3, sempre `fn_fiscal_can_read_internal()`.
- `REVOKE ALL ... FROM PUBLIC, anon` reaplicado nas seis relações. Nenhuma policy de
  escrita foi afrouxada e nenhum corpo de RPC não relacionado foi alterado.

### 6. Promoção segura
- Preflight fail-closed no topo da migration: se existir `fiscal_number_reservations`
  com `fiscal_invoice_id IS NULL`, a migration aborta com contagem e IDs **mascarados**
  (`FISCAL_PREFLIGHT_RESERVATION_ORPHAN`). Nada é deletado e nenhum vínculo é inventado.
- Saneamento documentado: cada reserva órfã exige vínculo auditável por registro humano
  (ou evento fiscal de inutilização) antes da promoção.
- Segundo preflight rejeita regras publicadas com `base_components` fora do domínio.
- `rollback.sql` não remove reservas, snapshots, documentos nem trilha.

### 7. Fontes oficiais
As seis URLs específicas exigidas foram gravadas (MOC, Schemas/NT, Serviços por UF, NCM,
TIPI em PDF, Guia EFD ICMS/IPI 3.2.2). Guarda final rejeita qualquer URL genérica.
Nenhum código ou alíquota foi semeado.

## UI / tipos
- `src/hooks/useFiscalNfeReadiness.ts`: tipos `NfeCoverage`, `CoverageGapCode`,
  `MicroorganismReadinessCounts`, `maxAllowedStatus` e `overallStatus` com teto
  `READY_HOMOLOGATION`.
- `src/components/fiscal/ProntidaoNfeSecao.tsx`: métricas de cobertura real, inventário
  segregado de microrganismos, teto da fase e lista de lacunas com código acionável.

## Verificação executada nesta sessão

| Verificação | Resultado |
| --- | --- |
| `tsgo --noEmit` (typecheck) | **PASS** (0 erros) |
| Vitest | **2744 PASS**, 4 skipped, 167 arquivos |
| `vite build` | **PASS** |
| Paridade `restoration/` × `supabase/migrations/` | SHA-256 idêntico |
| Ledger local | 639 arquivos em `supabase/migrations/` |
| Produção `navfzbwgwzruipouyfnk` | **não acessada** |
| `postcheck.sql` no staging | **NÃO EXECUTADO** — sem credencial de banco nesta sessão |
| `runtime-harness.sql` no staging | **NÃO EXECUTADO** — sem credencial de banco nesta sessão |
| Aplicação de `20260818000000` no staging | **NÃO APLICADA** |
| Contagem de 24 microrganismos ativos | **não reconfirmada** (depende de consulta ao staging) |

Lint não está disponível no projeto (política registrada); typecheck, testes e build cobrem o gate estático.

## Status

**BLOQUEADO** — não há evidência runtime.

Motivo exato: o ambiente desta sessão não expõe `PGHOST` nem qualquer credencial/DSN do
staging, e não há ferramenta de migration disponível. A migration, o postcheck (52 gates),
o runtime harness (35 casos) e o rollback estão prontos e canônicos, mas **não foram
aplicados nem executados** contra `ikaauvsflpmamgxmkhoq`. Conforme o critério definido,
o status só pode ser `APTO PARA F4` com 52/52 postcheck e 35/35 harness PASS no staging.

Para desbloquear, execute no staging (nesta ordem, fail-fast):

```sh
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260818000000_fase_f3_1_correcao_final.sql
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/fase-f3-1-correcao-final/postcheck.sql
psql "$STAGING_DSN" --single-transaction -v ON_ERROR_STOP=1 \
  -f restoration/fase-f3-1-correcao-final/runtime-harness.sql
```

O DSN nunca deve ser ecoado, registrado ou versionado.
