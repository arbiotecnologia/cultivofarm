# Ativação local focal — 20/10/2026

Recibo do proprietário: revisão 31700a, PRE/POST hosted integrais PASS e migration `manual_lot_canonical_generation_reviewed` aplicada exclusivamente em `swzpzcwiasxmjutrmvkm`. Não reaplicada pelo agente.

Aplicados quatro arquivos frontend-candidate revisados. Alterações adicionais nesses bytes: somente gate `MANUAL_LOT_GENERATION_REVIEWED=true`, `DialogDescription asChild/div` no lote e descrição acessível na OS. Os candidatos OFF e seus hashes originais permanecem congelados.

Manifesto: seis arquivos principais (quatro runtime + dois novos testes). Um sétimo arquivo de teste legado precisou de atualização: retiradas duas expectativas de texto de implementação substituídas pelos testes comportamentais de clique duplo e resposta canônica; não houve mudança adicional de runtime.

248/248 testes em 12 arquivos; 51 testes novos focais incluindo OS→Gerar Lote→RPC→refresh com transporte/sessão simulados. Não é homologação JWT/RLS/browser. Build automático OK. Typechecks não executados manualmente: reservados ao harness da plataforma; confirmação independente pendente.

Rollback local: restaurar os quatro arquivos runtime e o teste legado dos bytes `rollback/**/*.review`, remover somente os dois testes novos. Fecha novamente a UI; não executa rollback SQL, não toca históricos nem contenções.

Monitor, bindings, demais gates, anexos, termos e backend preservados. CQ/envase e contratos seguem fora do recorte. Lote legado informado preservado sem reparo; nenhuma fixture criada, sessão recarregada, publicação, deploy ou SQL pelo agente. Publicação aguarda comparação independente.

Commits são gerenciados automaticamente pela plataforma; a ref observada consta do manifesto e deve ser reconferida antes da publicação.
