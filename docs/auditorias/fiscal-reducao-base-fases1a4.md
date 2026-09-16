# Redução da base de cálculo por tributo — Relatório Fases 1 a 4

Projeto canônico: `swzpzcwiasxmjutrmvkm` (homologação; produção permanece bloqueada).
Nada publicado, nenhum GitHub sincronizado, Lovable Cloud não utilizado.

## Fase 1 — Modelo de redução (banco)

Migration: `restoration/fiscal-reducao-base/20261029000000_fiscal_base_reduction_v1.sql`
(incremental, idempotente, sem remoção de dados; aplicada via psql no projeto canônico).

- `fiscal_tax_rules.base_reduction_mode text NOT NULL DEFAULT 'NONE'`
  - backfill: regras com `base_reduction_pct > 0` → `FIXED`; demais → `NONE`.
  - `CHECK ftr_base_reduction_mode_domain` (NONE|FIXED|MANUAL).
  - `CHECK ftr_base_reduction_mode_coherent`: NONE ⇒ pct 0; FIXED ⇒ pct > 0; MANUAL ⇒ pct nulo.
- `fiscal_invoice_items.tax_input_snapshot jsonb NOT NULL DEFAULT '{}'`
  - `CHECK fii_tax_input_snapshot_chk` via `fn_fiscal_tax_input_valid(jsonb)` (IMMUTABLE,
    `search_path` fixo): aceita apenas tributos conhecidos e a única chave
    `baseReductionPct` numérica de 0 a 100. Qualquer resultado calculado
    (`vBC`, `vICMS`, `vPIS`, `vCOFINS`, `vIPI`, base, total) é rejeitado.
- Volumetria zero em ambas as tabelas: nenhum snapshot histórico afetado.

## Fase 2 — Motor canônico

- `fn_fiscal_apply_tax_v2` continua sendo a ÚNICA fórmula
  (`base_eff = round(base * (1 - pct/100))`, `valor = round(base_eff * rate/100)`).
  Passou a resolver o percentual por modo: NONE → 0; FIXED → `base_reduction_pct`
  (percentual manual é recusado); MANUAL → percentual da entrada, validado 0–100.
  Erros explícitos: `FISCAL_BASE_REDUCTION_INPUT_REQUIRED`, `_OUT_OF_RANGE`,
  `_NOT_EDITABLE`, `_NOT_ALLOWED`.
- `tax_snapshot` agora inclui `baseReductionMode`, `baseReductionSource`
  (FIXED/MANUAL/NONE), `baseReductionRulePct` e, no modo manual,
  `baseReductionAppliedBy` / `baseReductionAppliedAt`, além de tudo que já
  registrava (ruleId, ruleKey, ruleVersion, legalBasis, baseComponents,
  baseOriginal, base, rate, value).
- `rpc_fiscal_calculate_invoice_v1` injeta a entrada do operador apenas quando a
  regra publicada é MANUAL; `engineVersion` passou a `F3.4`.
- `rpc_fiscal_draft_save` valida e persiste `tax_input_snapshot` por item.
- Novo `rpc_fiscal_tax_preview_v1(uuid, jsonb)`: STABLE, SECURITY DEFINER,
  `search_path` fixo, exige `auth.uid()` e `fn_fiscal_can_operate()`, só roda em
  rascunho, bloqueia produção, **não escreve nada** e reutiliza o mesmo motor.
  `REVOKE` de PUBLIC/anon; `GRANT EXECUTE` apenas a `authenticated`.

## Fase 3 — Preparação da NF-e (UI)

- `src/components/fiscal/documentos/TributosPorItemSecao.tsx` (novo) na etapa
  existente "Tributos e Totais"; nenhuma rota nova.
  Por item e por tributo: base original, redução da base de cálculo (%), base
  tributável, alíquota nominal, valor, CST/CSOSN, origem/versão da regra e
  situação (fixa/informada/sem redução). FIXA exibe percentual bloqueado;
  MANUAL habilita o campo; NONE não oferece campo. Desktop em tabela compacta,
  mobile em cartões por tributo. Estados de carregando, erro e vazio; recálculo
  server-side com debounce ao mudar valores ou o percentual.
- `src/hooks/useFiscalTaxPreview.ts` (novo): chama o preview e traduz erros do
  motor para texto compreensível, sem SQL ou segredo.
