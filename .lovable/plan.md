## Ajustes na aba Microrganismos (`/protocolos`)

### 1. Remover botão "Importar Tabela A.R Bio 2026"
- Em `src/components/protocolos/MicrorganismosTab.tsx`, remover o `<Button>` (linhas ~299–316), o import `importarMicrosARBio2026` e o ícone `Download` do import de `lucide-react` (não é usado em outro lugar).
- Manter `src/lib/protocolos/seedMicrorganismosARBio2026.ts` no repositório como utilitário interno (função de uso único, sem UI).

### 2. Remover a coluna "Ref." da tabela
- Remover o `<TableHead>Ref.</TableHead>` (linha 525) e a `<TableCell>` correspondente (linhas 576–581) que renderiza fornecedor + safra.
- Ajustar `colSpan` do estado vazio de `7` para `6` (linha 532).
- As informações **fornecedor** e **safra_referencia** continuam disponíveis ao abrir o item (clicar na linha abre o diálogo de edição, que já contém esses campos em "Referência Comercial"), atendendo ao pedido de exibir apenas nos detalhes.

### 3. Acomodar melhor "UFC/mL"
- Renomear o cabeçalho para **"Concentração"** com sublinha "(UFC/mL)" em tipografia menor, evitando quebra estranha em telas médias.
- Formatar o valor em duas linhas semânticas: número em `font-mono-data` na primeira linha e a unidade `UFC/mL` como sublegenda em `text-[10px] text-muted-foreground`, alinhados à esquerda com `whitespace-nowrap` para evitar quebras no meio da notação científica.
- Manter o uso de `formatConcentracaoDisplay` (fonte canônica) para o valor.

### Validação
- `bun run typecheck` e `bun run build`.
- Nenhuma alteração em lógica de negócio, migrations, RLS ou Supabase remoto.