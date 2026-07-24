# Perfil fiscal autônomo de microrganismos

Faturamento fiscal direto de microrganismos, sem exigir produto canônico. O vínculo `microrganismos.product_id` permanece opcional (composição/comercial), nunca requisito fiscal. Emissão continua desativada.

## 1. Modelo de dados (migration canônica + stub)

**Arquivo executável**: `supabase/migrations/20260806000000_fiscal_microorganism_profiles.sql`
**Stub documental**: `restoration/migrations/20260806000000_fiscal_microorganism_profiles.sql` (sem SQL executável, apontando para o canônico).

Tabela `public.microorganism_fiscal_profiles`, espelhando `product_fiscal_profiles` apenas nos campos realmente usados:

- `id uuid PK default gen_random_uuid()`
- `microorganism_id uuid NOT NULL REFERENCES public.microrganismos(id) ON DELETE RESTRICT`
- `is_active boolean NOT NULL default true`
- `fiscal_description text`
- `commercial_unit text`, `taxable_unit text`
- `ncm text`, `cest text`, `origin_code text`
- `cfop_in_state text`, `cfop_interstate text`
- `icms_cst text`, `icms_csosn text`, `ipi_cst text`, `pis_cst text`, `cofins_cst text`
- `gtin text`, `taxable_gtin text`, `tax_benefit_code text`, `accounting_notes text`
- `profile_status` (mesmo enum/domínio de `product_fiscal_profiles.profile_status`)
- `created_at`, `updated_at`, `created_by`, `updated_by` (mesmo padrão + trigger de `updated_at` já existente reutilizado)

Índices e integridade:
- Índice único parcial `UNIQUE (microorganism_id) WHERE is_active` — no máximo 1 perfil ativo por microrganismo.
- Índices auxiliares em `microorganism_id`, `profile_status`.

Grants + RLS (mesma superfície do product_fiscal_profiles, não mais permissiva):
```
GRANT SELECT, INSERT, UPDATE, DELETE ON public.microorganism_fiscal_profiles TO authenticated;
GRANT ALL ON public.microorganism_fiscal_profiles TO service_role;
ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
```
Policies:
- SELECT: mesmos papéis que já leem `product_fiscal_profiles`.
- INSERT/UPDATE/DELETE: apenas `administrador` e `financeiro` via `public.has_role(auth.uid(), ...)`.

View segura `public.v_microorganism_fiscal_readiness`, dirigida por microrganismos ativos com LEFT JOIN ao perfil:
- `microorganism_id, profile_status, minimally_classified, accounting_validated` e campos adicionais mínimos consumidos pela UI.
- `minimally_classified` e `accounting_validated` calculados só a partir do próprio perfil (ncm/cfop/csts), nunca de `product_id`.

Não há backfill, cópia automática de dados de produto, produto-sombra ou alteração de dados existentes.

## 2. Hooks tipados

Novo `src/hooks/useMicroorganismFiscalProfiles.ts` — espelho de `useProductFiscalProfiles`:
- `useMicroorganismFiscalList` (agora dirigido por `microrganismos` com LEFT JOIN ao perfil próprio, paginação/busca/status)
- `useMicroorganismFiscalReadiness` (view acima, análoga à de produto)
- `useMicroorganismFiscalProfile(microorganismId)`
- `useSaveMicroorganismFiscalProfile` (insert/update com concorrência otimista via `updated_at`, verificação prévia de duplicidade, `permission_denied`, `OptimisticConflictError`)

Reaproveita `buildInsertPayload`/`buildUpdatePayload` de `productFiscalValidation` quando os campos batem 1:1; refatora esse módulo para aceitar `entityKind` sem casts amplos, extraindo os utilitários compartilhados.

`useMicroorganismFiscalAssociation.useAssociateMicroorganism` permanece exclusivamente para o vínculo comercial opcional; não toca perfis fiscais.

Boundary de tipos: mantido em cada hook (adapters explícitos). Sem `any`.

## 3. UI unificada (`FiscalProdutos.tsx` + drawer)

Mantém uma única página “Perfis fiscais” com produtos e microrganismos.

Linhas de microrganismo:
- Ação: sempre “Criar perfil fiscal” / “Editar perfil fiscal” (independente de `product_id`).
- Badges corrigidos:
  - Sem perfil próprio → **“Perfil fiscal pendente”** (substitui “Produto fiscal não associado”).
  - Sem `product_id` → **“Vínculo comercial opcional”** (informativo, não bloqueia nada).
  - Erro/loading do resolver de perfil próprio permanecem tratados (não regredir para “sem perfil”).
- Coluna/seção separada: status fiscal próprio × produto/composição vinculado (quando houver), sem herdar campos.
- Ação de vínculo renomeada para **“Vincular a produto/composição (opcional)”** com texto explicativo no diálogo: “Este vínculo não é necessário para faturar o microrganismo diretamente. Ele apenas registra a relação comercial/de composição.”

Drawer/formulário fiscal generalizado: recebe `entityKind: "PRODUCT" | "MICROORGANISM"` e `entityId`; escolhe hook e tabela alvo correspondentes. Mesma validação onde os campos são equivalentes.

