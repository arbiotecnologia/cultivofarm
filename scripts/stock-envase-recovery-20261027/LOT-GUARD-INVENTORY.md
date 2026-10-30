# Inventário de writers de lote/CQ/envase/OS — impacto dos guards (captura LIVE 30/10)

Fonte: varredura de `delivery-atomic-hardening-20261030/capture/current.json`, procurando INSERT/UPDATE em lotes, controle_qualidade, envase, programacao_producao e status da OS. Não há SQL dinâmico identificável nesses alvos.

| Writer | Client ACL | Alvo | Estado com guards LIVE | Equivalente / ação |
|---|---|---|---|---|
| `rpc_aprovar_os_v1` | authenticated | OS aberta→aprovada | ativo (guard de aprovação) | já canônico |
| `rpc_programar_os_v1` | authenticated | OS→programada | ativo | já canônico |
| `rpc_cockpit_gerar_lote_v1` | authenticated | INSERT lote (ticket `manual_lot_insert_v1`) | ativo | já canônico |
| `platform_private.manual_cq_v1` via `rpc_avancar_esteira_laboratorio` (`enviar_cq`/`registrar_cq`) | authenticated (wrapper) | OS→em_cq, lote/programação CQ | ativo, tickets próprios | já canônico |
| `_rpc_avancar_esteira_laboratorio_internal` `enviar_envase`/`concluir_envase` (manual) | via wrapper | OS em_cq→envase→pronto_entrega | **negado** pelo guard pai (em_cq congelado) | equivalente v2: `rpc_cockpit_registrar_envase_v1` conclui e transita pelo ticket específico; trocar caller de UI junto do grant |
| idem, etapas onfarm | via wrapper | OS onfarm | fora do guard manual; inalterado | sem mudança |
| `rpc_cockpit_registrar_envase_v1` | service_role | INSERT envase/estoque | sem cliente; v2 endurece e transita | grant pendente (liberação não autorizada) |
| `fn_sync_os_classica_downstream` (trigger) | — | programação/lote conforme status | em `envase` faz UPDATE programação→aprovado; v2 provou que passa no guard | sem mudança |
| `fn_cq_aprovado_avanca_os` (trigger CQ) | — | lote/programação/OS | manual contido pelos guards (já LIVE) | sem mudança |
| `fn_envase_avanca_os` | — | lote/programação/OS→pronto_entrega | não está anexado a nenhum trigger na captura | sem mudança |
| `sync_os_onfarm_downstream`, `fn_create_programacao_on_os_*`, `publish_planning_to_lab`, `_avancar_os_status` | service/trigger | programação/status | inalterados | sem mudança |
| `rpc_gerar_etiqueta_produto` | service_role | UPDATE envase (etiqueta) | `fn_envase_material_imutavel` protege só o material | sem mudança |

O v2 não fecha nenhum caminho hoje ativo. A única mudança de comportamento é abrir um caminho antes inexistente (envase→pronto_entrega manual) sob autoridade específica. Integrações externas fora da captura não são observáveis.
