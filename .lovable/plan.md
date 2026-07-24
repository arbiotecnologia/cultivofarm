
# Revisão pt-BR do módulo fiscal + unificação microrganismos/produtos

Trabalho em fases numeradas conforme regra do projeto. Aguardarei aprovação antes de iniciar cada fase.

## Escopo confirmado

Páginas/componentes fiscais no repositório:

- `src/pages/configuracoes/FiscalEmpresa.tsx`, `FiscalProdutos.tsx`, `FiscalServicos.tsx`, `FiscalClientes.tsx`
- `src/pages/fiscal/FiscalDocumentos.tsx`, `FiscalProntidao.tsx`, `FiscalReconciliacao.tsx`
- `src/components/fiscal/**` (Cnpj, IbsCbs, Rtc, certificados/, documentos/, homologacao/)
- `src/components/financeiro/FiscalReadinessBanner.tsx`, `FiscalTab.tsx`
- Helpers: `src/lib/fiscal/*` (fiscalOptions, documentLabels, connectionsReadiness, readinessValidation, etc.)
- Hooks: `src/hooks/useFiscal*`, `useProductFiscalProfiles`, `useServiceFiscalProfiles`, `useCustomerFiscalProfiles`

Fora do escopo (não alterar): migrations aplicadas, enums do banco, RPCs, RLS, valores técnicos persistidos, deploys.

## Fase A — Auditoria somente-leitura (sem edições)

1. Varredura completa por strings visíveis em inglês nas páginas/componentes fiscais (grep dirigido em JSX text, `<title>`, `label`, `placeholder`, `description`, `toast`, `Alert*`).
2. Inventário dos enums renderizados: `profile_status`, `document_origin`, `document_model`, `normalized_status`, `fiscal_environment`, `fiscal_provider`, `configuration_status`, `reconciliation_status`, `taxpayer_indicator`, `invoice_type`, `item_kind`, IBS/CBS e RTC.
3. Levantamento no schema (`src/integrations/supabase/types.ts`) da relação `microrganismos` ↔ `produtos`: existe FK `product_id`? Views compartilhadas? Uso em `product_fiscal_profiles`?
4. Entrega: relatório em `docs/fiscal-pt-br-auditoria.md` com listagem de strings, arquivos, valores técnicos preservados e proposta de modelagem microrganismo↔produto (com ou sem migration aditiva).

## Fase B — Centralização de rótulos pt-BR (código, sem migration)

1. Consolidar todos os mapas em `src/lib/fiscal/labels/` (novo diretório):
   - `statuses.ts` (profile, document, normalized, reconciliation, configuration)
   - `environment.ts`, `providers.ts`, `origins.ts`, `models.ts`, `indicators.ts`, `ibsCbs.ts`
   - Cada helper: `label{X}(value)` retorna pt-BR; valor desconhecido → `"Não mapeado (VALOR)"`; nunca perde o value técnico.
2. Refatorar `documentLabels.ts` e `fiscalOptions.ts` para reexportar dos novos helpers (compatibilidade).
3. Substituir strings inline nas páginas/componentes listados usando exclusivamente esses helpers; `SelectItem` mantém `value` original.
4. Cobertura de testes:
   - `src/test/fiscal/labels_pt_br.test.ts` — cobre todos os valores canônicos + fallback legado (`labelX("LEGACY_FOO") === "Não mapeado (LEGACY_FOO)"`).
   - Testes de Select confirmando submit do value técnico.

## Fase C — Microrganismos na página "Perfis Fiscais de Produtos"

Estratégia depende do resultado da Fase A. Duas hipóteses:

**C.1 — Se `microrganismos` já tem `product_id` (FK para `produtos`)**
- Estender `useProductFiscalList` para incluir join opcional e coluna derivada `entity_kind: "produto" | "microrganismo"`.
- Sem migration. Sem duplicar `product_fiscal_profiles` — reusa o `product_id` canônico.

**C.2 — Se NÃO houver `product_id`**
- Não fabricar join por nome. Duas opções, a decidir com você:
  - (a) UI de associação explícita microrganismo→produto (sem migration).
  - (b) Migration aditiva mínima: `ALTER TABLE microrganismos ADD COLUMN product_id uuid REFERENCES produtos(id)` + índice, sem backfill automático, sem alterar RLS. Só aplico com autorização explícita.
- Nenhuma exclusão. Os 24 microrganismos existentes são preservados.

Alterações UI (`src/pages/configuracoes/FiscalProdutos.tsx` + hook):
- Filtro "Tipo": Todos / Produtos / Microrganismos.
- Badge visual "Produto" / "Microrganismo" na lista.
- Busca por nome e código/referência de ambos.
- Drawer reaproveita `useSaveProductFiscalProfile` (mesmo contrato); microrganismo salva contra o `product_id` canônico associado.
- Prontidão, paginação, permissões, concorrência otimista e IBS/CBS inalterados.

Testes:
- Lista unificada: renderiza produtos e microrganismos, filtros e busca funcionam.
- Drawer de microrganismo salva no mesmo contrato sem duplicar perfil.
- Estados loading/erro/vazio e RLS (`permission_denied`).

## Fase D — Validação

- `bun run typecheck`, `bun run build`
- `bunx vitest run src/test/fiscal src/test/*fiscal*`
- Vitest completo
- Varredura final `rg` por termos em inglês remanescentes no módulo fiscal; documento com exceções justificadas (NCM/CEST/CFOP/CST/CSOSN/IBS/CBS/GTIN/CNAE/CRT/NF-e etc.).
- Relatório final: arquivos alterados, migration (se houver), inventário de traduções, evidências dos testes, strings restantes justificadas, riscos residuais, confirmação de nenhuma exclusão e nenhuma emissão fiscal habilitada.

## Detalhes técnicos

- Helpers puros, sem side effects, tipados sem `any`.
- Nenhum `SelectItem.value` alterado — apenas `children` recebem label.
- Fallback padrão: `"Não mapeado (X)"` para preservar rastreabilidade sem quebrar o Select.
- `FiscalReadinessBanner.tsx`: substituir `strong>{configuration_status}` etc. por helpers pt-BR.
- Nenhum arquivo em `supabase/migrations/` é modificado. Se Fase C.2(b) for aprovada, migration nova em arquivo novo.

## Confirmação de segurança

Nada é excluído. RLS, permissões, provedores, tokens, certificados e regras tributárias não são tocados. Nenhum dado de teste no Supabase. Sem publish.

---

**Aguardo aprovação para iniciar a Fase A (auditoria somente-leitura).**
