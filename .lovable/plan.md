Simplificação da coluna "Valores" em Microrganismos

Objetivo: Remover a informação redundante de volume ("/ha" e "/100 mL") da coluna "Valores" na aba de Microrganismos, já que a coluna "Dose (mL/ha)" já fornece o contexto de volume. Exibir apenas o valor monetário em R$.

Escopo escolhido: exibir um único valor por linha — o custo por hectare (custo/ha) — formatado como R$ sem qualquer sufixo de unidade. Se todos os valores de custo estiverem ausentes, mostrar "—".

Arquivos alterados:
- src/components/protocolos/MicrorganismosTab.tsx

Implementação:
1. Localizar o bloco de renderização da coluna "Valores" (linhas ~567–579) que atualmente exibe duas linhas: custo/ha e custo/100 mL.
2. Substituir por uma única linha que renderiza o custo por hectare via calcularCustoHa(m.dose_ml_ha, dose) usando brl(), sem sufixo "/ha" ou "/100 mL".
3. Manter a lógica de fallback: dose = m.valor_dose_brl ?? (m.valor_litro_brl / 10). Se não houver valor, exibir "—".
4. Manter inalterados: coluna "Dose (mL/ha)", coluna "Ref.", botões de ação e diálogo de edição.

Validação:
- Executar typecheck e build.
- Verificar visualmente no preview se a coluna Valores exibe apenas o valor em R$ sem duplicatas ou sufixos.

Nota: Não alterar a aba Produtos (layout de referência), pois o pedido específico é sobre Microrganismos.