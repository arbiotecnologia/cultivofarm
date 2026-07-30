## Problema

Em `src/pages/Protocolos.tsx` (linha 668) as abas são **não controladas**:

```tsx
<Tabs defaultValue="produtos">
```

Com `defaultValue`, a aba ativa vive apenas em estado interno do Radix. Qualquer remontagem da árvore da página (atualização de sessão/role no `useAuth`, remonte do layout, refresh do preview, HMR, ou navegação de volta) descarta esse estado e a UI volta para "Produtos". O mesmo padrão existe nas subabas: `CatalogoTecnicoTab.tsx` (`defaultValue="catalogo"`), `RevisaoTecnicaPanel.tsx` (`defaultValue="micro"`) e `ProdutosTab.tsx` (`defaultValue="geral"`).

## Solução proposta

Tornar a aba ativa parte da **URL**, que é a única fonte que sobrevive a remontagens, deep link, F5 e botão voltar — coerente com a regra do projeto de preservar query strings nas rotas.

### 1. Aba principal controlada por query param
- Em `Protocolos.tsx`, usar `useSearchParams` para ler `?tab=` com fallback `"produtos"`.
- Validar contra a lista permitida (`produtos | microrganismos | catalogo-tecnico | culturas | problemas`); valor inválido cai no default sem quebrar.
- `onValueChange` atualiza o param com `replace: true` (não polui o histórico com cada clique de aba) e preserva os demais params existentes.

### 2. Subabas também preservadas
- `CatalogoTecnicoTab`: param `?sub=` (`catalogo | revisao`).
- `RevisaoTecnicaPanel`: param `?rev=` (`micro | produto`).
- Mesmo helper de leitura/escrita, para não duplicar lógica.
- As abas internas de diálogos (`ProdutosTab` linha 620, e os dialogs de perfil técnico) **não** vão para a URL: são efêmeras e fecham junto com o modal.

### 3. Utilitário compartilhado
- Novo `src/lib/navigation/useTabParam.ts`: hook `useTabParam(key, allowed, fallback)` que devolve `[value, setValue]`, valida o valor e escreve na URL com `replace`, mantendo os outros parâmetros intactos.

### 4. Testes
- Teste unitário do `useTabParam`: valor default, valor inválido, troca de aba, preservação de outros params.
- Teste de render do `Protocolos` com `MemoryRouter` em `/protocolos?tab=culturas` confirmando que a aba correta abre e que uma remontagem mantém a aba.

## Detalhes técnicos

- Nenhuma alteração de rota, permissão, dependência ou backend.
- Arquivos tocados: `src/pages/Protocolos.tsx`, `src/components/protocolos/CatalogoTecnicoTab.tsx`, `src/components/protocolos/RevisaoTecnicaPanel.tsx`, novo `src/lib/navigation/useTabParam.ts`, novo arquivo de teste.
- Validações finais: typecheck, build e vitest.

## Observação

Não foi confirmado *o que* dispara a remontagem (pode ser refresh do preview, atualização de sessão ou invalidação que derruba um gate de loading acima da página). A correção acima resolve o sintoma de forma definitiva independentemente da causa; se você quiser, posso incluir uma investigação da origem da remontagem como primeiro passo.
