# Delta adicional de escrita — INATIVO

Continuação da publicação `a5fc8575` e da migration `monitoring_origin_canonical_sync_20261027`, instaladas pelo auditor. **Não reaplicar o pacote pai. Não executar este candidato nem publicar automaticamente.** HEAD observado nesta tarefa: `1237877b0e77c6cdb89ef2900866b99908941197`, diferente do release informado. Nenhuma mudança de runtime/Edge/fiscal/pedidos/Storage, fixtures ou dados hosted.

## Delta estritamente adicional

3 políticas **RESTRICTIVE**, somente `authenticated`, comandos separados:
- INSERT `WITH CHECK(false)`;
- UPDATE `USING(false) WITH CHECK(false)`;
- DELETE `USING(false)`.

Mantém todas as políticas anteriores, SELECT e `monitoring_tenant_boundary`. Não revoga ACL no candidato: `has_table_privilege(...,'UPDATE')` continuará true, mas RLS negará linhas. UPDATE/DELETE normalmente retornam **0 rows**, não necessariamente HTTP409/403; nunca interpretar resposta HTTP vazia como mutação bem-sucedida. INSERT sem origem → 42501; com origem a trigger anterior pode rejeitar antes em PT409. Desvincular para depois alterar data não encontra linha autorizada.

Os 5 escritores PG encontrados continuam `SECURITY DEFINER`, owner `postgres`; a tabela é owner postgres, RLS ON/FORCE OFF. Assim os fluxos canônicos conservam acesso sem depender das políticas authenticated. Nenhuma RPC de exclusão encontrada; não há fluxo novo de DELETE.

### Três RPCs antigos: gate e autoridade após espera

Captura **LIVE somente leitura** no ref validado `swzpzcwiasxmjutrmvkm`, 27/10 ~12:57–12:59 UTC. O CLI de query recusou backend externo; captura feita pelo leitor Supabase após confirmação `managed_by_lovable:false` e ref exato. Não houve SQL de escrita hosted.

| RPC | PRE MD5 LIVE | POST MD5 esperado após apenas lock_timeout |
|---|---|---|
| criação climática | b675f863360f50d58cd5358451284eff | be3fa0742fddc5f3d212e7ed53048910 |
| status | f2769829ce82c765326079a498eed0f7 | 8e6d0982d4eb9b599c703d3f715dd806 |
| reprogramação v1 | 849f31fc39e98a115cb9b317801d698e | 1bf4ebfecb645e4a0d131510122ac407 |

- Criação: verifica ator/papel/refs antes e depois do gate; aguarda advisory lock de fazenda/talhão/tipo; verifica ator/papel/refs novamente antes de inserir/deduplicar.
- Status: gate → revalida ator/papel → alerta escopado FOR UPDATE → revalida ator/papel → CAS exato → UPDATE com refs novamente. A última cláusula protege refs pós-espera; revogação de roles/perfil é serializada pelo gate comum.
- v1: gate → revalida ator/papel → alerta escopado FOR UPDATE → revalida ator/refs; origem continua PT428 antes de qualquer escrita; CAS obrigatório e UPDATE com refs. O papel foi validado após gate; o gate permanece detido até commit e a revogação canônica usa o mesmo lock.
- LIVE os três não tinham `lock_timeout`: necessário limite **3s por espera de lock**, exclusivamente via ALTER FUNCTION SET, mantendo corpo/OID/owner/ACL/search_path. Não é teto de duração total; múltiplas esperas podem somar. Statement timeout 15s limita somente instalação do delta. Nenhum lock deliberado longo em produção.

`candidate.sql.review` compara metadata pré/pós, exigindo corpo/OID/ACL/owner/SECURITY DEFINER inalterados e somente proconfig + lock_timeout=3s. PRE e POST exigem hashes exatos (os POST dos três foram calculados localmente sobre as definições LIVE exatas, não aplicados hosted).

### Cliente e serviço

Inventário: `useCriarAlertaClimatico`, `useAtualizarStatusAlerta`, `useReprogramarMonitoramento` já usam RPCs; `useOrigemAlertaAgronomico` usa o vínculo canônico. Nenhum React INSERT/UPDATE/DELETE direto encontrado.

`supabase/functions/check-monitoramentos-vencidos/index.ts:84–88` usa UPDATE direto de **nivel_risco** após `rpc_check_monitoramento_and_notify`; `_shared/auth-guard.ts:26–31,49–50,60–75` fornece serviceClient com service_role tanto para cron como chamador admin autorizado. Policies TO authenticated não afetam o service_role BYPASSRLS, confirmado LIVE. Teste preserva esse UPDATE e o guard ainda nega alteração de data vinculada pelo service_role. Edge fonte/deployment intocados.

**Limite real:** isso fecha bypass de escrita direta **authenticated**, não toda escrita privilegiada. O serviço de risco continua fora do gate global; este pacote não homologa a segurança integral dessa Edge, suas permissões de chamada ou revogação de seu administrador durante espera. Postgres/service_role não são confinados pelas políticas authenticated. Não alegar gate universal.

## PRE / POST / contenção

