# FASE 26D — Ficha unificada por item com abas do Catálogo AR Bio

Frontend-only, incremental e reversível. Sem banco, migrations, RLS, RPC, Edge Functions, aprovação técnica, precificação B2B, pedido B2B, planejamento ou publicação.

## Arquivos alterados

| Arquivo | Mudança |
|---|---|
| `src/components/catalogo/CatalogoItemDrawer.tsx` | **Novo.** Ficha unificada somente leitura em `Sheet`, com abas e helpers de escopo/alertas exportados. |
| `src/components/catalogo/CatalogoCardsGrid.tsx` | Botão secundário "Ficha completa" + montagem do novo drawer. Nada removido. |
| `src/test/catalogo/catalogo-item-drawer.test.tsx` | **Novo.** Escopos, alertas e garantias de não regressão da grade. |
| `.env`, `src/integrations/supabase/types.ts` | Restaurados do baseline aprovado `c75bb87f` por drift de ambiente (types truncado em 2052 linhas). |

## Novo componente

`CatalogoItemDrawer({ item, open, onOpenChange, scope })` — `scope` aceita `admin | interno | b2b | produtor` (default `interno`). Usa apenas os dados já carregados por `useCatalogoUnificado`; **nenhuma query nova** e nenhum `supabase`/`rpc` no arquivo.

## Como abrir

Na grade do catálogo (cards ou lista), botão discreto **"Ficha completa"** ao lado de "Ver ficha". "Ver ficha" mantém exatamente o comportamento atual: dialogs técnicos para admin/interno e `FichaProdutorDrawer` para B2B.

## Abas implementadas

- **Geral** — nome, tipo, categoria/função, código/SKU, ativo/inativo, B2B habilitado.
- **Comercial** — dose (mL/ha), valor por dose, por litro e por hectare, unidade principal (quando presentes em `raw`), com a referência "1 L = 10 doses de 100 mL".
- **Técnica** — resumo, explicação técnica (interno), explicação para o produtor, explicação B2B e, para microrganismo, mecanismo e benefícios. Fontes internas não são listadas nesta fase.
- **Volumes** — usa volumes já presentes na linha; sem eles exibe "Volumes comerciais disponíveis na gestão de volumes do catálogo."
- **Composição** — só para produto e só quando a composição já vem no row.
- **Status** — status da ficha, contagem de fontes (interno), alvos/culturas, composição e alertas: produto sem composição, ficha em rascunho, ficha em revisão, aprovada sem fonte.

## Escopo de leitura e permissões visuais

- `admin`/`interno`: todas as abas, incluindo texto técnico, contagem de fontes e alertas.
- `b2b`: sem conteúdo interno, sem fontes/auditoria e sem texto para produtor.
- `produtor`: sem texto B2B, sem fontes, sem dados internos.

A regra está preparada, mas hoje o drawer só é montado a partir da grade, seguindo o `scope` já usado por ela — portais externos não mudam de comportamento.

## Fluxos preservados

`/base-tecnica`, `/protocolos` (redirect legado), `/comercial/catalogo`, portal parceiro, portal produtor, `/app/catalogo`, carrinho/`AddToCartDialog`, pedido B2B, precificação, aprovação técnica (`ApprovalChecklistDialog`, `ReturnToReviewButton`) e PDFs — nenhum desses arquivos foi tocado.

## Testes executados

`connection-binding.static.test.ts`, typecheck, testes de navegação/protocolos/catálogo, suíte completa e build — resultados registrados na execução da fase.

## Pendências 26E

- Aba Volumes/Preços com dados reais reutilizando os hooks existentes.
- Aba de Publicação/visibilidade.
- Avaliar convergência dos dialogs de edição para dentro da ficha unificada (fora de 26D por serem críticos).
