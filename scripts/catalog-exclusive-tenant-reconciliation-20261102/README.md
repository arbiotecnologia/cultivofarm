# Reconciliação local — catálogo exclusivo por empresa (2026-11-02)

**Atualização03/11:** integração exata75972877 foi posteriormente separada pela revisão de escopo. Estado vigente e matriz produção: `scope-audit-20261103/README.md` e `MATRIZ.csv`. Runtime financeiro/comercial original9d3a9424 preservado; catálogo local mantido; publicação NO-GO. Texto abaixo é baseline histórico, não status atual.

Status: **BASELINE / NO-GO**. Nenhuma escrita no banco, migration, publicação ou envio nesta rodada.
Projeto canônico `a79bb3db-…`, banco `swzpzcwiasxmjutrmvkm` (bindingGuard intacto). Base local: `80c64c384`.
Pacote de origem esperado: isolado `aec6d152-…`, commit `814c5bc` (NO-GO, testes em andamento) — **não recebido nem copiado**.

## Decisão do proprietário a integrar
- Catálogo exclusivamente por empresa; cada tenant cadastra seus produtos.
- Remover catálogo global Superadmin (UI + writers), sem bypass nem leitura cross-tenant.
- Financeiro associa perfil fiscal de produto/microrganismo só na própria empresa.
- Preservar perfis fiscais atuais e Fertilizante/Adubo = `tipo solo`, unidade padrão kg com opção mL.

## Contenção vigente (informada pelo auditor, não reverificada aqui)
cron 4/5/6/8 inativos; 1/2/7 preservados; gates SMTP dispatch/test/f4 = false; fiscal habilitados = 0. Não reabrir.

## Conflitos com pacotes existentes
1. `scripts/fiscal-tenant-catalog-20261101/` assume convivência global+próprio (RESTRICTIVE permite escrita direta em linhas globais; fertilizante global via `platform_create_global_product`). **Conflita** com a decisão; não aplicar. Etapa 1 do RUNBOOK não foi executada.
2. `scripts/rbac-audit/proposed-tenant-catalog-ownership*.sql` permite `owner_organization_id NULL` = global. Precisa ser substituído pela fundação do pacote `814c5bc`, não forkado.
3. Produção hoje: 13 produtos e 25 microrganismos **sem dono** e 2 perfis fiscais (snapshot read-only anterior). Atribuição de dono aos legados é decisão de dados pendente — não inferir.
4. Migrations: 998 arquivos; nenhuma cria `owner_organization_id` em `produtos` (as ocorrências são em outras tabelas). Não criar migration paralela.

## Arquivos exatos para integração
Remoção/contenção do global Superadmin:
- `src/components/plataforma/PlatformCatalog{ReadTab,EntityPanel,CompositionDialog,B2BDialog,VolumesDialog,FamilyDialog,MetadataDialog,LabelsPanel,LifecycleDialogs}.tsx`
- `src/lib/catalogo/platformCatalog{Read,Lifecycle,Family,Composition,Labels}.ts`, `catalogLabelDisplay.ts`
- `src/pages/plataforma/PlataformaHome.tsx`, `src/components/guards/PlataformaGuard.tsx`, `src/pages/configuracoes/ConfigCatalogoIA.tsx`
- `src/lib/configuracoes/configuracoesTabs.ts`, `src/pages/Configuracoes.tsx`
Catálogo próprio (manter/estender):
- `src/lib/catalogo/tenantCatalogOwnership.ts`, `src/components/protocolos/{ProdutosTab,MicrorganismosTab,OwnedCatalogItemDialog,OwnedCatalogItemControls}.tsx`, `src/pages/Protocolos.tsx`, `src/hooks/useCulturas.ts`
Fiscal (escopo próprio):
- `src/pages/configuracoes/FiscalProdutos.tsx`, `src/hooks/{useProductFiscalProfiles,useProductFiscalAccess,useMicroorganismFiscalProfiles,useMicroorganismFiscalAssociation,useFiscalProdutosLite,useFiscalRtc}.ts`
- `src/lib/fiscal/{ownedProductFiscal,productFiscalValidation,microorganismFiscalValidation,fiscalOptions}.ts`
- Edge: `supabase/functions/_shared/fiscal/resolveMicroorganismItem.ts`, `supabase/functions/admin-audit-produtos-orfaos/index.ts`
Consumidores indiretos a revalidar: `src/lib/comercial/internalOrderEntry.ts`, `src/hooks/{usePartnerUsers,useB2BFinanceiro}.ts`, `src/lib/authz/{multiProfileContract,b2bContextProbe}.ts`, `src/components/fiscal/documentos/RascunhoWizard.tsx`, `sinief49/SinefOperationsPanel.tsx`, `create-user`.
Rotas (`src/App.tsx`): `/configuracoes/fiscal/produtos` (648), `/configuracoes/catalogo-ia` (439), `/base-tecnica?tab=catalogo-tecnico`, `/app/catalogo`, parceiro `catalogo`. Mudança de rota exige autorização explícita (memória Core).
Tipos: `src/integrations/supabase/types.ts` / `cultivofarm.types.ts` — regenerar só após instalação revisada, nunca pelo Lovable Cloud.

## Testes relevantes
Precisarão ser invertidos (global → contido): `src/test/saas/platformCatalog*.test.tsx`, `catalog-global-consolidation.test.ts`, `src/test/catalogo/{globalCatalogContainment,globalCatalogReadOnly.render,platformCatalogLabels,catalogLabelsPanelFlow}.test.*`.
Manter verdes: `tenant-catalog-{ownership,owned-flow,visibility}`, `ownedProductFiscal`, `catalogFamilyRead`, fiscal estáticos `fase3_*`, `rls_perfis_split_write`.

## Baseline de testes (evidence/baseline-tests.log.txt)
`vitest --maxWorkers=2`: 51 arquivos, 1007 passaram, **10 falharam**, todos em `partnerCatalogMonitor.integration.test.tsx` — corrigidas em `evidence/monitor-fix/` (51/51, 1017/1017) (já listada entre as suítes do monitor com falhas preexistentes de infraestrutura de mocks; causa não reinvestigada nesta rodada). Não é regressão desta rodada (sem alteração de código).

## Pendências / bloqueios
- Receber `814c5bc` aprovado (revisão + testes) antes de integrar.
- Decisão de dono para os 13 produtos / 25 microrganismos legados e para os 2 perfis fiscais.
- Testes autenticados reais ARBio (positivo) × FSF (negativo) após instalação revisada.
- NF-e, cobranças, envios e automações seguem fechados.
