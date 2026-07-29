## Objetivo

Hoje a base já tem `src/lib/catalogo/unidades.ts` (unidade canônica + rótulos) e `src/lib/catalogo/pricing.ts` (conversões e `resolverCustoHa`), mas a formatação de números, o arredondamento e os textos de custo por hectare continuam espalhados: há `toFixed(2)` ad hoc em `AddToCartDialog`, `usePartnerPrices`, `PrecoComDesconto`, `DashboardTecnico`, `SimuladorComercial`; sufixos `/L` escritos à mão; e a frase "Custo estimado por hectare" fixada dentro de `FichaProdutorDrawer`. Os PDFs de catálogo montam os próprios "—" e conversões.

A entrega é um único ponto de verdade para formatar, arredondar e rotular preços por unidade e custo/ha.

## O que será feito

### 1. Utilitário único
Criar `src/lib/catalogo/formatUnidades.ts`, reexportando também o que já existe em `unidades.ts` e `pricing.ts`, para que as telas importem de um só lugar. Ele concentra:

- **Arredondamento**: `round2` (moeda), `roundDose` (mL, 0 casas), `roundArea` (ha, 2 casas), `roundVolume` (L, 3 casas) — sempre half-up determinístico, substituindo os `Number(x.toFixed(2))` espalhados.
- **Formatação**: `formatarMoeda` (reusa `brl`), `formatarDose(mL)` → "100 mL/ha", `formatarArea(ha)` → "12,50 ha", `formatarVolume(L)`, `formatarPrecoUnitario(valor, unidade)` (já existe) e `formatarPrecoOuTraco` para placeholders "—".
- **Labels canônicos**: `LABEL_CUSTO_HA` ("Custo estimado por hectare"), `LABEL_CUSTO_HA_CURTO` ("Custo/ha"), `SOB_CONSULTA_LABEL`, `PLACEHOLDER_VAZIO` ("—"), e o rodapé de referência "1 L = 10 doses de 100 mL".
- **Composição**: `formatarCustoHa(input)` que chama `resolverCustoHa` e devolve `{ valor, texto, sobConsulta }`, com "Sob consulta" quando não há valor válido — nunca `R$ 0,00`.

### 2. Adoção nas telas
Trocar a lógica local por chamadas ao utilitário em:
- `src/components/catalogo/FichaProdutorDrawer.tsx` (label e custo/ha, remover o `?? 0`)
- `src/components/catalogo/AddToCartDialog.tsx` (arredondamentos, sufixo `/L`)
- `src/components/comercial/PrecoComDesconto.tsx`, `ParceiroPrecosTab.tsx`, `MatrizPrecosTab.tsx` (sufixos e unidades vindas de `UNIDADES_PRECO`)
- `src/hooks/usePartnerPrices.ts`, `src/hooks/usePartnerCatalog.ts`
- `src/pages/portal-parceiro/NovoPedido.tsx`, `DashboardTecnico.tsx`, `src/pages/comercial/SimuladorComercial.tsx`
- `src/components/catalogo/CatalogoCardsGrid.tsx` e demais grids de catálogo

### 3. PDFs
`catalogoProdutosPdf.ts`, `catalogoMicrorganismosPdf.ts`, `pedidoPdf.ts` e `simulacaoPdf.ts` passam a usar os mesmos formatadores, placeholders e o texto de referência — eliminando `R$ ${x.toFixed(2)}` e "—" locais.

### 4. Testes
Novo `src/test/catalogo/formatUnidades.test.ts` cobrindo arredondamento (bordas .005), sob consulta, conversões dose↔litro↔hectare, microrganismo com dose referencial e placeholders.

## Detalhes técnicos

- Nenhuma alteração de banco, RPC, rota ou permissão; escopo estritamente frontend/apresentação.
- Regras de precedência de preço e `resolverCustoHa`/`resolverUnidadePreco` permanecem como estão; o novo módulo apenas formata em cima delas.
- Arredondamento de moeda continua em 2 casas half-up, mantendo compatibilidade com os totais validados no servidor (nenhum valor enviado ao backend muda de cálculo).
- Validação final: typecheck, build e Vitest (esperado manter o baseline atual, com as falhas pré-existentes de fiscal/sinief49).
