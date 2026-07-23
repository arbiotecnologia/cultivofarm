## Objetivo
Zerar o conteúdo atual da tabela `produtos` (e suas dependências operacionais/fiscais) e recarregar exatamente os 7 produtos do Catálogo On-Farm v1.3 (PDF anexado), preservando estrutura de tabelas, RLS, políticas e componentes de UI.

## Escopo confirmado com o usuário
- **Wipe total** com cascata (lotes, ordens, aplicações, perfis fiscais, formulações, volumes, cache de preços B2B, etc.).
- **Seed idempotente + botão único** na aba Produtos (padrão usado no seed de microrganismos A.R Bio 2026).
- **Composição microbiológica vinculada** aos microrganismos já cadastrados via tabela `formulacoes` existente.

## Fase 1 — Wipe controlado (Edge Function admin)
Criar `supabase/functions/admin-wipe-produtos-catalog/index.ts`:
- Valida JWT + `has_role(auth.uid(),'administrador')`. Nega qualquer outro papel.
- Usa cliente `service_role` para executar, em transação lógica e nesta ordem (filhos → pais):
  1. `formulacoes` (composição produto↔microrganismo)
  2. `catalogo_volumes` / `produto_volumes` (se existir)
  3. `precos_parceiro`, `partner_prices`, `partner_catalog_cache`
  4. `product_technical_profiles`, `product_fiscal_profiles`
  5. `ordens_servico_itens` / `os_itens` (linhas por produto) e depois OS órfãs, se aplicável
  6. `aplicacoes` (linhas por produto)
  7. `lotes` (produção) por produto
  8. `estoque_movimentos` / `estoque_saldos` por produto
  9. `produtos` (delete final)
- A lista definitiva de tabelas dependentes será derivada de `information_schema` no início da função (introspecção de FKs que apontam para `produtos.id`) para não deixar órfãos. Cada delete registra contagem.
- Retorna JSON `{ deletedByTable: {...}, totalDeleted }` para exibição no toast.
- Sem migração de schema. Sem drop/alter.

## Fase 2 — Seed do catálogo v1.3
Criar `src/lib/protocolos/seedCatalogoARBioV13.ts` com constante `SEED_PRODUTOS_AR_BIO_V13` contendo os 7 itens do PDF:

| Código sugerido | Nome | Tipo | Dose/ha | Valor/ha | Modo aplicação |
|---|---|---|---|---|---|
| SOLO-1 | Solo 1 | bioestimulante | 500 mL | R$ 71,00 | sulco de plantio |
| SOLO-2 | Solo 2 | nematicida | 500 mL | R$ 82,00 | sulco de plantio |
| BINS-01 | BioInseticida 01 | inseticida | 400 mL | R$ 61,00 | barra |
| BINS-02 | BioInseticida 02 | inseticida | 300 mL | R$ 46,00 | barra |
| BFUN-01 | BioFungicida | fungicida | 300 mL | R$ 40,00 | barra |
| BINO-01 | BioInoculante | inoculante | 100 mL | R$ 40,00 | barra/sulco/TS |
| BSOL-01 | BioSolubilizador | solubilizador P | 200 mL | R$ 32,00 | sulco de plantio |

Cada produto carrega `funcao_completa` com o texto da coluna "Função" do PDF.

Composição (via `formulacoes`, `volume_ml` conforme PDF; soma bate com `dose_ml_ha`):
- **Solo 1**: aryabhattai 100 · subtilis 100 · velezensis 100 · T. asperellum 100 · E.M 100
- **Solo 2**: amyloliquefaciens 100 · methylotrophicus 100 · T. harzianum 100 · Paecilomyces 200
- **BioInseticida 01**: Bt kurstaki 100 · Beauveria 100 · Metarhizium 100 · E.M 100
- **BioInseticida 02**: Beauveria 100 · Isaria 100 · E.M 100
- **BioFungicida**: subtilis 100 · pumilus 100 · E.M 100
- **BioInoculante**: Methylobacterium symbioticum 100
- **BioSolubilizador**: B. megaterium 100 · Pseudomonas fluorescens 100

Função `importarCatalogoARBioV13()`:
1. Lê `microrganismos` filtrando por `nome_cientifico` das cepas usadas; se algum faltar, aborta com mensagem clara (usuário deve rodar antes o seed A.R Bio 2026).
2. Para cada produto do seed: `upsert` por `codigo` em `produtos` (ativa=true, b2b_enabled=false, e_insumo=false, `versao_catalogo="v1.3"`).
3. Repopula `formulacoes` do produto (apaga e reinsere as linhas do seed, reaproveitando `buildFormulacoesPayload`).
4. Retorna `{ inseridos, atualizados, formulacoesCriadas }`.

## Fase 3 — UI (aba Produtos)
Em `src/components/protocolos/ProdutosTab.tsx`, no toolbar visível apenas para papel `administrador`:
- Botão **"Recarregar Catálogo A.R Bio v1.3"** com `AlertDialog` de confirmação em duas etapas ("digite RECARREGAR"):
  1. Invoca `admin-wipe-produtos-catalog` e mostra contagem por tabela.
  2. Chama `importarCatalogoARBioV13()` e mostra resultado.
- Após sucesso, invalida `queryClient` de produtos e formulações; toast final com totais.
- Botão remove-se automaticamente se `versao_catalogo` de todos os produtos ativos já for `v1.3` e a contagem for 7 (evita reexecução acidental — igual pattern dos microrganismos que também foi retirado após uso).

## Fase 4 — Validação
- `bun tsgo --noEmit` (typecheck).
- `bunx vitest run` completo (esperado: mesma quantidade atual, sem regressão).
- Smoke Playwright: abrir `/protocolos`, alternar para aba Produtos, verificar catálogo antigo e presença do botão (sem clicar).

## Guard rails
- Nenhuma migration de schema, nenhuma alteração de RLS ou grants.
- Wipe restrito a administrador via Edge Function; UI protegida pelo mesmo papel.
- Se algum FK novo aparecer que não esteja no map de deleção, a introspecção em runtime cobre; caso contrário, a função aborta antes de deletar `produtos` e reporta a tabela pendente.
- Ambiente remoto (produção) permanece intocado: a operação só roda quando o admin clica no botão.

## Riscos e mitigação
- **Perda de histórico operacional/fiscal**: aceito pelo usuário (wipe total).
- **Microrganismos ausentes**: seed aborta com instrução clara para rodar o seed A.R Bio 2026 primeiro.
- **Reexecução acidental**: botão some quando catálogo já está em v1.3 com 7 itens.

## Créditos estimados
~18 créditos (Edge Function + seed + UI + validação).
