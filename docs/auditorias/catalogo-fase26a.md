# FASE 26A — Auditoria e plano de unificação do Catálogo AR Bio

Somente leitura. Nenhum arquivo funcional, schema, migration, RLS, RPC ou dado foi alterado.

## 1. Rotas encontradas

| Rota | Componente | Papel | Situação |
|---|---|---|---|
| `/base-tecnica` (`?tab=produtos\|microrganismos\|catalogo-tecnico\|culturas\|problemas`) | `src/pages/Protocolos.tsx` | Admin/técnico | Preservar (rota canônica) |
| `/protocolos` | `PreservedNavigate → /base-tecnica` | legado | Já redirecionada; manter |
| `/comercial/catalogo` | `src/pages/comercial/CatalogoComercial.tsx` | Comercial (leitura) | Duplica visualmente `?tab=catalogo-tecnico` |
| `/portal-parceiro/catalogo`, `/novo`, `/simulador` | `NovoPedido.tsx` | Parceiro B2B | Preservar |
| `/portal-parceiro/fichas` | `ParceiroFichasTecnicas` | Parceiro B2B | Preservar |
| `/app/catalogo` | `MobileCatalogoTecnico.tsx` | Consultor mobile | Preservar (consulta própria, ver §3) |
| `/operacao/planejamento[/:id]` | `PlanejamentoProducao(.Detalhe)` | Produção | Consome OS/itens, não catálogo |

Não existem rotas `/produtos`, `/microrganismos` nem `/catalogo-tecnico` isoladas — são abas de `/base-tecnica`. Menu (`src/config/navigation.ts`) já expõe `protocolos-*` como filhos com `paramDefault`, além do item separado `com-catalogo`.

## 2. Componentes e hooks

Componentes: `components/protocolos/` (ProdutosTab 1191 l., MicrorganismosTab 692 l., CatalogoTecnicoTab, RevisaoTecnicaPanel, CatalogSearchFilters, CatalogoVolumesDialog, VolumesChips, Product/Microorganism TechnicalProfileDialog, `catalog/*`: Targets, Crops, Sources, ApprovalChecklist, Versões) e `components/catalogo/` (CatalogoCardsGrid, FichaProdutorDrawer, AddToCartDialog).

Hooks: `useCatalogoUnificado` (scopes admin/interno/b2b), `useCatalogoVolumes`, `useCatalogSources`/`useEffectiveCatalogSources`, `useCatalogTargetsCrops`, `useCatalogoAlvos`, `useMicroorganismProfile`, `usePartnerCatalog`/`usePartnerCatalogTecnico` (RPCs seguras), `usePartnerPrices`, `useCommercialPriceRules`.

### Sobreposições identificadas
1. `CatalogoComercial.tsx` e `CatalogoTecnicoTab.tsx` renderizam os **mesmos KPIs (7 cards, código idêntico)** + `CatalogoCardsGrid` mudando só o `scope`. Duplicação literal de ~40 linhas.
2. `ProdutosTab`/`MicrorganismosTab` (grade editável) e `CatalogoCardsGrid` (grade de leitura) listam os mesmos registros com layouts distintos.
3. `MobileCatalogoTecnico` refaz manualmente o join de `useCatalogoUnificado` (produtos + micros + perfis) com filtro `ativo`.
4. `usePartnerCatalog` (RPC) x `useCatalogoUnificado("b2b")` (queries diretas gated no cliente) coexistem para o mesmo público.

### Riscos de quebra
Alto: `NovoPedido`/carrinho (`unidade_medida`, `AddToCartDialog`, `usePartnerPrices`), aprovação técnica por RPC + checklist, PDFs (`lib/pdf/*` — catálogo, ficha técnica, dossiê).
Médio: `useTabParam` de `/base-tecnica` (links salvos), sidebar `paramDefault`.
Baixo: KPIs e filtros.

## 3. Estrutura de dados

