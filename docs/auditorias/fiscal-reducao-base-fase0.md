# Fase 0 — Auditoria obrigatória: Redução da base de cálculo por tributo

Data: 2026-09-16 · Banco auditado: `swzpzcwiasxmjutrmvkm` (PostgreSQL 17.6, conexão direta)
Somente leitura. Nenhuma migration, função, RLS ou dado foi alterado.

## 1. `public.fiscal_tax_rules` (schema remoto real)

42 colunas. Relevantes: `tax_kind`, `calc_mode`, `crt`, `cst`, `csosn`, `rate`,
`base_reduction_pct numeric`, `deferral_pct`, `mva_pct`, `fcp_rate`, `fcp_st_rate`,
`internal_rate_pct`, `interstate_rate_pct`, `difal_dest_share_pct`, `st_modality`,
`credit_own_icms`, `base_components jsonb`, `legal_basis`, `legal_version`, `source_id`,
`justification`, `priority`, `valid_from/valid_until`, `status`, versionamento
(`rule_key`+`version` UNIQUE, `superseded_by`).

**Não existe** `base_reduction_mode`. A redução hoje é sempre implícita: se
`base_reduction_pct > 0`, aplica-se; caso contrário, 0.

Constraints confirmadas (19), destaque:
- `ftr_pct_ranges`: `base_reduction_pct` entre 0 e 100 (ou NULL).
- `ftr_calc_mode_domain`: PERCENT, EXEMPT/NOT_TAXED/SUSPENDED/DEFERRED_DOCUMENTED.
- `ftr_crt_cst_csosn_chk`: CRT 1/2 exige CSOSN; CRT 3/4 exige CST; mutuamente exclusivos.
- `ftr_rtc_not_publishable_chk`: IBS/CBS/IS não podem ser publicados.
- `ftr_published_requires_evidence`: publicação exige fonte oficial, base legal e alíquota.

## 2. `public.fiscal_invoice_items`

32 colunas, incluindo `fiscal_profile_snapshot jsonb` e `tax_snapshot jsonb`,
snapshots `ncm/cest/cfop/cst_icms/csosn/origem`, valores (`gross/discount/freight/
insurance/other/net`) e rateio de frete.

**Não existe** `tax_input_snapshot`. Hoje não há canal server-side para entradas
tributárias do operador — logo, redução MANUAL é tecnicamente impossível sem migration.

## 3. Motor canônico

- `fn_fiscal_item_base(jsonb, jsonb)` — base por componentes.
- `fn_fiscal_apply_tax_v2(fiscal_tax_rules, jsonb)` — IMMUTABLE, `search_path` fixo.
  Linha 23 da definição remota:
  `base_eff := fn_fiscal_round(base_raw * (1 - coalesce(r.base_reduction_pct,0)/100));`
  e `val := fn_fiscal_round(base_eff * r.rate / 100)`. Confere com a fórmula exigida.
  Retorna snapshot com `taxKind, calcMode, ruleId, ruleKey, ruleVersion, sourceId,
  legalBasis, legalVersion, cst, csosn, crt, rate, baseReductionPct, baseComponents,
  baseOriginal, base, value, params`.
  **Falta no snapshot**: origem do percentual (FIXED/MANUAL) e autoria/data quando manual.
  IBS/CBS/IS já falham fechado (`FISCAL_RTC_ENGINE_UNAVAILABLE`).

RPCs SECURITY DEFINER existentes: `rpc_fiscal_draft_save`, `rpc_fiscal_calculate_invoice_v1`,
`rpc_fiscal_xml_prepare_v1`. **Não existe RPC de preview** — o wizard não tem como
pedir recálculo server-side sem gravar.

## 4. XML (`supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts`, 372 linhas)

- ICMS: emite **sempre `ICMS00`** (linhas 191–200), apenas com `orig/CST/modBC/vBC/pICMS/vICMS`.
  Não há dispatch por CRT/CST, não há `ICMS20`, não há `pRedBC`. **Defeito confirmado.**
- PIS/COFINS: sempre `PISAliq`/`COFINSAliq`, com `vBC/pPIS/vPIS` — base vem do snapshot;
  não há `pRedBC` (correto, a tag não existe nesses grupos).
- IPI: existe `vIPI` apenas no total (`ICMSTot`, linha 301). **Não há grupo IPI por item** —
  qualquer regra de IPI hoje produziria XML incompleto.

## 5. RLS e dados

RLS habilitada em `fiscal_tax_rules`, `fiscal_invoice_items`, `fiscal_audit_log`.
Políticas: leitura interna e insert/update em `fiscal_tax_rules`; read/write em
`fiscal_invoice_items` — todas para `authenticated`, com predicados de perfil interno.

Volumetria: `fiscal_tax_rules` = **0 linhas**; `fiscal_invoice_items` = **0 linhas**.
Não há histórico a preservar — a migração de compatibilidade (regras com
`base_reduction_pct > 0` → FIXED) é trivial e sem risco de alterar resultados passados.

## 6. Lacunas que as próximas fases devem fechar

| # | Lacuna | Fase |
|---|--------|------|
| 1 | `base_reduction_mode` (NONE/FIXED/MANUAL) inexistente | 1 |
| 2 | `tax_input_snapshot` inexistente + validador de JSON restrito | 1 |
| 3 | Motor não distingue origem do percentual nem registra autoria manual | 2 |
| 4 | Sem RPC de preview server-side | 2 |
| 5 | Wizard "Tributos e Totais" sem visualização/entrada de redução | 3 |
| 6 | `buildNfeXml` sem dispatch e sem `ICMS20`/`pRedBC` | 4 |
| 7 | Sem grupo IPI por item | 4 |
| 8 | Sem bloqueio de preflight por incoerência CST × redução × grupo XML | 5 |
| 9 | Auditoria de alteração de redução não registrada | 6 |

## 7. Riscos

- Alterar `fn_fiscal_apply_tax_v2` exige `CREATE OR REPLACE` preservando a assinatura
  (usada por `rpc_fiscal_calculate_invoice_v1`); rollback = reaplicar a definição atual,
  já salva nesta auditoria.
- `ftr_crt_cst_csosn_chk` impede combinações CST/CSOSN inválidas — o dispatch XML deve
  respeitar essa mesma matriz.
- Emissão continua bloqueada (`fiscalEmissionEnabled: false`); nada aqui a altera.

## 8. Conclusão

Fase 0 concluída. Schema remoto compatível com o descrito no pedido, com três
divergências materiais: ausência de `base_reduction_mode`, ausência de
`tax_input_snapshot` e ausência de RPC de preview. Aguardando autorização para
iniciar a Fase 1 (migration incremental e reversível).