Executor verifica externamente ref/URL canônicos antes de SQL. PRE de catálogo sem mutações exige RLS/owner, fingerprint de todas as políticas anteriores, hashes/ACL/owners/search_path dos 5 writers, guards, triggers de revogação e service_role BYPASSRLS+UPDATE. Qualquer writer PG adicional encontrado pelo inventário textual → NO-GO (SQL dinâmico exige revisão complementar, não é provado por regex). Nova política preexistente muda fingerprint e falha: este delta é **one-shot fail-closed**, não restaura nem altera política em reaplicação.

POST exige exatamente as 3 negações, fingerprint anterior intacto, hashes novos dos 3 antigos e hashes intactos dos cores/guards. Contenção mantém políticas, guards/tickets/histórico e timeouts; revoga DML authenticated/anon e EXECUTE authenticated/PUBLIC/anon de entradas **e cores** de mutação. Não restaura vulnerabilidade; conserva SELECT e risco service_role. Não é reversão funcional: fluxo usuário fica indisponível até forward-fix revisado.

## Evidências discriminadas

- PostgreSQL descartável/Auth sintética/schema reduzido: **141/141 checks**, dos quais **87 herdados** antes do delta e **54 adicionais**. `python3 scripts/visit-monitoring-plan-20261027/agronomic-origin/write-closure/test-local.py` (initdb/pg_ctl/psql/setpriv; socket local /tmp, sem rede).
- Novos checks: escape PRE de risco reproduzido; direct INSERT/UPDATE/DELETE A/B/anon negados; unlink+date e snapshot intacto; SELECT próprio e cruzado; criação/status/v1 A/B positivos e v2 sincronizado; negativos B→A e ACL anon; job service_role preservado; 3 RPCs aguardando gate com revogação primeiro → 42501; 6 timeouts gate/row/advisory ~3.02–3.04s; PRE rejeita baseline sintética; POST completo exercitado com fingerprints sintéticos explicitamente substituídos e política adulterada rejeitada; contenção positiva.
- PRE LIVE completo **não foi executado por ausência de suporte DO no leitor**; as leituras de catálogo forneceram os valores. Harness retira PRE/POST ao montar delta reduzido, depois exercita POST com dependências sintéticas: não é instalação homologada de triggers/RLS completos.
- Vitest clientes reais/transporte/Auth simulados: **101/101 em 4 arquivos** (criarAlertaClimaticoClient, atualizarStatusAlertaClient, reprogramarCasClient, origemAlertaAgronomico). Avisos act do ambiente, sem falhas. Não houve comparação nem alteração de `alertas.test.ts`; falha de texto legado relatada continua fora deste delta.
- Não houve typecheck/build manual (runtime não mudou); verificar última entrada do build automático antes de concluir. Resultados reproduzíveis em `results.txt`, hashes em `SHA256SUMS`, delta em `delta.diff`.

## Ensaio real bounded ainda pendente (auditor)

1. Confirmar ref externo, executar PRE, rever SHA/diff; aplicar **apenas** este delta em janela livre com timeout de instalação 3s/15s. POST e hashes novos precisam passar.
2. Fixtures existentes A reparada v5 e B `126e3203-a381-4440-8e8b-a34d64241b38` v2, aviso `154f779f-5507-40d1-bd37-a760ea251749`: não recriar. Conferir estado/revisões atuais, não assumir versões antigas.
3. JWT A/B: direct PATCH status/risco/date/unlink e DELETE com RETURNING → 0 linhas e leitura invariável; INSERT → rejeição; B→A invisível; anon sem leitura/mutação/RPC. Não testar exclusão real de dado produtivo: BEGIN/ROLLBACK de sessão de teste ou fixture exata autorizada, com readback.
4. Nas mesmas fixtures, RPCs criação/status/v1 sem origem positivos, v2 com origem+CAS e replay positivo; negativos cruzados. Capturar readback plano/data/aviso/log/recibo; sem atribuição direta no banco nem fallback.
5. Serviço: validar job pelo contrato existente sem ativar entregas externas; readback somente risco, datas/origem inalteradas. Não chamar endpoint notificante real automaticamente.
6. Revogação real já relatada: gestor B revogado por RPC 200, chamadas posteriores403, original restaurado. Janelas tentadas **não se sobrepuseram**: isso NÃO homologa operação real aguardando lock. Se houver ensaio aprovado: sessão em BEGIN com lock **só da fixture**, observador confirma wait em pg_stat_activity, release imediato (<1s) e watchdog independente ≤2s; nunca manter global gate bloqueado deliberadamente. Se não capturar sobreposição, registrar INCONCLUSIVO. Dois ordenamentos completos e timeout ficam somente sintéticos; operação que detém gate confirma antes da revogação enfileirada, não revogação vencedora.
7. Falha → contenção deny-only, não rollback do predecessor.

Relatos do auditor (não reproduzidos pelo agente): A/B vínculo/reprogramação/replay negativos cruzados passaram; plano/data/aviso sincronizados; PATCH B data/unlink409 e B→A0rows. Sem publicação/SQL hosted nesta tarefa. **Contabilidade real e SU-518022 adiados; homologação real do delta e durante espera continuam pendentes.**
