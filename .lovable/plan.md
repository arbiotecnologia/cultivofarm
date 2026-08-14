# Unificação do Catálogo AR Bio — Fase 26A (auditoria) e plano 26B+

Relatório completo em `docs/auditorias/catalogo-fase26a.md`. Nada foi alterado em banco, migrations, RLS, RPC ou dados.

## O que a auditoria encontrou

- Não existem rotas isoladas `/produtos`, `/microrganismos`, `/catalogo-tecnico`: são abas de `/base-tecnica` (`?tab=`). `/protocolos` já redireciona.
- `/comercial/catalogo` e a aba "Catálogo Técnico" renderizam KPIs idênticos (código duplicado) e a mesma grade, mudando apenas o escopo.
- Grades editáveis (Produtos/Microrganismos) e grade de leitura (CatalogoCardsGrid) exibem os mesmos registros com layouts diferentes.
- `MobileCatalogoTecnico` refaz o join de `useCatalogoUnificado`; no B2B convivem RPC segura e query direta com gate no cliente.
- Tabelas oficiais confirmadas (`produtos`, `microrganismos`, `formulacoes`, `catalogo_volumes`); camada técnica é complementar. Nenhuma tabela paralela.

## Proposta

Entrada única de menu "Catálogo AR Bio" sobre `/base-tecnica`, com áreas Produtos, Microrganismos, Composições, Volumes e Preços, Fichas Técnicas, Revisão Técnica, Publicação e Histórico — unificação visual, sem fundir tabelas nem duplicar dados. Ficha por item em abas carregadas sob demanda.

## Fases seguintes

- 26B: componente `CatalogoKpis` compartilhado (elimina duplicação literal).
- 26C: rótulo/agrupamento de menu e aliases de aba, sem remover rotas.
- 26D: ficha unificada por item com abas lazy.
- 26E: abas Volumes/Preços e Publicação reaproveitando hooks existentes.
- 26F: performance (paginação, colunas explícitas, agregados fora da listagem).
- 26G: convergir mobile e B2B para as RPCs canônicas.

## Preservação e riscos

Preservar: `/base-tecnica` e deep links `?tab=`, `/comercial/catalogo`, portais parceiro/produtor, `/app/catalogo`, planejamento, PDFs, `get_partner_catalog_secure`, `create_partner_order_secure`, `unidade_medida`, precificação B2B, aprovação técnica e RLS. Riscos altos concentrados em carrinho B2B, aprovação técnica e PDFs; todas as fases são frontend-only e revertíveis por commit.

## Testes

Navegação N-01..N-15, `base-tecnica.redirect`, `catalogo/formatUnidades.guard`, `portalParceiroSimulador.contract`, typecheck, build e suíte completa.

Ressalva: antes de executar 26B, o binding (`.env` / `types.ts`) deve estar no baseline de staging aprovado.

**Status: APTO PARA UNIFICAÇÃO VISUAL.**
