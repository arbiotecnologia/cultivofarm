## Diagnóstico

A coluna **Ref.** exibe `fornecedor` + `safra_referencia` em ambas as abas, mas apenas **Microrganismos** possui os campos editáveis no diálogo (seção "Referência Comercial", linhas 458–460 e 419–422 de `MicrorganismosTab.tsx`).

Em **Produtos** (`ProdutosTab.tsx`) esses campos são apenas lidos para exibição na tabela (linhas 876–877, 975–976). Não existe input no formulário de cadastro/edição — por isso não é possível alterar nem excluir a referência de um produto pela interface.

## O que fazer

### 1. `src/components/protocolos/ProdutosTab.tsx` — adicionar edição da referência
- Incluir `fornecedor` e `safra_referencia` no estado inicial de `form` e no `resetForm`.
- Popular esses campos ao abrir para edição (`handleEdit`).
- Adicionar seção **"Referência Comercial"** no diálogo, no mesmo padrão visual de Microrganismos, com dois `Input`s:
  - **Fornecedor** (texto livre; vazio = remover)
  - **Safra** (texto livre; vazio = remover)
- Incluir ambos no `payload` do `handleSave`, enviando `null` quando string vazia — assim salvar em branco efetivamente "exclui" a referência sem apagar o produto.

### 2. `src/components/protocolos/MicrorganismosTab.tsx` — só melhoria de descoberta
- Já existe a edição, mas os dois campos estão separados (Safra em cima, Fornecedor solto embaixo). Reagrupar dentro do bloco "Referência Comercial" lado a lado (Fornecedor + Safra em uma linha), para ficar visualmente idêntico ao de Produtos e mais fácil de localizar.
- Nenhuma mudança de schema, payload ou validação.

### 3. Exclusão explícita
Não será criado botão separado "excluir referência": deixar o campo em branco e salvar já grava `null`. Isso mantém consistência com o restante do formulário e evita ação destrutiva extra. Documentar via `placeholder="Deixe em branco para remover"` nos dois inputs.

## Fora do escopo
- Nenhuma alteração em migrations, RLS, schema de tabelas ou rotas.
- Nenhuma mudança em cálculos de custo, formulações, volumes ou fichas técnicas.
- Sem alteração de testes de negócio existentes (apenas ajustes triviais se algum snapshot cobrir esses diálogos — verificar após implementar).

## Validação
- `bun run typecheck`
- `bun run build`
- `bunx vitest run` (esperado manter 1479/1479).
