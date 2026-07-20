# Esteira Laboratorial e Fluxo de Produção - AR Bio

## Visão Geral
A esteira laboratorial coordena o ciclo de vida das Ordens de Serviço (OS), desde a programação inicial até a entrega on-farm e finalização administrativa.

## Ciclo de Vida da OS
1. **Aberta**: OS criada via conversão de visita ou manualmente.
2. **Programada**: Data de produção definida no PCP.
3. **Em Produção**: Lote iniciado e em fermentação/processamento.
4. **Aguardando CQ**: Lote concluído aguardando análise de qualidade.
5. **CQ Aprovado / Reprovado**: Resultado da análise laboratorial.
6. **Envase**: Produto pronto aguardando embalagem e identificação.
7. **Pronto Entrega**: Produto em estoque físico disponível para logística.
8. **Entrega Pendente**: Produto expedido aguardando confirmação no campo.
9. **Entregue**: Recebimento confirmado pelo cliente/consultor.
10. **Finalizada**: OS encerrada administrativamente (requer `pode_finalizar`).

## Regras de Finalização (Fase 11.9.2)
- **Pode Finalizar**: Flag automática baseada na entrega confirmada e ausência de bloqueios técnicos.
- **Finalização Não-Bloqueante**: A aplicação on-farm (pós-entrega) é tratada como pendência informativa e **não bloqueia** a finalização laboratorial nem a logística.
- **Automação**: Uma OS entregue sem pendências críticas é marcada como `pode_finalizar = true`.

## Gestão de Estoque
- O estoque é alimentado automaticamente ao final do processo de Envase/Pronto Entrega.
- As views de BI consultam o `volume_total` em litros (convertido de ml).
- O volume em estoque é global e não segregado por cliente se não houver reserva física explícita.

## Auditoria e Gargalos
- **Bloqueios Reais**: CQ Reprovado, Atraso PCP, Falta de Insumo (Estoque).
- **Pendências Informativas**: Falta de registro de aplicação no campo (não gera gargalo crítico na esteira).
- **Severidade**: Definida pela gravidade do impedimento no fluxo de entrega.