# Unidades — correção frontend limitada

Inspeção estática, sem banco, migrations, publicação ou GitHub.

- `ordens_servico` contém `volume_total_ml` e `area_hectares`, não um snapshot da unidade da recomendação. A migration histórica `20260508200809` removeu `recomendacao_id`.
- `produtos.dose_ml_ha` não comprova a unidade prescrita para uma OS específica. Não é usado como fallback.
- `registros_consultor_recomendacoes` possui `dose_recomendada_valor` / `dose_recomendada_unidade`, mas não há vínculo inequívoco na consulta desta OS. Não inferir pelo cliente/produto.
- `aplicacoes.volume_total_aplicado_ml` é dimensionalmente específico; não suporta gravar L, kg, g ou unidade como se fossem mL. Não existe snapshot de unidade neste contrato.

Consequência: o formulário fica bloqueado para as OS do contrato atual, com mensagem explícita. O cálculo puro admite unidades explícitas por hectare, sem conversão, mas não representa integração multiunidade concluída. Nenhuma nova coluna/RPC é consultada.

Para habilitar registros multiunidade será necessário um contrato persistente ligando OS à prescrição e conservando unidade/dose/total no histórico, além de alinhar leitura/PDF. Isso está fora desta correção frontend; nenhuma migration foi preparada ou aplicada.

Troca de OS limpa dose, área, lote, calda, modo e evidências. Produto deriva da OS; lotes são filtrados por produto e validados no submit. Retificação não permite trocar OS. Datas são exibidas como hora local; timestamps são serializados para UTC somente na persistência. Data, início e fim devem pertencer ao mesmo dia, com fim estritamente posterior.

Bloqueios ambientais encontrados antes das edições: types.ts com 2.060 linhas e conexão local divergente do destino autorizado. Arquivos gerados protegidos não foram alterados. Nenhum teste autenticado ou acesso ao banco foi feito.