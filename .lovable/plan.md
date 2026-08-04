# Cabeçalho do Portal do Parceiro — remover redundância

## Problema observado

O topo da barra lateral empilha hoje quatro blocos separados por bordas, repetindo a mesma informação:

```text
[carrinho] Portal Parceiro
           B2B AR Bio
           [ PORTAL PARCEIRO B2B ]   <- repete a linha acima
-------------------------------------
[FF] Fagner Furtado
     fagner@arbio.com
     [ GESTOR B2B ]
-------------------------------------
Parceiro
FSF AGROSERVICE PRODUTOS...
-------------------------------------
```

Redundâncias reais no código:
- `PortalParceiroLayout.tsx` mostra "Portal Parceiro" + subtítulo "B2B AR Bio" + badge "Portal Parceiro B2B" — três formas do mesmo rótulo.
- `UsuarioIdentidade.tsx` repete nome, e-mail e mais um badge no mesmo padrão visual do badge do portal, competindo por atenção.
- O nome do parceiro (a informação de contexto mais importante) fica em último lugar, truncado e com peso visual menor que a marca do portal.

## Proposta

Consolidar em **um único bloco de cabeçalho** com hierarquia clara:

```text
[carrinho] Portal Parceiro · B2B AR Bio
           FSF AGROSERVICE PRODUTOS AGROPECUARIOS   <- destaque (contexto)
-------------------------------------
[FF] Fagner Furtado · Gestor B2B
     fagner@arbio.com
```

Regras:
1. Remover o badge "Portal Parceiro B2B" (duplicado do título) e o subtítulo separado; título vira uma linha só.
2. Elevar o nome do parceiro para dentro do bloco de marca, como texto de destaque, com `title` completo no hover e quebra em duas linhas em vez de truncar agressivamente.
3. O papel ("Gestor B2B" / "Técnico B2B" / "Visão interna") deixa de ser badge e passa a ser texto secundário na mesma linha do nome — mantendo o `aria-label` de acessibilidade.
4. Reduzir de três divisórias para uma, diminuindo o ruído vertical.
5. Para staff, o seletor "Visualizar como parceiro" substitui a linha do nome do parceiro dentro do mesmo bloco (sem bloco extra).
6. No cabeçalho mobile: manter apenas "Portal Parceiro" + iniciais do usuário; nome do parceiro passa a aparecer como subtítulo compacto, evitando o mesmo texto duas vezes.

## Detalhes técnicos

- `src/pages/portal-parceiro/PortalParceiroLayout.tsx`: reescrever o cabeçalho da `aside` (linhas ~174-217) para um bloco único; passar `partnerNome` para o novo layout; manter intactos guards, rotas, `useMyPartner`, `isStaff` e o `Select` de simulação.
- `src/components/portal-parceiro/UsuarioIdentidade.tsx`: variante `sidebar` sem borda própria e com papel como texto inline; variante `compact` inalterada na lógica, apenas ajuste de espaçamento.
- Somente apresentação: nenhuma alteração em permissões, navegação, hooks de dados ou banco.
- Validação: `typecheck`, `build` e a suíte Vitest; conferência visual em desktop e mobile pelo preview.
