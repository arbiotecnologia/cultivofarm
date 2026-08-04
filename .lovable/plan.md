# Alinhamento da coluna "Volumes"

Hoje cada volume é uma única string (`5 L · R$ 750,00`) que quebra de linha quando não cabe, deixando o preço desalinhado em relação à linha de cima.

## O que muda

- Cada volume passa a ser uma linha com duas colunas fixas:
  - esquerda: rótulo do volume (`5 L`, `20 L`), alinhado à esquerda;
  - direita: preço (`R$ 750,00`), alinhado à direita, com números tabulares para que os dígitos fiquem em coluna.
- Sem quebra de linha dentro de cada item (o preço nunca cai para a linha de baixo).
- O separador "·" sai; a separação passa a ser visual pelo alinhamento.
- O indicador "+N volumes" continua igual, e o tooltip usa o mesmo layout de duas colunas.
- Estado vazio ("adicionar" / "—") permanece inalterado.

## Detalhes técnicos

- Arquivo único: `src/components/protocolos/VolumesChips.tsx`.
- Trocar a função `linha()` que retorna string por renderização em grid (`grid grid-cols-[auto_1fr]` com `gap-x-2`, preço em `text-right tabular-nums whitespace-nowrap`).
- Mantém os tokens semânticos atuais (`text-foreground/80`, `text-muted-foreground`) e a largura máxima da célula.
- Aplica-se automaticamente às abas Produtos e Microrganismos, que já consomem o mesmo componente.
