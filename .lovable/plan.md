# Importar Tabela A.R Bio 2026 — Microrganismos

## Escopo
Popular a tabela `microrganismos` (já existente) com os 24 registros do PDF `Tabela_A.R_Bio_2026.pdf` — 14 bactérias + 10 fungos. **Não** alterar schema, RLS, triggers, hooks, tipos, fichas técnicas nem o formulário do `MicrorganismosTab`. Reuso total dos campos já mapeados.

## Origem dos dados (PDF)
- Bactérias: 14 espécies, dose 100 mL/ha, UFC/mL e valor/dose conforme tabela.
- Fungos: 10 espécies (inclui "E.M — Microrganismos Eficientes" como consórcio), dose 100 mL/ha.
- Todos com `fornecedor = "A.R Biotecnologia"`, `safra_referencia = "2026"`, `meio_cultivo = "líquido e sólido"`, `producao_on_farm = true`.

## Estratégia
Import idempotente **client-side**, executado por usuário `administrador` autenticado, sem SQL direto no banco e sem migration:

1. Novo arquivo `src/lib/protocolos/seedMicrorganismosARBio2026.ts` — array tipado com os 24 registros já parseados (nome, `nome_cientifico`, `tipo` = `bacteria`|`fungo`|`consorcio`, `concentracao_ufc_ml` em notação decimal, `dose_ml_ha: 100`, `valor_dose_brl`, defaults acima).
2. Novo botão discreto **"Importar Tabela A.R Bio 2026"** no cabeçalho de `src/components/protocolos/MicrorganismosTab.tsx` (ao lado de "Exportar PDF"), visível apenas quando `canManage` (mesma regra dos botões existentes).
3. Handler faz `upsert` em `microrganismos` com `onConflict: "nome"` — cria os que faltam e atualiza UFC/dose/valor dos existentes; não sobrescreve `codigo` (deixa trigger gerar quando novo) nem `b2b_enabled`/`ativo` de registros pré-existentes.
4. Toast com resumo `inseridos: X · atualizados: Y` e refetch da lista. Recalcula `valor_litro_brl = valor_dose_brl * 10` via `recalcPricing` já usado no arquivo.

## Detalhes técnicos
- `concentracao_ufc_ml` armazenado em decimal (ex.: `3,4×10¹⁰` → `3.4e10`); `concentracao_label` fica `null` (o display usa `formatConcentracaoDisplay`).
- `tipo` mapeado: bactérias → `bacteria`; fungos → `fungo`; "E.M (Microrganismos Eficientes)" → `consorcio`.
- Sem alterações em `MicroorganismTechnicalProfileDialog` — fichas técnicas continuam sendo preenchidas manualmente depois; o import só cria o registro base.
- Sem chamadas a Edge Functions, sem novos secrets, sem alteração de rota.

## Validação
- `bunx tsgo --noEmit`
- `bun run build`
- `bunx vitest run` (suíte completa)
- Verificação manual: acessar `/protocolos` → aba Microrganismos → clicar "Importar Tabela A.R Bio 2026" → confirmar 24 linhas presentes.

## Fora de escopo
- Nenhuma migration SQL.
- Sem tocar em `produtos`, fichas técnicas, catálogo B2B, RLS ou trigger de código.
- Sem importar campos ausentes no PDF (função agronômica detalhada, alvos, culturas) — permanecem em branco para preenchimento posterior.
