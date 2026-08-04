# Alinhamento do volume (número + "L") na coluna Volumes

Hoje o rótulo do volume é uma string única ("5 L", "20 L"), então o "L" fica em posições diferentes conforme o número tenha 1 ou 2 dígitos.

## O que muda

A linha de cada volume passa a ter três colunas alinhadas:

```text
  5 | L |     R$ 750,00
 20 | L |   R$ 3.000,00
1,5 | L |     R$ 250,00
```

- número do volume: alinhado à direita, dígitos tabulares (unidades sob unidades, dezenas sob dezenas);
- unidade "L": coluna própria de largura fixa, sempre na mesma posição;
- preço: alinhado à direita, dígitos tabulares, sem quebra de linha.

Volumes com rótulo personalizado (que não seguem o padrão "N L") continuam sendo exibidos como texto único na primeira coluna, sem quebrar o alinhamento das demais linhas.

## Detalhes técnicos

- Arquivos: `src/components/protocolos/VolumesChips.tsx` e um helper de formatação em `src/lib/envaseFormat.ts` (ou junto ao componente) que devolve `{ numero, unidade }` a partir de `volume_ml`, reaproveitando a mesma formatação pt-BR usada por `fmtL`.
- `LinhaVolume` passa de `grid-cols-[auto_1fr]` para `grid-cols-[auto_auto_1fr]` com `tabular-nums` no número e no preço.
- O mesmo layout é usado nas linhas visíveis e no tooltip de "+N volumes"; abas Produtos e Microrganismos herdam automaticamente.
