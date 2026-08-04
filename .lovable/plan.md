# Padronização do cabeçalho de identidade em todos os portais

## Problema observado

Cada portal identifica usuário e contexto de um jeito diferente, e o Portal do Parceiro repete a mesma informação três vezes:

```text
PORTAL PARCEIRO (sidebar)          PORTAL DO PRODUTOR (header)      APP MOBILE
[carrinho] Portal Parceiro         [broto] Portal do Produtor       (sem bloco de identidade)
           B2B AR Bio              [predio] Cliente X   Fagner
           [ PORTAL PARCEIRO B2B ] (papel do usuario nao aparece)
------------------------------
[FF] Fagner Furtado
     fagner@arbio.com
     [ GESTOR B2B ]
------------------------------
Parceiro
FSF AGROSERVICE PRODUTOS...
```

Redundâncias e inconsistências confirmadas no código:
- `PortalParceiroLayout.tsx`: título "Portal Parceiro" + subtítulo "B2B AR Bio" + badge "Portal Parceiro B2B" — três formas do mesmo rótulo, em três blocos com borda.
- `UsuarioIdentidade.tsx`: repete nome, e-mail e mais um badge no mesmo estilo do badge do portal, competindo por atenção.
- O nome do parceiro (contexto mais importante) aparece por último, truncado e com menos peso visual que a marca do portal.
- `PortalLayout.tsx` (produtor) mostra cliente e nome soltos no header, sem iniciais, sem papel e sem e-mail.
- `MobileLayout.tsx` não tem nenhum bloco de identidade — o usuário não vê em qual conta/contexto está.
- `AppLayout.tsx` (admin) já tem o padrão mais próximo do ideal: nome + papel em badge.

## Proposta: um componente único de identidade

Criar `src/components/portal/PortalIdentityHeader.tsx`, usado por todos os portais, com hierarquia fixa em três níveis:

```text
[icone] Portal Parceiro                 <- 1. marca do portal (uma linha, sem badge duplicado)
        FSF AGROSERVICE PRODUTOS AGRO   <- 2. contexto ativo (destaque)
--------------------------------------
[FF] Fagner Furtado · Gestor B2B        <- 3. usuario + papel (texto, nao badge)
     fagner@arbio.com
```

Regras comuns a todos os portais:
1. Marca do portal em uma linha só; sem subtítulo repetido e sem badge que repete o título.
2. Contexto ativo (parceiro / cliente / organização) logo abaixo da marca, em destaque, com `title` completo no hover e quebra em até duas linhas em vez de truncar agressivamente.
3. Usuário com iniciais em avatar, nome + papel na mesma linha (papel como texto secundário, não badge), e-mail em linha menor.
4. Uma única divisória entre marca/contexto e usuário — fim dos três blocos empilhados.
5. Variante `compact` (uma linha, avatar + nome + papel) para headers mobile e barras superiores.
6. Quando o contexto é selecionável (staff simulando parceiro, produtor com vários clientes), o seletor ocupa o lugar da linha de contexto — sem criar bloco extra.

## Aplicação por portal

| Portal | Mudança |
| --- | --- |
| Parceiro (`PortalParceiroLayout`) | Substitui os 3 blocos do topo da sidebar por `PortalIdentityHeader`; remove badge "Portal Parceiro B2B" e o subtítulo "B2B AR Bio" como linha separada; `Select` de staff entra como slot de contexto. Header mobile usa a variante `compact`. |
| Produtor (`PortalLayout`) | Header passa a usar a variante `compact` com avatar de iniciais, nome + papel e cliente ativo; o `Popover` de troca de cliente vira o slot de contexto, mantendo o comportamento atual. |
| App mobile (`MobileLayout`) | Ganha uma faixa superior fina com a variante `compact` (avatar, nome, papel, contexto), hoje inexistente. |
| Admin (`AppLayout`) | Sem alteração obrigatória. Sugestões opcionais: trocar o badge de papel por texto secundário e adicionar avatar de iniciais, apenas para ficar visualmente igual aos demais. Decisão do usuário. |

## Detalhes técnicos

- Novo componente: `src/components/portal/PortalIdentityHeader.tsx` (marca, contexto, slot de seletor, bloco de usuário, variantes `sidebar` e `compact`).
- `src/components/portal-parceiro/UsuarioIdentidade.tsx`: funções puras `getIniciais`, `getPrimeiroNome`, `getPapelLabel` movidas para um util compartilhado (`src/lib/portal/identidade.ts`) e reaproveitadas; o componente atual passa a ser um wrapper fino para não quebrar imports/testes existentes.
- Rótulos de papel continuam vindo de `portalDisplayLabel.ts` / `getPapelLabel`, sem novas strings soltas.
- Acessibilidade: `aria-label` do papel preservado, contexto com `title`, avatar `aria-hidden` com texto acessível ao lado.
- Somente apresentação: nenhuma alteração em guards, rotas, permissões, hooks de dados, RPCs ou banco.
- Validação: `typecheck`, `build`, suíte Vitest e conferência visual dos três portais em desktop e mobile.

## Pergunta em aberto

Aplico também as melhorias opcionais no portal do administrador (avatar de iniciais + papel como texto), ou mantenho o `AppLayout` exatamente como está?
