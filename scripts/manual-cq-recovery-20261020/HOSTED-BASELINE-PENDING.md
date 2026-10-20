# Montagem bloqueada — 20/10 13:11 UTC

Proprietário confirmou reprodução no schema hosted atual: transação authenticated claims B permitiu zerar `programacao_producao.ordem_servico_id` e depois alterar `lotes.volume_produzido` para 101; ROLLBACK, nada persistido, conforme recibo independente. Não é uma execução ou certificação pelo agente.

Proprietário anunciou aplicação própria da contenção mínima de identidade da programação com lote manual: preservar ordem_servico_id/ordem_servico_onfarm_id/organization_id/produto_id/microrganismo_id enquanto vinculada ao lote. **Aplicação ainda não confirmada nesta rodada.**

`assemble.py` falha antes de gerar SQL enquanto este arquivo existir. Os SQL `.review` já existentes são históricos, não representam baseline pós-contenção e não podem ser aplicados. Gate false. Nenhum DDL autorizado ou executado.

Retomada depende do recibo de sucesso e conferência read-only do corpo, assinatura, owner, ACL, trigger e hash agregado de triggers de programação. Incorporar como dependência LIVE imutável em PRE/POST/rollback, sem redefinir/remover a contenção. Só então retirar este bloqueio e regenerar para nova revisão independente. Não inferir hashes nem usar a reprodução sintética como substituto.