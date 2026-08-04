# Valor único por hectare e reorganização das colunas (Base Técnica)

Ajuste apenas de apresentação nas abas **Produtos** e **Microrganismos** de `/base-tecnica`. Nenhuma alteração de dados, RPC, permissão ou regra de preço.

## 1. Remover redundância de valores

Hoje a coluna "Valores" dos **produtos** mostra duas linhas empilhadas (ex.: `R$ 15,00 /ha` e `R$ 15,00 /100 mL`), o que gera leitura duplicada. Microrganismos já mostram só `/ha`, mas sem o sufixo.

- A coluna passa a exibir **um único valor**: `R$ X,XX /ha`.
- Mesma renderização nas duas abas (número em destaque + sufixo `/ha` discreto).
- Sem valor calculável → `—`.
- A precedência de cálculo permanece a atual (`valor_ha_brl` explícito → dose × valor da dose → derivado do valor por litro). Nada é removido do formulário de cadastro: dose 100 mL e valor por litro continuam editáveis na ficha.

## 2. Fluxo visual das colunas

Ordem única e coerente entre as duas abas, do identificador ao operacional:

Microrganismos:
```text
Microrganismo | Concentração (UFC/mL) | Volumes | Dose (mL/ha) | Valor/ha | Ref. | Ações
```

Produtos:
```text
Produto | Composição | Volumes | Dose (mL/ha) | Valor/ha | Ref. | Ações
```

Mudanças concretas:
- Produtos: "Composição" sobe para logo depois do nome (ocupa o mesmo lugar que "Concentração" tem em microrganismos), e "Volumes" passa a vir em seguida.
- Microrganismos: "Concentração" sobe para a segunda posição, antes de "Volumes".
- Cabeçalho "Valores" renomeado para "Valor/ha", alinhado à direita nas duas abas.
- Alinhamentos padronizados: identificação e composição à esquerda; concentração, dose e valor à direita; ações à direita.

## 3. Detalhes técnicos

- Arquivos: `src/components/protocolos/ProdutosTab.tsx` e `src/components/protocolos/MicrorganismosTab.tsx` — apenas os blocos `TableHeader`/`TableCell` da listagem.
- Extrair um helper compartilhado de formatação do valor por hectare (reutilizando `calcularCustoHa` de `src/lib/catalogo/pricing.ts` e `brl`) para garantir número idêntico nas duas abas.
- `colSpan` do estado vazio mantido em 7.
- Validação: typecheck, build e vitest.
