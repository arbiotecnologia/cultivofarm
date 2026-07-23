# Padronizar layout da aba "Microrganismos" com "Produtos"

Objetivo: replicar o layout da tabela de **Produtos** na aba **Microrganismos**, respeitando os dados que cada entidade oferece (microrganismo não tem "Composição" nem `valor_ha_brl` direto).

## Alterações em `src/components/protocolos/MicrorganismosTab.tsx`

### 1. Cabeçalho da tabela — mesmo padrão de Produtos
Colunas finais: **Microrganismo | Volumes | Concentração (UFC/mL) | Dose (mL/ha) | Valores | Ref. | Ações**

- `Concentração (UFC/mL)` ocupa a posição de `Composição` (é o "conteúdo" próprio do microrganismo).
- Adicionar coluna `Ref.` mostrando `fornecedor` / `safra_referencia` (dados que só o microrganismo tem), mesmo formato usado em Produtos (`div` xs, sublegenda muted). Quando ausente: `—`.
- Atualizar `colSpan` do estado vazio para `7`.

### 2. Célula "Valores" — mesmo formato de Produtos
Renderizar duas linhas alinhadas à direita, `font-mono-data text-xs`, iguais à de Produtos:
- Linha 1 (destaque primário): `R$ X /ha` calculado via `calcularCustoHa(dose_ml_ha, valor_dose_brl)`.
- Linha 2 (muted): `R$ Y /100 mL` a partir de `valor_dose_brl` (ou derivado de `valor_litro_brl / 10`).
- Se tudo nulo: `—`.

Importar `calcularCustoHa` de `@/lib/catalogo/pricing` (já usado em Produtos).

### 3. Coluna "Ações" — padrão inline de Produtos
Substituir o `DropdownMenu` atual pela mesma barra inline usada em Produtos:
`[Badge status] [Volumes] [Ficha] [PDF icon] [Info tooltip se houver obs] [Delete icon]`

- Botões `size="sm" variant="outline" h-7 px-2` (mesmas dimensões de Produtos).
- Botão PDF `variant="ghost" h-7 w-7 p-0` com `FileDown`.
- `Info` como ícone com Tooltip (não `DropdownMenuItem`).
- `DeleteProtocoloButton` volta a usar a variante padrão `icon` (sem `variant="dropdown"`).
- Remover imports não usados: `DropdownMenu*`, `DropdownMenuSeparator`, `MoreVertical`.

### 4. Manter o que já está correto
- Célula "Microrganismo" (código, nome, científico, badge tipo, função) permanece.
- Célula "Volumes" (`VolumesChips`) permanece.
- Filtros, busca, exportar PDF e "Novo Microrganismo" permanecem.

## Não alterar
- `DeleteProtocoloButton.tsx` (mantém suporte a `variant="dropdown"` já entregue; só deixa de ser usado aqui).
- Nada de banco, migrations, RLS, rotas ou lógica de negócio.
- Aba de Produtos permanece intacta.

## Validação
- `tsgo` (typecheck)
- `bun run build`
- Suíte fiscal (`src/test/fiscal`) para regressão geral
