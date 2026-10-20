# Escrita manual e concorrência — revisão, não implantação

## Contenção administrativa já implantada
Recibo do proprietário: `lotes_administrative_acl_containment`, PRE/POST e aplicação concluídos. ACL confirmada em leitura canônica e congelada em `catalog.json`. Agente não reaplicou migration. DML e policies preservados; rollback não toca ACL de tabela.

## Falha reproduzida e correção focal
No PostgreSQL descartável, papel SQL authenticated+administrador com policies staff capturadas consegue inserir lote manual sem evento e mudar status para aprovado sem CQ quando o guard candidato é removido. Com guard, as duas operações recebem 42501; INSERT que usa programação de outro tenant e UPDATE de status/item/volume/tenant/desvinculação também são negados. SELECT same-tenant permanece, tenant alheio fica invisível.

Somente a RPC revisada insere ticket `manual_lot_insert_v1` com txid e UUID alvo na tabela privada existente. O trigger DEFINER verifica ticket, cadeia ator/tenant/cliente/programação, item e estados. Ticket é removido após INSERT e revertido em falha. Authenticated não tem acesso à tabela nem EXECUTE do trigger; GUC forjada não autoriza. Owner postgres continua administrador do banco, não é modelo de atacante.

## Inventário e impacto: não revogar DML global
Leitores `Lotes`, `Estoque`, `EnvasePage`, `ControleQualidade`, `ReservaDialog`, `useEsteiraLaboratorio` e BI mantêm SELECT/policies. Hook existente lê lotes para CQ/envase; atualizações de programação continuam fora desta certificação.

Escritores identificados na leitura de corpos e histórico local:

| Escritor | Impacto do guard candidato |
| --- | --- |
| `rpc_cockpit_gerar_lote_v1` | INSERT manual apenas no corpo revisado com ticket; assinatura original preservada |
| `_rpc_avancar_esteira_laboratorio_internal` | UPDATE manual negado; avanço service-only não é liberado nem certificado |
| `fn_sync_os_classica_downstream` | INSERT/UPDATE manual sem ticket negado; tentativa de avanço da OS com efeito lote reverte atomicamente |
| `fn_cq_aprovado_avanca_os` / `fn_envase_avanca_os` | UPDATE de lote manual negado; CQ/envase posteriores permanecem fechados neste recorte |
| `sync_os_onfarm_downstream` | Branch não manual não recebe ticket nem novos grants; não homologado; cruzar lote manual para branch não manual é bloqueado |
| REST INSERT/UPDATE manual | Negado mesmo com policies permissivas ou caller service_role |

Não há exceção genérica por role, `current_user`, claims ou flag. **NO-GO** se houver necessidade de operar esses escritores sobre lotes manuais já existentes: requer revisão individual, não abrir bypass no trigger. Não foi feito inventário completo de todos clientes externos; o catálogo não é declaração de integridade global.

## Prova PostgreSQL com duas conexões
Harness instala constraints/FKs capturadas e corpo RPC real candidato. A sessão RPC segura OS FOR UPDATE, executa todas as verificações e INSERT, depois aguarda antes de COMMIT. Outra sessão tenta inserir programação, production_order_link, entrega ou aplicação com FK para a OS. Em todos, `pg_stat_activity.wait_event_type='Lock'` é observado antes do commit da RPC; depois o escritor pode concluir. Na ordem inversa, writer detém OS e insere filho; RPC espera, relê após locks e não cria lote.

FOR UPDATE conflita com KEY SHARE da FK não diferível. FKs/schema da OS/programação/link/entrega/aplicação são guardados por hashes no PRE/POST. Prova é PG real local com Auth sintético, não conexão hospedada nem browser. Não cobre FK desativada por administrador, escritor privilegiado que altere triggers, mudanças posteriores de programação ou throughput. Lock das FKs impede phantom **durante** a transação, não obriga futuras operações a preservar ausência. Replay após novos filhos não recebe aprovação automática.

## Critérios de liberação
Revisão independente do guard e impactos → PRE canônico atual → aplicação explicitamente autorizada pelo proprietário → POST → provas autenticadas A/B → autorização específica para somente gate manual. Restante OFF. Rollback fecha operação e retém proteção/histórico. Zero dados operacionais hospedados criados; PDF/lote ainda não homologados.