Confirmado: tabelas oficiais permanecem `produtos`, `microrganismos`, `formulacoes`, `catalogo_volumes`; camada técnica complementar em `product_technical_profiles`, `microorganism_technical_profiles`, `product_target_recommendations`, `microorganism_targets`, `product_crop_recommendations`, `microorganism_crop_recommendations`, `catalog_technical_sources`, `catalog_technical_audit_logs`. Preço B2B isolado em `partner_product_prices`.

Nenhuma tabela paralela de produto/microrganismo foi encontrada no código. Planejamento, portais e PDFs derivam de OS/itens ou dos mesmos registros oficiais.

## 4. Proposta de unificação (visual/operacional, sem fusão de tabelas)

Entrada única de menu **Catálogo AR Bio** apontando para `/base-tecnica`, com abas: Produtos · Microrganismos · Composições · Volumes e Preços · Fichas Técnicas · Revisão Técnica · Publicação · Histórico. As abas continuam sendo `?tab=` sobre a mesma página, preservando deep links atuais e adicionando aliases.

Ficha completa por item em drawer/página com abas carregadas sob demanda (Geral, Comercial, Volumes, Composição*, Técnica, Alvos/Culturas, Fontes, Revisão, Histórico; *só produto), reaproveitando os diálogos existentes como conteúdo de aba.

Perfis: administrador/gestor completo; técnico com técnica/alvos/fontes/revisão; comercial com B2B e preços sem aprovação; parceiro só ativo + b2b_enabled + ficha aprovada (via RPC); produtor apenas conteúdo aprovado simplificado. Nenhuma regra de aprovação alterada nesta fase.

## 5. Fases de implementação propostas

- **26B** — Extrair `CatalogoKpis` compartilhado e fazer `/comercial/catalogo` reutilizá-lo; sem mudança de dados.
- **26C** — Renomear rótulo do menu para "Catálogo AR Bio", agrupar filhos por aba e adicionar aliases `?tab=catalogo`, `?tab=fichas`, `?tab=revisao`.
- **26D** — Ficha unificada por item com abas lazy (React Query por aba).
- **26E** — Abas Volumes e Preços / Publicação reaproveitando `useCatalogoVolumes` e `partner_product_prices` em leitura/edição já existentes.
- **26F** — Performance: paginação e colunas explícitas; remover contagens de fontes/alvos da listagem (mover para RPC de agregados ou para a ficha).
- **26G** — Convergir `MobileCatalogoTecnico` e `useCatalogoUnificado("b2b")` para as RPCs canônicas.

Arquivos prováveis: `src/pages/Protocolos.tsx`, `src/pages/comercial/CatalogoComercial.tsx`, `src/components/protocolos/CatalogoTecnicoTab.tsx`, `src/components/catalogo/CatalogoCardsGrid.tsx`, `src/config/navigation.ts`, `src/hooks/useCatalogoUnificado.ts`, novo `src/components/catalogo/CatalogoKpis.tsx`.

## 6. Rotas a preservar / redirecionar

Preservar: `/base-tecnica` e todos os `?tab=` atuais, `/comercial/catalogo`, rotas de portal parceiro/produtor, `/app/catalogo`, `/operacao/planejamento`.
Redirecionar (já existente): `/protocolos → /base-tecnica`. Novos aliases apenas por query string, sem remoção.

## 7. Rollback e testes

Rollback: todas as fases são frontend-only e revertíveis por commit; nenhuma migration envolvida.
Testes necessários: `sidebar-padronizacao`/navegação (N-01..N-15), `base-tecnica.redirect`, `catalogo/formatUnidades.guard`, `portalParceiroSimulador.contract`, typecheck, build e suíte completa.

## 8. Status

**APTO PARA UNIFICAÇÃO VISUAL** — com a ressalva operacional de que o binding do projeto (`.env` / `types.ts`) sofre drift recorrente e deve estar no baseline de staging antes de qualquer execução.
