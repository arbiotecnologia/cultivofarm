# dbb81a9 — caller de OS de revenda, INATIVO / NÃO APROVADO

## Auditoria do caminho existente

Fontes lidas nesta rodada, sem consulta hospedada:

- `src/pages/OrdensServico.tsx:267–294`: criação agronômica por INSERT de cliente/fazenda/talhão, área e volume. Não aceita pedido/item B2B nem deve ser usado para criar OS pronta de revenda.
- `src/hooks/useEsteiraLaboratorio.ts:884–904`: chama `rpc_programar_os_v1` para programação; não cria OS.
- `scripts/os-delivery-reopening-20261027/live/public.rpc_programar_os_v1.sql.review`: captura histórica contém reautorização h15/RBAC/SaaS, mas nega B2B/links e exige programação preexistente + produto fabricável biológico. Não contornar essa negação nem fabricar programação/CQ para produto acabado.
- `resale_logistics.py:225–294`: candidato já existente cria OS específica sem fabricação através de helper privado, ticket txid e recibo. Não é RPC de cliente. Autoridade é a interseção de `b2b_internal_commercial_actor()` e `stock_motor_actor('reserva')`; esta última reutiliza `fn_estoque_pode_operar` e a feature de estoque. Não acrescentar papéis.

Conclusão limitada às fontes/capturas locais: **não foi encontrado caller público compatível** com essa criação de OS de revenda. Isso não atesta ausência no catálogo LIVE atual. O auditor deve recapturar overloads/callers antes de decidir implantação.

## Candidato mínimo

`os_endpoint.py` gera `public.rpc_b2b_resale_os_create_v1(uuid,uuid,timestamptz,text)` somente contra composição PostgreSQL descartável, com PRE pinando corpo/owner/ACL do helper e três dependências. Nenhuma alteração em `supabase/migrations`, cliente, rotas ou SQL B3.

Contrato: `p_order_id`, `p_order_item_id`, `p_expected_updated_at`, `p_request_key`. Sem ator, tenant, preço, quantidade, status ou atestação enviados pelo navegador. Sessão via `auth.uid()`; organização exclusivamente pelo motor existente. Read committed obrigatório. Locks request→item advisory→pedido→item row, rechecagem de sessão/tenant/autoridade/gate/origem antes de chamar o helper. O helper conserva seu CAS, ticket/INSERT e recibo; endpoint mede ACK e reautoriza após retorno. Replay também exige origem atual e aprovação, sem devolver recibo a revogado. Estado entregue é admitido somente para recuperação do recibo existente; helper não cria nova OS nesse estado.

Único delta de ACL proposto: EXECUTE do **endpoint novo** para `authenticated`; funções privadas mantêm ACL exatamente como capturada, sem EXECUTE para authenticated/service_role/PUBLIC/anon. Nenhum papel, grant temporário ou helper global ampliado. O gate logístico permanece OFF ao instalar e ao concluir testes.

`ui-candidate/ResaleOsAction.tsx` é uma chamada revisável **fora do runtime**: botão usa cliente canônico, versão observada, key retida, lock síncrono, fence ator/tenant/epoch e ACK exato. Erro/conflito mantém a tentativa sem salvar/rebase automático. Não importado por App, páginas ou rotas. A disponibilidade deve vir de um contrato server-side revisado da lista canônica; um booleano local não autoriza nem constitui capability. A montagem real fica bloqueada até esse contrato/leitor e continuidade da tentativa através de remount serem revisados.

## Dependências e reversão

1. Capturas exatas atuais de h15/roles/readiness/stock e origem C2, catálogo por empresa, B3 e fence contábil; snapshots íntegros.
2. Candidato logístico de revenda e físico, motor/batch de estoque, grupo/envio físico/prova/confirmação com contratos/ACL/Storage revisados. Não liberar automaticamente suas capabilities ou outros writers.
3. Contrato de leitura da carteira/lista operacional capaz de fornecer pedido/item/updated_at/OS no tenant vendedor. Não fazer SELECT privado ou usar IDs de URL como autorização.
4. Contabilidade de homolog validada pelo processo autorizado, não por agente, SQL de fixture hospedado ou superadmin. Pedido pendente/sem aprovação fica negado. Fiscal positivo continua NOT_RUN_BLOCKED_REAL_ALWAYS_DENY.

`os-endpoint/04-rollback-deny.sql.review`: revoga endpoint e fecha gate numa transação. Não apaga OS, estoque, entregas, comprovantes, tickets históricos, recibos ou snapshots; não restaura corpos vulneráveis nem reabre vazamento de planos. Retirar botão antes/depois da reversão não equivale à proteção servidor. Provas fiscais e de planos permanecem pacotes independentes.

## Limites de evidência

PG local usa `SET ROLE authenticated` com auth.uid/JWT sintéticos e Storage/schema/fixture declarados. O endpoint executado é real SQL candidato, sem stub de writer, mas isso **não prova** JWT/PostgREST/RLS/Storage/browser hospedados. Alguns carregamentos de fixtures do harness herdado usam triggers desligados; no dispatch dos testes as guards reais estão habilitadas. Não promover essa carga a prova de provisão/contabilidade. Não usar o resultado como autorização hosted ou publicação.