## Diagnóstico

O PDF anexado (`Catálogo_de_Produtos_A.R_Bio_-_FSF_Agro-2.pdf`) é idêntico à v1.3 já modelada em `src/lib/protocolos/seedCatalogoARBioV13.ts`, contendo os mesmos 7 produtos com nome, tipo, dose, modo de aplicação, valor/ha, função e composição microbiológica (volumes por cepa) exatamente como no arquivo:

- Solo 1 — 500 mL/ha — R$ 71,00
- Solo 2 — 500 mL/ha — R$ 82,00
- BioInseticida 01 — 400 mL/ha — R$ 61,00
- BioInseticida 02 — 300 mL/ha — R$ 46,00
- BioFungicida — 300 mL/ha — R$ 40,00
- BioInoculante — 100 mL/ha — R$ 40,00
- BioSolubilizador — 200 mL/ha — R$ 32,00

A aba **Protocolos → Produtos** (`src/components/protocolos/ProdutosTab.tsx`) já expõe o botão administrativo **"Recarregar Catálogo A.R Bio v1.3"**, que executa `importCatalogoARBioV13()` — mesmo pipeline que preenche `produtos` (código, nome, tipo, dose_ml_ha, modo_aplicacao, valor_ha_brl, funcao_completa) e a `produto_composicao` com volumes por microrganismo (via `nome_cientifico`), calculando `valor_dose_brl` / `valor_litro_brl` pela regra existente.

## Plano proposto

Nenhuma alteração de código, estrutura, RLS, migrations ou secrets. Só operação sobre dados:

1. Abrir **Protocolos → Produtos** com usuário administrador.
2. Se a base tiver produtos residuais, clicar antes em **Limpar órfãos** (fluxo dry-run + confirmação já implementado) para não conflitar com códigos.
3. Clicar em **Recarregar Catálogo A.R Bio v1.3** → confirmar no diálogo. O importador é idempotente: faz upsert por `codigo` e reconstrói `produto_composicao` conforme o PDF.
4. Conferir na tabela que os 7 produtos aparecem com valor/ha, dose e composição corretos; abrir 1–2 produtos para validar as cepas com volume em mL.

## Pré-requisito

A composição usa `nome_cientifico` das cepas — a tabela `microrganismos` precisa estar populada com o seed v2026 (14 bactérias + 10 fungos + E.M.) para que `produto_composicao` vincule corretamente. Se estiver vazia, rodar antes o import de microrganismos em **Protocolos → Microrganismos** (botão análogo já existente).

## Fora de escopo

- Não alterar o seed, o schema, RLS ou o valor/ha do PDF.
- Não criar migration nem edge function.
- Não publicar.

## Recomendação

Confirme para eu executar (em build mode) apenas a verificação de que o seed v1.3 bate 1:1 com o PDF anexado e, se você preferir, disparar o import via um passo automatizado — caso contrário, basta clicar no botão já disponível na UI.
