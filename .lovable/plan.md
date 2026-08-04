# Padronização do cabeçalho de identidade em todos os portais e perfis

## Problema observado

Cada superfície identifica usuário e contexto de um jeito diferente, e o Portal do Parceiro repete a mesma informação três vezes:

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

Defeitos confirmados no código:
- `PortalParceiroLayout.tsx`: título "Portal Parceiro" + subtítulo "B2B AR Bio" + badge "Portal Parceiro B2B" — três formas do mesmo rótulo, em três blocos com borda; o nome do parceiro (contexto mais importante) fica por último e truncado.
- `UsuarioIdentidade.tsx`: repete nome, e-mail e mais um badge no mesmo estilo do badge do portal.
- `PortalLayout.tsx` (produtor): cliente e nome soltos no header, sem iniciais, sem papel, sem e-mail.
- `MobileLayout.tsx`: nenhum bloco de identidade — o usuário não vê em qual conta/contexto está.
- `AppLayout.tsx` (perfis internos): mostra o papel duas vezes (badge + texto abaixo do nome) e o mapa `roleLabels` só cobre 5 papéis (`administrador`, `tecnico_agronomo`, `producao`, `administrativo`, `gestor`). Consultor técnico, aplicador, operador on-farm, financeiro e gestor comercial caem no fallback e veem a string crua do banco, ex.: `gestor_comercial`, `operador_onfarm`.

## Proposta: um componente único de identidade

Criar `src/components/portal/PortalIdentityHeader.tsx`, usado por todas as superfícies, com hierarquia fixa em três níveis:

```text
[icone] Portal Parceiro                 <- 1. marca do portal (uma linha, sem badge duplicado)
        FSF AGROSERVICE PRODUTOS AGRO   <- 2. contexto ativo (destaque)
--------------------------------------
[FF] Fagner Furtado · Gestor B2B        <- 3. usuario + papel (texto, nao badge)
     fagner@arbio.com
```

Regras comuns:
1. Marca do portal em uma linha só; sem subtítulo repetido e sem badge que repete o título.
2. Contexto ativo (parceiro / cliente / organização / origem) logo abaixo da marca, em destaque, com `title` completo no hover e até duas linhas em vez de truncar agressivamente.
3. Usuário com avatar de iniciais, nome + papel na mesma linha (papel como texto secundário, nunca duplicado em badge), e-mail em linha menor.
4. Uma única divisória entre marca/contexto e usuário.
5. Variante `compact` (uma linha: avatar + nome + papel) para headers mobile e barras superiores.
6. Onde o contexto é selecionável (staff simulando parceiro, produtor com vários clientes), o seletor ocupa o lugar da linha de contexto — sem bloco extra.

## Cobertura por perfil

Rótulo único e correto para todos os papéis, vindo de uma fonte só:

| Papel | Rótulo exibido | Superfície |
| --- | --- | --- |
| Administrador | Administrador | AppLayout |
| Gestor | Gestor | AppLayout |
| Gestor comercial | Gestor Comercial | AppLayout |
| Financeiro | Financeiro | AppLayout |
| Produção | Produção | AppLayout |
| Técnico agrônomo | Técnico Agrônomo | AppLayout + mobile |
| Consultor técnico | Consultor Técnico | AppLayout + mobile |
| Aplicador | Aplicador | AppLayout + mobile |
| Operador on-farm | Operador On-Farm | AppLayout |
| Administrativo | Administrativo | AppLayout |
| Parceiro B2B (gestor) | Gestor B2B | Portal Parceiro |
| Parceiro B2B técnico | Técnico B2B | Portal Parceiro |
| Cliente produtor | Produtor | Portal do Produtor + mobile |

## Aplicação por superfície

| Superfície | Mudança |
| --- | --- |
| Parceiro (`PortalParceiroLayout`) | Substitui os 3 blocos do topo da sidebar por `PortalIdentityHeader`; remove badge "Portal Parceiro B2B" e o subtítulo como linha separada; `Select` de staff vira slot de contexto. Header mobile usa `compact`. Cobre parceiro B2B e parceiro B2B técnico. |
| Produtor (`PortalLayout`) | Header usa `compact` com avatar, nome + papel e cliente ativo; o `Popover` de troca de cliente vira o slot de contexto, comportamento preservado. |
| Interno (`AppLayout`) | Remove a duplicação badge + texto do papel; adota `PortalIdentityHeader` na variante `compact` com avatar de iniciais; passa a usar o mapa completo de rótulos, corrigindo a exibição crua para consultor técnico, aplicador, operador on-farm, financeiro e gestor comercial. |
| App mobile (`MobileLayout`) | Ganha faixa superior fina com a variante `compact` (avatar, nome, papel, contexto), hoje inexistente — atende consultor técnico, técnico agrônomo, aplicador e produtor no mobile. |

## Detalhes técnicos

- Novo componente: `src/components/portal/PortalIdentityHeader.tsx` (marca, contexto, slot de seletor, bloco de usuário; variantes `sidebar` e `compact`).
- Novo util: `src/lib/portal/identidade.ts` com `getIniciais`, `getPrimeiroNome` e o mapa único de rótulos de papel, consolidando o `roleLabels` local do `AppLayout`, o `getPapelLabel` do portal parceiro e `portalDisplayLabel.ts`.
- `src/components/portal-parceiro/UsuarioIdentidade.tsx` vira wrapper fino sobre o novo componente, preservando imports e testes existentes.
- Acessibilidade: `aria-label` do papel preservado, contexto com `title`, avatar `aria-hidden` com texto acessível ao lado.
- Somente apresentação: nenhuma alteração em guards, rotas, permissões, hooks de dados, RPCs ou banco.
- Validação: `typecheck`, `build`, suíte Vitest e conferência visual das quatro superfícies em desktop e mobile.
