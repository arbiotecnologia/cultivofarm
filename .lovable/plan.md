## Refinamentos da tabela de Microrganismos (`/protocolos`)

### 1. Remover duplicação "UFC/mL" abaixo do valor
- Na célula de Concentração, remover a sublinha `<div>UFC/mL</div>` (linhas 551–553). O cabeçalho da coluna já indica "Concentração (UFC/mL)".

### 2. Melhor acomodação da coluna "Valores"
- Aumentar a coluna com `min-w` adequado no `<TableCell>` e trocar `text-xs` por `text-sm` para melhor leitura.
- Quebrar valor e unidade em duas linhas para evitar cortes:
  - Linha 1: valor em destaque (ex.: `R$ 19,00`) em `text-primary font-semibold`.
  - Linha 2: sublegenda `/100 mL` em `text-[10px] text-muted-foreground`.
- Usar `whitespace-nowrap` para impedir quebra no meio do valor monetário.

### 3. Reorganizar coluna de ações
- Manter os controles à direita, mas padronizar como toolbar compacta em uma única linha (sem `flex-wrap`), com separadores lógicos:
  - **Status**: `TechnicalProfileStatusBadge` (sem ficha / rascunho / validado) — permanece na esquerda do bloco.
  - **Grupo primário**: `Volumes` e `Ficha` como botões `outline` compactos (`h-8`), com ícone + label.
  - **Grupo secundário (ações rápidas)**: `Exportar PDF` e `Observações (Info)` como botões `ghost` só-ícone (`h-8 w-8`), com `title`/tooltip acessível.
  - **Destrutivo**: `DeleteProtocoloButton` no final, isolado por um pequeno espaçamento (`ml-1`) para reduzir chance de clique acidental.
- Aplicar `gap-1.5`, alinhar com `justify-end`, `items-center` e `flex-nowrap`.
- Envolver o botão de exportar PDF também em `Tooltip` para consistência visual com o `Info`.

### Fora de escopo
- Nenhuma alteração em lógica de negócio, dados, migrations ou Supabase remoto.
- Layout de outras abas de `/protocolos` permanece inalterado.

### Validação
- `bun run typecheck` e `bun run build`.
- Inspeção visual via preview em 1034px e 1349px.