## Objetivo
Padronizar todos os campos de Inscrição Estadual (IE) do sistema para usar `MaskedInput` com **máscara e validação específicas por UF**, com fallback para o literal `ISENTO` quando aplicável, e normalização consistente antes da persistência.

## Diagnóstico atual

Campos de IE em UI:

| # | Local | Componente atual | Situação |
|---|---|---|---|
| 1 | `src/components/clientes/ClienteFormTabs.tsx` L302 (`inscricao_estadual`) | `MaskedField mask="ie"` (genérica) | Precisa passar a usar máscara por UF |
| 2 | `src/components/comercial/ParceiroB2BFormDialog.tsx` L431 (`inscricao_estadual`) | `<Input>` cru | Fora do padrão |
| 3 | `src/pages/configuracoes/FiscalEmpresa.tsx` L525-531 (`state_registration`) | `<Input>` cru; aceita `ISENTO` | Fora do padrão |

Persistência:
- `ProdutoresTab.tsx` L165 e `Fazendas.tsx` L203 já normalizam via `unmask()`.
- `ParceiroB2BFormDialog` e `FiscalEmpresa` não normalizam.

Máscara atual `mask="ie"` em `masked-input.tsx` é única e rígida (`_________.__-__`, 13 dígitos), incompatível com o formato real de várias UFs (SP=12, RJ=8, MG=13, PR=10, RS=10, BA=8/9, etc.).

## Alterações propostas

### 1. Novo módulo `src/lib/fiscal/ie/` — máscara e validação por UF

Criar módulo puro (sem dependência de UI/DB):

- `patterns.ts` — mapa `UF → { mask: string; digits: number | number[]; example: string }` cobrindo as 27 UFs. Máscaras baseadas nos formatos oficiais publicados pela SEFAZ/Sintegra:
  - AC 13 (`__.___.___/___-__`), AL 9, AP 9, AM 9, BA 8 ou 9, CE 9, DF 13, ES 9, GO 9, MA 9, MT 11, MS 9, MG 13, PA 9, PB 9, PR 10, PE 9 (novo) / 14 (antigo), PI 9, RJ 8, RN 9 ou 10, RS 10, RO 14, RR 9, SC 9, SP 12 (industrial) / 12 iniciando por "P" (produtor rural), SE 9, TO 9 ou 11.
  - Onde houver mais de um formato válido, aceitar o comprimento correspondente e escolher a máscara dinamicamente pelo tamanho do input (mesmo padrão já usado em `telefone` 10↔11).
- `validators.ts` — `validateIE(uf, value)` implementando o algoritmo de dígito verificador (DV) específico de cada UF (módulo 11 com pesos por UF, regras especiais para SP produtor rural iniciando com `P`, PE novo/antigo, BA 8/9 dígitos, MG com "cascata" de DV, etc.). Retorna discriminated union `{ ok: true; value: string } | { ok: false; error: string }`. Aceita literal `ISENTO` (case-insensitive, trimmed) como válido quando `allowIsento: true`.
- `normalize.ts` — `normalizeIE(uf, value)` retorna `ISENTO` | dígitos-apenas | `null`.
- `index.ts` — reexport.

Cobertura de testes unitários (`src/test/lib/fiscal-ie.test.ts`) com pelo menos 1 caso válido + 1 inválido + 1 DV incorreto por UF, além de `ISENTO` e vazio.

### 2. Componente `MaskedInput` — máscara IE dinâmica por UF

- Estender `MaskedInputProps` com `uf?: string` opcional (usado apenas quando `mask="ie"`).
- `resolveMaskPattern("ie", raw, { uf })` consulta `patterns.ts`; quando UF não informada ou desconhecida, mantém a máscara genérica atual como fallback (retrocompatibilidade).
- Suporte a máscaras de múltiplos comprimentos: escolha por `clean.length` (mesmo mecanismo do `telefone`).

### 3. Componentes de formulário

Para cada um dos 3 pontos:
- Ler a UF do próprio formulário (`endereco_estado`, `estado`, `state_uf`, conforme já existente no schema local — sem novas colunas).
- Passar `<MaskedInput mask="ie" uf={form.endereco_estado} placeholder={patterns[uf]?.example ?? "Inscrição estadual"} />` (ou `MaskedField` no caso do RHF em `ClienteFormTabs`).
- No blur/submit, chamar `validateIE(uf, value, { allowIsento: true })`. Em caso de erro, exibir `toast.error` (ou `form.setError`) com mensagem pt-BR incluindo o exemplo daquela UF.
- Persistir via `normalizeIE(uf, value)` (dígitos, `ISENTO` ou `null`).

Escopo por arquivo:
- `src/components/clientes/ClienteFormTabs.tsx`: adicionar `uf` derivado de `endereco_estado`; validação no submit já centralizado no `ProdutoresTab.tsx` (substituir `unmask(...)` por `normalizeIE(uf, ...)` + `validateIE`).
- `src/components/comercial/ParceiroB2BFormDialog.tsx`: trocar `<Input>` por `<MaskedInput mask="ie" uf={form.endereco_estado} />`; validar/normalizar em `handleSubmit`.
- `src/pages/configuracoes/FiscalEmpresa.tsx`: usar `<MaskedInput mask="ie" uf={values.state} />`; `allowIsento: true`; preservar `ISENTO` uppercase no salvamento.
- `src/pages/Fazendas.tsx` L203: sem input UI hoje; **manter apenas** a normalização — trocar `unmask(...)` por `normalizeIE(uf, ...)` usando `estado` da fazenda, para consistência.

### 4. Comportamento sem UF selecionada
- Se a UF ainda não estiver preenchida, o input aceita dígitos livres (máscara genérica) e a validação por DV é adiada; no submit, se ainda faltar UF, exibir toast pedindo para selecionar o Estado antes de validar a IE.

## Validação
- `bun run typecheck` + `bun run build`.
- Suíte Vitest completa + novo arquivo `fiscal-ie.test.ts` cobrindo as 27 UFs.
- Inspeção Playwright nos 3 diálogos: trocar UF e confirmar que a máscara se ajusta e a validação bloqueia DV inválido.

## Fora de escopo
- Alterações em schema, RLS, migrations, ou colunas novas para armazenar UF-da-IE (usa-se a UF do endereço já existente).
- Consulta on-line ao Sintegra/SEFAZ.
- Nenhuma alteração em regras de negócio fiscais além da validação sintática/DV.
