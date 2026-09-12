# Fluxo Técnico (/fluxo-tecnico) — riscos e scripts preparados

Status: **NÃO EXECUTADO**. Nenhum script deste diretório foi aplicado ao banco.

## Riscos que o frontend não pode resolver

1. **Atomicidade da decisão de aprovação** — a decisão grava em três tabelas
   (`registros_consultor`, `aprovacoes_tecnicas`,
   `registros_consultor_status_log`) em chamadas separadas. Falha parcial deixa
   status alterado sem registro de aprovação ou sem log. Mitigação atual:
   a atualização de status é feita primeiro e condicionada ao status lido
   (`.eq("status", <status lido>)`), abortando quando outro usuário já decidiu.
   Correção definitiva exige RPC transacional `SECURITY DEFINER`.
2. **Idempotência** — não há chave de idempotência na inserção em
   `aprovacoes_tecnicas`; reenvios podem duplicar a decisão. O frontend agora
   bloqueia duplo clique, mas isso não cobre reenvio por rede.
3. **Geração de OS não atômica** — `gerar_os` insere uma OS por recomendação em
   laço; falha no meio deixa OS parciais e o registro sem `convertido_os`.
   A mensagem de erro agora informa quantas OS já foram criadas, mas não há
   compensação. Correção definitiva exige RPC transacional.
4. **Transições de OS no servidor** — a ordem canônica
   `aberta → aprovada → programada → em_producao → em_cq → envase →
   pronto_entrega → entregue → finalizada` (+ `cancelada`) é validada apenas no
   cliente. Sem CHECK/trigger, um cliente adulterado pode retroceder status.
5. **Autorização** — a página permite decidir a partir de qualquer perfil com
   acesso à rota; a garantia real depende das policies RLS de
   `registros_consultor` e `aprovacoes_tecnicas`, não verificadas aqui.

## Scripts preparados (não executar)

- `01_PREPARADO_fluxo_tecnico_diagnostico.sql` — somente leitura: inconsistência
  entre recomendação aprovada e OS vinculada, OS órfãs, decisões duplicadas e
  status fora da ordem canônica.
