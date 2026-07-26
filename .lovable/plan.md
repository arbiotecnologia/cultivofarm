## Problema 1 — Seletor "Tipo de Pessoa" não fixa em Novo Produtor

**Causa raiz confirmada** em `src/components/clientes/ClienteFormTabs.tsx` (linhas 85‑96):

```ts
useEffect(() => {
  const digits = (cpfCnpj || "").replace(/\D/g, "");
  if (digits.length > 11) {
    if (tipoPessoa !== "juridica") setValue("tipo_pessoa", "juridica");
  } else if (digits.length > 0 && digits.length <= 11) {
    if (tipoPessoa !== "fisica") setValue("tipo_pessoa", "fisica");
  }
}, [cpfCnpj, setValue, tipoPessoa]);
```

Fluxo do bug: usuário digita CPF parcial (ex.: 3 dígitos) → efeito força `tipo_pessoa = "fisica"`. Ao trocar manualmente no Select para "Pessoa Jurídica", o `setValue` dispara re‑render, `cpfCnpj` continua com ≤11 dígitos, o efeito reexecuta e força de volta para "fisica". A seleção manual nunca "cola".

**Correção** (mínima, só frontend):
1. Remover `tipoPessoa` das dependências e usar uma `ref` para lembrar o último `cpfCnpj` já classificado, aplicando a autodetecção só quando o CNPJ/CPF **muda de fato** — e apenas em transições de faixa (≤11 ↔ >11). Assim a escolha manual do usuário é preservada enquanto o número digitado não mudar de faixa.
2. Alternativamente (equivalente e mais simples): só autoinferir quando `digits.length === 11` (CPF completo válido em tamanho) ou `digits.length === 14` (CNPJ completo). Digitação parcial não sobrescreve mais a escolha manual. Vou usar esta abordagem — é o padrão usado em outros formulários do sistema (a autodetecção só age no valor "final").

## Problema 2 — Busca automática por CNPJ no cadastro do Parceiro B2B

Padrão de referência já em uso em `ClienteFormTabs.handleCNPJLookup` (BrasilAPI via `src/lib/api/brasilapi.ts`, botão "Buscar dados" ao lado do CNPJ). O `ParceiroB2BFormDialog` hoje só tem o input de CNPJ, sem lookup.

**Alteração** em `src/components/comercial/ParceiroB2BFormDialog.tsx`:
- Ao lado do campo CNPJ, adicionar botão "Buscar dados (BrasilAPI)" com ícone de lupa/spinner, no mesmo estilo visual usado no ClienteFormTabs.
- Habilitado apenas quando `validateCNPJ(cnpj)` e `unmaskCnpj(cnpj).length === 14`.
- Ao clicar, chama `fetchCNPJ(cnpj)` e preenche apenas campos existentes no formulário do parceiro, sem tocar campos protegidos (CNPJ digitado, e‑mails, dados bancários, limite/comissão, flags, classificação):
  - `razao_social`, `nome_fantasia`
  - `cep`, `endereco_logradouro`, `endereco_numero`, `endereco_complemento`, `endereco_bairro`
  - `commercial_city`, `commercial_state` (municipio/UF vindos da BrasilAPI)
  - `telefone_comercial` (se vazio)
- Feedback via `toast.success`/`toast.error` (padrão do arquivo, `sonner`).
- Cooldown simples e cancelamento em unmount (`AbortController`) para não permitir cliques repetidos.
- Sem alterar validação, schema, mutations, RLS, migrations ou regras de negócio.

## Validação
- `bun run typecheck`
- `bun run build`
- Vitest completo (não deve haver testes cobrindo estes arquivos; se houver, mantê‑los verdes).
- Inspeção visual em `/clientes?aba=produtores` (Novo Produtor) e no dialog do Parceiro B2B.

## Fora de escopo
- Não alterar regras fiscais, edge functions, migrations, RLS ou tabelas.
- Não substituir CNPJ digitado; nunca sobrescrever campos protegidos.
- Não trocar a fonte para a edge function fiscal (`fiscal-cnpj-lookup`) — o padrão do cadastro comercial é a `BrasilAPI` direta, igual a Produtor.
