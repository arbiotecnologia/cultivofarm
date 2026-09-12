# Monitoramento (/monitoramento-alertas) — riscos e scripts preparados

Status: **NÃO EXECUTADO**. Nenhum script deste diretório foi aplicado ao banco.

## Riscos que o frontend não pode resolver

1. **Reprogramação não atômica** — a ação grava em `alertas_agronomicos` e,
   quando há visita de origem, em `registros_consultor.data_proxima_visita`.
   São duas chamadas separadas: falha na segunda deixa as datas divergentes.
   Mitigação atual: a atualização do alerta é condicionada a
   `status = 'monitoramento'`, abortando quando outro usuário já concluiu o
   item. Correção definitiva exige RPC transacional `SECURITY DEFINER`.
2. **Ausência de idempotência** — não há chave de idempotência; um reenvio por
   rede pode reaplicar a reprogramação. O frontend bloqueia duplo clique e
   fechamento do diálogo durante o envio, o que não cobre reenvio de rede.
3. **Validação de data só no cliente** — "não anterior a hoje" e "diferente da
   data atual" são validadas na tela. Sem CHECK/trigger, um cliente adulterado
   pode gravar data passada.
4. **Fuso horário no servidor** — a tela passou a classificar vencimento pelo
   dia civil em America/Sao_Paulo. Qualquer job/cron que gere ou vença alertas
   deve usar o mesmo fuso; isso não foi verificado e pode divergir da tela.
5. **Ações ausentes no contrato** — não existem hoje ações de "concluir" ou
   "reavaliar" nesta superfície; o contrato disponível expõe apenas
   reprogramar e abrir o roteiro da visita de origem. Nada foi inventado.
6. **Autorização por perfil** — o acesso é controlado pela rota; a garantia real
   de quem pode reprogramar depende das policies RLS de `alertas_agronomicos`
   e `registros_consultor`, não verificadas aqui.

## Scripts preparados (não executar)

- `01_PREPARADO_monitoramento_diagnostico.sql` — somente leitura: alertas em
  monitoramento sem data, datas divergentes entre alerta e visita de origem,
  vínculos órfãos e status fora do conjunto usado pela tela.
