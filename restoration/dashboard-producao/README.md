# Dashboard Produção B2B — riscos bloqueados (NÃO EXECUTADO)

Escopo desta auditoria: apenas correções de frontend. Nenhuma migration, RPC, índice,
view ou reconciliação foi aplicada. Nada foi publicado nem sincronizado.

## Dependências de servidor (documentadas, sem execução)

1. **Semana/mês fora de America/Sao_Paulo**
   `rpc_b2b_capacity_kpis` usa `date_trunc('week'|'month', now())` no fuso do servidor
   (UTC). Pedidos finalizados entre 21:00 e 23:59 (BRT) do último dia do mês migram para
   o período seguinte. Correção exige alterar a função para
   `date_trunc('week', now() AT TIME ZONE 'America/Sao_Paulo')` com o retorno convertido
   de volta para timestamptz. Requer migration — não feita.

2. **`litros_entregues` com escopo divergente**
   Os demais litros filtram `origem = 'b2b' AND partner_order_id IS NOT NULL`, mas
   `litros_entregues` soma `ordens_servico` por `partner_order_id` sem filtrar `origem`.
   Potencial divergência com "Litros produzidos". Ajuste exige migration.

3. **Volume por unidade**
   Só `ordens_servico.volume_total_ml` é inequivocamente volumétrico. Itens sem volume
   registrado (ou com unidade não volumétrica no catálogo) simplesmente não entram nos
   totais — o frontend não converte nem assume litros. Um indicador por unidade real
   exigiria agregação nova no servidor (view/RPC) — não criada.

4. **Cancelados/rejeitados no valor financeiro**
   O cliente passou a excluir `status = 'cancelado'` do somatório e a rotular isso na
   tela. Pedidos rejeitados no fluxo comercial que não geram `production_planning` não
   aparecem aqui por contrato. Uma fonte canônica única de valor programado
   (view materializada) exigiria banco — não criada.

5. **Integridade operacional**
   `rpc_b2b_integrity_check` é `STABLE SECURITY DEFINER` com guarda de papel
   (administrador/gestor) e devolve apenas contagens — sem IDs ou dados sensíveis.
   Não há timeout no servidor; o cliente depende do timeout HTTP padrão. Índices para
   os `NOT EXISTS` (ex.: `production_order_link(ordem_servico_id)`,
   `production_timeline_events(partner_order_id)`) podem ser necessários em volume —
   avaliação e criação pendentes, não executadas.

6. **Consistência entre módulos**
   Planejamento, OS, Lotes, Envase, Estoque e Entregas derivam de tabelas distintas sem
   reconciliação transacional. Um job/RPC de reconciliação é recomendado, porém depende
   de definição de negócio — não proposto como código executável.

## Permissões

`/operacao/dashboard-producao`: administrador/gestor `rw`, producao/gestor_comercial `r`.
`rpc_b2b_capacity_kpis` aceita esses quatro papéis; `rpc_b2b_integrity_check` só
administrador/gestor. O frontend agora exibe mensagem de permissão negada em vez de
tela travada. Nenhuma alteração de permissão foi feita.
