# Mover o campo Inscrição Estadual (IE) para junto da identificação da empresa

## Objetivo

Na aba Empresa da Configuração Fiscal (`/configuracoes/fiscal/empresa?aba=empresa`), o campo "Inscrição estadual (IE)" está hoje no fim do cartão "Identificação", depois da Inscrição municipal. O usuário quer a IE próxima do CNPJ, Razão social e Nome fantasia.

## Alteração

Arquivo único: `src/pages/configuracoes/FiscalEmpresa.tsx`.

1. Recortar o bloco `FieldRow id="state_registration"` (label "Inscrição estadual (IE)") da posição atual (após "Inscrição municipal (IM)").
2. Inseri-lo logo após o campo "Nome fantasia" e antes de "E-mail fiscal", na ordem:
   CNPJ → Razão social → Nome fantasia → **Inscrição estadual (IE)** → E-mail fiscal → Telefone → Regime tributário → CRT → CNAE principal → CNAEs secundários → Inscrição municipal (IM).
3. Manter intacto todo o comportamento do campo:
   - `MaskedInput` com `mask="ie"` e `uf={values.state}` (máscara depende da UF do cartão Endereço fiscal);
   - placeholder "Conforme UF selecionada (ou ISENTO)" / "Selecione a UF primeiro";
   - validação `validateIE` no blur com `allowIsento: true` e exibição do erro `aria-invalid`;
   - normalização no salvamento (`normalizeIE`) — sem alteração.

Não há mudança de validação, payload, banco, rotas ou outros campos. Inscrição municipal permanece onde está.

## Validação

- Typecheck e build.
- Vitest em `src/test/fiscal` e `src/test/config` (bateria fiscal atual: 1.796 aprovados).
- Verificação visual na prévia da aba Empresa: IE visível logo abaixo do Nome fantasia.
- Nada publicado; nenhuma alteração de banco.