Filtros, busca, status e resumo passam a contar microrganismos com/sem perfil próprio corretamente. Loading/erro/permission são separados por fonte (produtos, micros, readiness de cada um) e nunca degradam para “sem perfil” ou “Pendente”.

## 4. Faturamento fiscal direto (contrato + resolver)

Auditar `supabase/functions/_shared/fiscal/*` (preflight, builders, contratos de `fiscal_invoice_items`) e adaptadores em `src/`.

Adicionar suporte explícito, sem criar fluxo paralelo de emissão:
- Constante canônica de origem: `SOURCE_ITEM_TYPE.MICROORGANISM = 'MICROORGANISM'` (documentada em um único módulo compartilhado com o edge).
- Resolver puro `resolveFiscalItemFromMicroorganism(microorganismId)` que:
  - carrega `microorganism_fiscal_profiles` ativo do próprio microrganismo;
  - monta snapshot fiscal (ncm/cest/cfop/csts/unidades/descrição fiscal) exclusivamente dele;
  - preenche `source_item_type='MICROORGANISM'`, `source_item_id=<micro.id>`, `item_kind` compatível com mercadoria;
  - **NÃO** consulta ou usa `product_fiscal_profiles` como fallback, mesmo se `microrganismos.product_id` estiver preenchido;
  - retorna erro amigável `microorganism_profile_missing` / `microorganism_not_minimally_classified` quando faltar perfil próprio ou classificação mínima.
- Preflight ganha branch equivalente para itens `MICROORGANISM`.

Nenhuma nota real é criada; `FEATURE_FLAGS.fiscalEmissionEnabled` permanece `false`. Se o fluxo de criação de itens ainda não existir, apenas o resolver + contrato + testes são entregues.

## 5. Testes

Novos arquivos sob `src/test/fiscal/`:
- `fase3_21.microorganism_profile.hooks.test.ts` — CRUD, concorrência otimista, permission_denied, unicidade de perfil ativo (mock).
- `fase3_21.microorganism_profile.ui.test.tsx` — UI unificada: badges “Perfil fiscal pendente” / “Vínculo comercial opcional”, ação sempre disponível, filtros, resumo, loading/erro/permission separados; produto vinculado não altera perfil do micro.
- `fase3_21.microorganism_profile.resolver.test.ts` — resolver de item fiscal MICROORGANISM: snapshot correto, produto vinculado nunca é fallback, ausência de perfil bloqueia com mensagem amigável, emissão permanece bloqueada.
- `fase3_21.microorganism_profile.migration.static.test.ts` — presença da canônica, stub sem SQL executável, unicidade da fonte, `UNIQUE` parcial de perfil ativo, grants, RLS restrita a administrador/financeiro para escrita, RESTRICT no FK.

Ajustes nos testes existentes de `FiscalProdutos` para a nova terminologia e para a coexistência de perfil próprio do micro com vínculo opcional.

Validação: `tsgo`, `bun run build`, suíte fiscal completa, `eslint` nos arquivos alterados.

## 6. Restrições

- Nenhuma migration existente é editada.
- Migration nova **não é aplicada** no banco pelo Lovable — apenas criada.
- RLS existente não é ampliada.
- `fiscalEmissionEnabled` continua `false`; nenhum provedor externo é chamado.
- Nenhum dado existente é alterado; nenhuma associação automática é criada.
- Nenhuma alteração em módulos financeiros/B2B.

## 7. Detalhes técnicos

Arquivos alterados/criados (previstos):
- `supabase/migrations/20260806000000_fiscal_microorganism_profiles.sql` (novo)
- `restoration/migrations/20260806000000_fiscal_microorganism_profiles.sql` (novo, stub)
- `supabase/functions/_shared/fiscal/sourceItemTypes.ts` (novo, constantes canônicas)
- `supabase/functions/_shared/fiscal/resolveMicroorganismItem.ts` (novo, resolver puro)
- Ajustes mínimos em preflight/builder existentes para reconhecer `MICROORGANISM`.
- `src/hooks/useMicroorganismFiscalProfiles.ts` (novo)
- `src/lib/fiscal/productFiscalValidation.ts` (extração de helpers compartilhados; sem quebrar API)
- `src/lib/fiscal/microorganismFiscalValidation.ts` (novo, thin wrapper)
- `src/lib/fiscal/sourceItemTypes.ts` (mirror client-side)
- `src/pages/configuracoes/FiscalProdutos.tsx` (linguagem, ação sempre disponível para micro, separação de estados)
- `src/components/fiscal/**` — drawer generalizado com `entityKind`.
- Novos testes citados na seção 5.

Types do Supabase: os hooks novos usam boundary local (interfaces manuais) até regen oficial de `src/integrations/supabase/types.ts`, análogo ao já feito na fase 3.20.

## Riscos residuais

- `src/integrations/supabase/types.ts` não conterá a nova tabela/view até regen externo — mitigado com boundary local.
- Se `product_fiscal_profiles` tiver colunas fiscais adicionais realmente usadas que eu não mapear, o perfil de microrganismo ficará mais estreito; a auditoria de campos será feita antes de escrever a migration.
