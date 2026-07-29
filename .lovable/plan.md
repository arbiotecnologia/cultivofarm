## Objetivo

Hoje cada tela decide por conta própria qual unidade mostrar ("/ha", "/dose 100 mL", "/dose", "/un"), como converter dose ↔ litro ↔ hectare e o que fazer quando não há preço. O resultado é divergência entre catálogo B2B, simulador, precificação comercial, ficha do produtor e PDFs. A proposta é criar uma fonte única de verdade para unidade + conversão + rótulo, e ligá-la em todas as telas, incluindo o caso "sob consulta".

## Estado atual verificado

- `get_partner_catalog_secure` (gestor parceiro) devolve apenas `hectare` e `dose_100ml` — nunca `litro` nem `sob_consulta`.
- `get_partner_catalog_tecnico_secure` já devolve `hectare`, `litro`, `dose_100ml` e `sob_consulta` (corrigida na última entrega).
- `usePartnerCatalogTecnico` ignora a unidade vinda do banco e recalcula pelo tipo do item ("produto → hectare, senão dose").
- `NovoPedido` ignora `unidade_preco_principal` e usa `p.item_tipo === "produto" ? "/ha" : "/dose 100 mL"`; trata "Sob consulta" apenas quando o valor é ≤ 0.
- `ParceiroPrecosTab` usa rótulos fixos `/ha` (produtos) e `/dose` (microrganismos).
- `usePartnerPrices` deriva a base sugerida de produto por três caminhos, mas para microrganismo usa só `valor_dose_brl` e força `dose_ml_ha: null`, mesmo quando o microrganismo tem dose cadastrada.
- `FichaProdutorDrawer` só mostra custo/ha quando existem dose e valor da dose; se o item tiver apenas `valor_ha_brl`, o custo não aparece.
- PDFs (`catalogoProdutosPdf`, `catalogoMicrorganismosPdf`, `fichaTecnicaProdutoPdf`, `fichaTecnicaMicrorganismoPdf`, `pedidoPdf`) têm cabeçalhos e formatações próprias, e `pedidoPdf` imprime a unidade crua do banco ("dose", "unidade").
- Nenhum ponto do sistema exibe "Sob consulta" de forma consistente: em algumas telas aparece preço zerado.

## O que será feito

### 1. Módulo canônico de unidades (`src/lib/catalogo/unidades.ts`)

Uma única definição usada por telas, PDFs e hooks:

- Tipo `UnidadePreco = "hectare" | "litro" | "dose_100ml" | "volume_comercial" | "sob_consulta"`.
- Rótulos padronizados: curto (`/ha`, `/L`, `/dose 100 mL`, `/un`), longo ("por hectare", "por litro", "por dose de 100 mL", "por volume comercial") e o texto único "Sob consulta".
- `resolveUnidadePreco(item)`: usa a unidade vinda do backend quando existir; senão aplica a mesma precedência do banco (ha > litro > dose > volume) e cai em `sob_consulta` quando nenhum valor positivo existe.
- `mapUnidadeParaPedido()`: conversão única para o `unidade_medida` aceito pelo pedido/simulação (`hectare | litro | dose | unidade`), hoje duplicada em três lugares.
- `formatPrecoUnidade(valor, unidade)`: devolve "Sob consulta" quando não há valor, evitando "R$ 0,00".

### 2. Conversões unificadas

Estender `src/lib/catalogo/pricing.ts` (já tem dose ↔ litro ↔ ha) com o que hoje está espalhado:

- `custoHaDeLitro(doseMlHa, valorLitro)` (usado hoje só dentro de `usePartnerPrices`).
- `resolverCustoHa(item)`: ordem única — `valor_ha_brl` explícito → dose × valor da dose → dose × valor do litro → `null`.
- `doseHaReferencial(item)`: substitui o cálculo ad-hoc de `NovoPedido`, incluindo o padrão de 1 dose/ha para microrganismos sem dose cadastrada.
- Arredondamento único em 2 casas para valores monetários derivados.

### 3. Backend: alinhar a RPC do gestor parceiro

Migration em staging para `get_partner_catalog_secure` devolver a mesma escala de unidades da RPC do técnico (`hectare`, `litro`, `dose_100ml`, `sob_consulta`) e o custo por hectare de microrganismos derivado da dose, para as duas telas nunca discordarem sobre o mesmo item.

### 4. Telas ligadas ao módulo

| Tela | Ajuste |
| --- | --- |
| Catálogo/Novo Pedido/Simulador B2B | Unidade vinda do backend, bloco de preço com "Sob consulta" real e linhas de equivalência (dose/litro/ha) montadas pelo helper |
| Catálogo do técnico | Deixa de recalcular a unidade e passa a respeitar a do backend |
| Preços do parceiro (comercial) | Rótulos vindos do helper em vez de `/ha` e `/dose` fixos; base sugerida de microrganismo passa a considerar dose cadastrada |
| Ficha técnica do produtor | Custo/ha via `resolverCustoHa`, exibindo também quando só existe valor por hectare, e "Sob consulta" quando não houver preço |
| Meus Pedidos / Histórico de Simulações | Quantidade acompanhada do rótulo padronizado da unidade |
| PDFs de catálogo, ficha, pedido e simulação | Mesmos cabeçalhos e mesma formatação de unidade/"Sob consulta" das telas |

### 5. Testes

Novo arquivo de testes cobrindo: precedência de unidade, fallback para `sob_consulta`, conversões dose ↔ litro ↔ ha nos dois sentidos, custo/ha de microrganismo por dose, e mapeamento para `unidade_medida` do pedido. Rodada completa de typecheck, build e Vitest ao final.

## Fora do escopo

Não muda regra de precificação, desconto, motor comercial, política de cotação nem qualquer permissão/RLS — apenas a unidade exibida, a conversão e o texto de indisponibilidade de preço.
