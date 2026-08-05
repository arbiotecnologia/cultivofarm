# FASE F1 — Hardening fiscal e quarentena de classificações sintéticas

**Ambiente:** staging Supabase `ikaauvsflpmamgxmkhoq` (marcador `public._fiscal_staging_marker` = `STAGING`).
**Produção `navfzbwgwzruipouyfnk`: NÃO ACESSADA.** Nada publicado.

## Artefatos

| Arquivo | Função |
|---|---|
| `migration.sql` | Migration idempotente aplicada (cópia canônica em `supabase/migrations/20260812000000_fase_f1_hardening_fiscal_quarentena.sql`) |
| `postcheck.sql` | Verificação fail-closed (T1–T15) — somente leitura |
| `rollback.sql` | Rollback lógico seguro (não restaura grants `anon`/`PUBLIC` por decisão de segurança) |

## Ordem de execução

```bash
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 --single-transaction -f restoration/fase-f1/migration.sql
psql "$STAGING_DSN" -v ON_ERROR_STOP=1 -f restoration/fase-f1/postcheck.sql   # espera POSTCHECK_FASE_F1_PASS
```

## Bloco A — Revogação de privilégios

Revogados **todos** os privilégios de `anon` e `PUBLIC` em 14 relações:

- Tabelas: `microrganismos`, `microorganism_fiscal_profiles`, `microorganism_targets`,
  `microorganism_technical_profiles`, `microorganism_crop_recommendations`,
  `fiscal_invoice_references`, `fiscal_invoice_item_references`, `fiscal_stock_loss_contexts`
- Views: `v_fiscal_company_readiness`, `v_fiscal_certificate_readiness`, `v_product_fiscal_readiness`,
  `v_service_fiscal_readiness`, `v_customer_fiscal_readiness`, `v_microorganism_fiscal_readiness`

`authenticated` recebeu apenas o mínimo necessário (DML onde há RLS efetiva; `SELECT` nas views).
`service_role` preservado. Nenhum privilégio estrutural (`TRUNCATE`/`REFERENCES`/`TRIGGER`) para `authenticated`.

## Bloco B — Quarentena (sem perda de dados)

3 classificações sintéticas de homologação passaram a `profile_status = 'BLOCKED'`, `is_active = false`,
com justificativa anexada em `accounting_notes`. **Nenhuma linha deletada; nenhum valor fiscal alterado.**

| Tabela | ID | Item |
|---|---|---|
| `microorganism_fiscal_profiles` | `5b3817dd-…fb56` | FUN-5 (CST 00 + CSOSN 102, incoerente com CRT 3) |
| `product_fiscal_profiles` | `e848af9d-…c284b8` | produto HML-B2B sintético |
| `product_fiscal_profiles` | `4120a677-…b879ba` | produto HML-B2B sintético |

## Bloco C — Gate de prontidão fail-closed

- `fn_fiscal_company_crt()` — CRT vigente do emitente.
- `fn_fiscal_item_profile_gate_eval(...)` — avaliador único, retorna JSON `{status, ready, quarantined, pendencies[]}`.
  Códigos: `PROFILE_MISSING`, `PROFILE_QUARANTINED`, `PROFILE_NOT_PUBLISHED`, `ACCOUNTING_NOT_VALIDATED`,
  `NCM_MISSING`/`NCM_INVALID`, `ORIGIN_MISSING`, `CFOP_*_MISSING`, `CST_OR_CSOSN_MISSING`,
  `CST_AND_CSOSN_CONFLICT`, `CSOSN_NOT_ALLOWED_FOR_CRT3`, `CST_NOT_ALLOWED_FOR_CRT1_2`,
  `PIS_CST_MISSING`, `COFINS_CST_MISSING`, `UNIT_MISSING`, `DESCRIPTION_MISSING`.
- `v_product_fiscal_readiness` e `v_microorganism_fiscal_readiness` reescritas sobre o avaliador
  (campo `minimally_classified` restaurado — corrige o mismatch de runtime do frontend).
- `rpc_fiscal_item_readiness(p_kind, p_id)` — wrapper `SECURITY DEFINER`, `authenticated`/`service_role` apenas.
- Trigger de auditoria `fiscal_audit_trigger` estendido a `microorganism_fiscal_profiles`.

## Evidências de validação

- `POSTCHECK_FASE_F1_PASS` — 15 gates (privilégios, policies, quarentena, preservação de dados,
  auditoria old/new, coerência CRT×CST/CSOSN, caminho feliz, integridade comercial e emitente).
- RBAC runtime: `anon` negado (tabelas, views e RPC); `authenticated` sem papel → 0 linhas e RPC negado;
  `administrador` e `financeiro` mantêm leitura e recebem `NOT_READY` nos itens quarentenados. **11/11 PASS.**
- Rollback validado em dry-run (`BEGIN … ROLLBACK`) e pós-check reexecutado com PASS.
- Regressão: Vitest **2723 PASS**, typecheck limpo, build PASS,
  `POSTCHECK_CARTEIRA_ANON_PASS` (harness 15/15), `POSTCHECK_RUNTIME_FINAL_PASS` (visita técnica).
- Ledger: **629/629** alinhado, head `20260812000000`, sem duplicatas.

## Estado fiscal resultante

Nenhum microrganismo ficou fiscalmente pronto (24 itens, 0 `fiscally_ready`) — o gate agora **falha fechado**
enquanto emitente, certificado e classificações reais não forem preenchidos. Nenhuma classificação foi inventada.
