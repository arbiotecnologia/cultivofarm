# Cockpit Laboratório — riscos bloqueados (não executados)

Nada aqui foi aplicado. Requer decisão técnica e acesso ao banco.

1. **CQ não transacional** — `RegistrarCQDialog` insere em `controle_qualidade` e só depois avança a esteira; falha intermediária deixa laudo órfão. Correção real: RPC transacional `rpc_cockpit_registrar_cq_v1` com chave de idempotência.
2. **`assumirProducao` com caminho não auditado** — existe atualização direta além da RPC; unificar no motor auditado exige contrato de servidor.
3. **Métricas do universo autorizado** — os indicadores refletem o recorte carregado. Uma RPC agregadora com os mesmos filtros evitaria divergência com o total.
4. **Unidades divergentes** — `envase.volume` em mL e `estoque_produto.volume_total` em litros; padronizar exige migração e revisão de leitura.
5. **Reconciliação de vínculos órfãos** (pedido/planejamento/OS/lote/CQ/envase/estoque/entrega) e índices de suporte à esteira.
6. **Permissões** — validar RLS por perfil para leitura da esteira e das ações; o frontend não pode ser a única barreira.