- `src/lib/fiscal/rascunhoWizardValidation.ts`, `src/hooks/useFiscalRascunho.ts`
  e `RascunhoWizard.tsx`: item passa a carregar/salvar `tax_input_snapshot`.
- O frontend não calcula base nem valor de tributo em nenhum ponto.

## Fase 4 e 5 — XML e consistência de CST

`supabase/functions/_shared/fiscal/nfe/buildNfeXml.ts`:

- Dispatch do grupo ICMS por CRT + CST/CSOSN. Regime Normal: `ICMS00` (CST 00),
  `ICMS20` (CST 20, ordem orig, CST, modBC, pRedBC, vBC, pICMS, vICMS),
  `ICMS40` (CST 40/41/50). Simples Nacional: `ICMSSN101` e `ICMSSN102`
  (102/103/300/400). Demais CST/CSOSN bloqueiam a geração com erro explícito.
- A redução vai em `pRedBC` com a base já reduzida em `vBC`; a alíquota nominal
  é preservada (nunca há redução artificial de alíquota).
- Bloqueios de coerência: redução com CST ≠ 20, CST 20 sem redução, redução em
  Simples Nacional, redução de IPI sem grupo homologado.
- Grupo IPI por item (`IPITrib`/`IPINT`) quando o motor apura IPI; valor apurado
  sem CST bloqueia. IBS/CBS/IS não foram tocados.

## Testes executados

- SQL (`restoration/fiscal-reducao-base/test_base_reduction.sql`, roda em
  transação revertida): **31/31 PASS**, incluindo a fixture obrigatória
  base 10.000 / redução 60% / alíquota 18% → base 4.000 e tributo 720; 0%, 25%,
  60%, 100%, arredondamento, −1% e 100,01% bloqueados, FIXED/MANUAL/NONE,
  validador de entradas e constraints da regra.
- Vitest `src/test/fiscal/fase3_4.icms20.test.ts` (novo): **10/10 PASS** —
  ICMS20 com pRedBC, alíquota preservada, PIS/COFINS com base efetiva e sem
  pRedBC, regressão ICMS00 idêntico, bloqueios de CST e grupo IPI.
- Suíte `src/test/fiscal`: 1695 passaram, 6 falharam — todas **pré-existentes**
  e relativas à divergência conhecida de `types.ts`/migrations
  (`fase3_15.static`, `fase3_19_2.audit`, `faseF2.regulatorio`,
  `sinief49/staging/verifier`), sem relação com esta entrega.
- `tsgo --noEmit -p tsconfig.app.json`: sem erros. `vite build`: OK.

## Pendências e riscos

- Fases 6 a 9 não executadas nesta rodada: auditoria dedicada de alterações de
  redução (hoje coberta pelo trigger genérico `trg_fiscal_audit_fiscal_invoice_items`
  e pelo guard de estado), E2E Playwright do rascunho, validação XSD automatizada
  do XML gerado e o ciclo de homologação com NF-e sintética.
- Emissão continua desativada (`fiscalEmissionEnabled=false`, tpAmb=2).
- Divergência de `types.ts` mantém 6 testes fiscais falhando desde antes.
- Senha do banco (`ARbioProjetoOnFarm`) ainda precisa ser trocada pelo proprietário.

## Rollback

```sql
BEGIN;
ALTER TABLE public.fiscal_invoice_items DROP CONSTRAINT IF EXISTS fii_tax_input_snapshot_chk;
ALTER TABLE public.fiscal_tax_rules DROP CONSTRAINT IF EXISTS ftr_base_reduction_mode_coherent;
ALTER TABLE public.fiscal_tax_rules DROP CONSTRAINT IF EXISTS ftr_base_reduction_mode_domain;
DROP FUNCTION IF EXISTS public.rpc_fiscal_tax_preview_v1(uuid, jsonb);
-- Restaurar as versões anteriores de fn_fiscal_apply_tax_v2,
-- rpc_fiscal_calculate_invoice_v1 e rpc_fiscal_draft_save (cópias em
-- /tmp/fiscal_rpcs.sql e /tmp/apply_tax_v2.sql, geradas na Fase 0).
COMMIT;
```
As colunas `base_reduction_mode` e `tax_input_snapshot` podem permanecer: com
default `NONE`/`{}` o comportamento é idêntico ao anterior.
