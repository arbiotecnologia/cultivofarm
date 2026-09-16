# Redução da base de cálculo — Fases 6 e 7

Data: 2026-09-16 · Banco: swzpzcwiasxmjutrmvkm (Cultivo Farm) · Nada publicado, sem GitHub, sem Lovable Cloud.

## Fase 6 — Auditoria e imutabilidade

Migration aplicada: `restoration/fiscal-reducao-base/20261030000000_fiscal_base_reduction_audit_v1.sql`
(incremental, idempotente, reversível; nenhum dado removido, nenhum snapshot histórico alterado).

- `fiscal_audit_log_action_check` ampliado (aditivo) com a ação `BASE_REDUCTION_CHANGE`.
- `fn_fiscal_tax_input_valid` passa a aceitar, opcionalmente, `baseReductionReason` (texto ≤ 240).
  Continua rejeitando qualquer chave de valor calculado (vBC, vICMS, etc.) e percentual fora de 0–100.
- Nova função `fn_fiscal_audit_base_reduction()` (SECURITY DEFINER, `search_path` fixo, EXECUTE revogado
  de PUBLIC/anon) + trigger `trg_fiscal_audit_base_reduction` AFTER INSERT OR UPDATE OF `tax_input_snapshot`
  em `fiscal_invoice_items`. Registra, por tributo alterado: usuário (`auth.uid()`), data/hora, documento,
  item, `taxKind`, percentual anterior e novo, motivo, `ruleId`, `ruleKey`, `ruleVersion`, `legalBasis`,
  `legalVersion` e `baseReductionMode`.
- Imutabilidade: `trg_fiscal_invoice_items_state_guard` já bloqueia qualquer alteração de itens (inclusive
  `tax_input_snapshot`/`tax_snapshot`) quando a nota não está em DRAFT/VALIDATING/READY/REJECTED/ERROR.
  Guard preservado, não alterado.

Frontend: campo opcional "Motivo da redução" no modo MANUAL (desktop e mobile) em
`src/components/fiscal/documentos/TributosPorItemSecao.tsx`; contrato em
`src/lib/fiscal/rascunhoWizardValidation.ts` aceita `baseReductionReason` (≤240) com `.strict()`.

### Evidências
`restoration/fiscal-reducao-base/test_base_reduction_audit.sql` (transação revertida): **14/14 PASS**
— motivo válido aceito, motivo >240 rejeitado, valor calculado rejeitado, motivo não textual rejeitado,
insert sem redução não gera trilha, alteração gera trilha com regra/fundamento legal, alteração de outro
campo não duplica trilha, segunda alteração grava valor anterior 60 → novo 33,33, documento emitido
bloqueia alteração.

## Fase 7 — Segurança (revisão somente leitura, sem alteração)

- `fiscal_invoice_items`: RLS ativa; leitura para administrador/gestor/financeiro; escrita apenas
  administrador/financeiro (USING e WITH CHECK). Produtor, cliente e parceiro B2B não têm acesso.
- `fiscal_tax_rules`: leitura interna via `fn_fiscal_can_read_internal()`; insert/update apenas com
  `fn_regulatory_can_prepare()` e `status = 'DRAFT'`.
- `fiscal_audit_log`: leitura apenas administrador; escrita negada a `authenticated` (somente triggers
  SECURITY DEFINER gravam).
- RPCs (`rpc_fiscal_tax_preview_v1`, `rpc_fiscal_draft_save`, `rpc_fiscal_calculate_invoice_v1`):
  EXECUTE apenas `postgres`, `service_role` e `authenticated`; sem PUBLIC/anon; `search_path` fixo;
  validação de `auth.uid()` e de perfil no corpo. Nenhuma role vinda do frontend é considerada.
- `service_role` não é exposto ao cliente; o preview é STABLE e não escreve.

## Validações desta rodada
- Testes SQL Fase 6: 14/14 PASS (transação revertida).
- Typecheck: sem erros.
- Vitest (`src/test/fiscal`): 1695 aprovados, 6 falhas **pré-existentes** em `sinief49/staging/verifier`
  e correlatos, causadas por divergência antiga de `types.ts` — sem relação com esta alteração.
- Build automático: OK.

## Rollback
```sql
DROP TRIGGER IF EXISTS trg_fiscal_audit_base_reduction ON public.fiscal_invoice_items;
DROP FUNCTION IF EXISTS public.fn_fiscal_audit_base_reduction();
-- restaurar fn_fiscal_tax_input_valid da migration 20261029000000
-- (opcional) restaurar o CHECK anterior de fiscal_audit_log sem 'BASE_REDUCTION_CHANGE'
```

## Pendências e riscos
- Fase 8 parcial: faltam E2E Playwright do rascunho (Admin/Financeiro/perfil sem permissão, desktop e
  mobile) e validação XSD automatizada do XML gerado.
- Fase 9 não executada: homologação com NF-e sintética ponta a ponta e cenário SEFAZ.
- Emissão continua desativada (`fiscalEmissionEnabled=false`, `tpAmb=2`).
- Recomendado trocar a senha do banco.
