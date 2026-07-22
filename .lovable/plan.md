## Objetivo

Aplicar máscaras visuais consistentes nos campos do módulo fiscal (Central de Configuração, Clientes, Rascunho de documentos), mantendo armazenamento normalizado (só dígitos) e preservando toda a validação/RLS/regra de negócio existente.

## Escopo (somente UI/apresentação)

Não altera schemas Zod, RPCs, migrations, RLS, tipos gerados nem `src/lib/masks.ts` (já cobre CNPJ, CPF, CEP, telefone, IE). Nada de banco, nada de business logic.

### Arquivos que serão editados

1. **`src/pages/configuracoes/FiscalEmpresa.tsx`**
   - Aba **Empresa → Identificação**:
     - CNPJ: exibir com `formatCNPJ`, armazenar via `unmask` (14 dígitos), `inputMode="numeric"`, `maxLength={18}`, `autoComplete="off"`.
     - E-mail fiscal: `type="email"`, `autoComplete="email"`, `spellCheck={false}`, trim on blur.
     - Telefone: `formatTelefone` no display, `unmask` no state, `inputMode="tel"`, `maxLength={15}`.
     - Inscrição estadual (IE): `unmask` (só dígitos), `inputMode="numeric"`.
     - CNAE principal: só dígitos, `maxLength={7}`.
     - UF: já uppercased; adicionar `maxLength={2}` e `autoComplete="address-level1"` (já OK).
   - Aba **Empresa → Endereço fiscal**:
     - CEP: `formatCEP` no display, `unmask` no state, `inputMode="numeric"`, `maxLength={9}`.
     - Código IBGE do município: só dígitos, `maxLength={7}`.

2. **`src/pages/configuracoes/FiscalClientes.tsx`**
   - Bloco `STRING_FIELD_META` (renderização genérica): interceptar por `key`:
     - `fiscal_email` → `type="email"`, `spellCheck={false}`.
     - `fiscal_phone` → aplicar `formatTelefone` on change (armazenar dígitos).
     - `fiscal_postal_code` → aplicar `formatCEP` (armazenar dígitos), `maxLength={9}`.
     - demais campos permanecem inalterados.
   - Coluna "Documento" da tabela: continuar usando `maskDocument` (já mascarado por segurança — não mudar).

3. **`src/components/fiscal/documentos/RascunhoWizard.tsx`**
   - Campo "CPF/CNPJ do destinatário" (linha ~359): aplicar `formatCpfCnpj` no display, `unmask` (11/14 dígitos) no state, `inputMode="numeric"`, `maxLength={18}`.
   - Busca de cliente (SearchCliente, linha ~604): manter texto livre (aceita nome ou documento), sem máscara forçada.

### Padrão técnico

Handler típico para campos com máscara + valor normalizado:

```ts
onChange={(e) => {
  const digits = unmask(e.target.value);
  set("cnpj", digits.slice(0, 14));
}}
value={formatCNPJ(values.cnpj ?? "")}
```

Isso preserva o contrato dos schemas Zod (que já esperam dígitos ou aplicam `normalizeCnpj`).

## Fora do escopo

- CPF/CNPJ do cliente na listagem fiscal — mantém `maskDocument` (LGPD, propositalmente redigido).
- Fingerprints/serials de certificado — mantêm máscara de segurança atual.
- Novos utilitários em `src/lib/masks.ts` — funções existentes já cobrem os casos.
- Migrations, RLS, RPCs, edge functions.

## Validação

- `bun run typecheck`
- `bun run build`
- `bunx vitest run` (garantir que os 804 testes continuam passando; nenhum é alterado).
- Screenshot manual (Playwright) de `/configuracoes/fiscal/empresa` aba Empresa + aba Certificado para confirmar visual das máscaras.
