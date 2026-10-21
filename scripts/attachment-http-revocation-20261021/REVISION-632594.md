# Correção concreta da revisão 632594 — candidata v2, NÃO LIBERADA

## Delta implementado
- `snapshot.sql.review`: `client_document_download_snapshot(text)` STABLE INVOKER com `search_path=''`, um snapshot de statement PostgreSQL; usa o helper LIVE confirmado `cliente_storage_object_permitted`, h15, tabela separada de roles, cliente/tenant e `cliente_documentos` sob RLS. Exatamente um documento visível; nulo em falta/ambiguidade. Sem grants de tabela, sem ampliar políticas/perfis. Execução apenas authenticated; service/anon/PUBLIC não podem usá-lo como prova.
- `index.ts.review` + `transport.ts`: **2 RPC remotas por download** (pré e pós), **1 Storage**, claims uma vez por request. Nenhuma consulta `.from()`/fanout remoto a roles/clientes. O trabalho interno do banco continua existindo; não alegamos custo total menor sem medidas reais. Sem retry/cadência extra e prazo total15s preservado.
- Canal de bytes server-only necessário para tornar o GET do ator negável: segredo existente do servidor acessa apenas o path aprovado para clientes-docs, após snapshot do ator. Não é autorização por bucket, não faz login, não consulta prova com serviço, não expõe segredo nem assina URL. `sb_secret_` só em apikey; JWT legado servidor em apikey+Authorization. Ref exato e redirect error. Sem novo endpoint de manutenção/purga.
- `legacy-origin-deny.sql.review`: candidata restritiva para SELECT anon/authenticated em clientes-docs; não altera upload/escrita/objetos e não abre policy service_role. **Depende do canal aprovado; não aplicada.** Resolve contrato do origin (serviço lê, ator direto não), mas CDN HIT antigo continua fora da RLS: bloqueio no CDN antes do HIT e expiração/invalidação com prova permanecem gates reais.
- CORS SDK pinado `@2.110.8/cors` candidata e rollback.
- Limite do download20MiB incremental, preserva legados15–20MiB válidos; UI de upload10MiB e bucket20MiB intocados. Não modificar objetos existentes nem aumentar limite da UI. Teste concreto15MiB PASS; >20MiB nega sem parcial.
- ZIP: `client_documents_backup_snapshot(uuid)` INVOKER/RLS retorna documentos e provas num statement; chamadas inicial/final (após compressão). Snapshot alterado/negado impede URL/download. Chamador existente candidato usa `useStorageAccessScope`, sinal de abort em mudança de scope/fechamento/unmount e ownership; antigo finally não libera nova tentativa. Helper captura fence antes/após cada await, inclusive ZIP/postread/clique, sem armazenar formulário/Blob persistente.
- Rollback: Edge503, RPCs retornam NULL, helper/ZIP negam; manter origin deny e controle CDN, nunca desfazer para assinatura/GET do ator. Arquivos completos e patch regenerado disponíveis; não usamos git apply bloqueado.

## Evidências e limites
CDN remoto mascarando revogação A/B é evidência **verificada externamente pelo proprietário**, não hipótese pendente. FREE também confirmado externamente; purga oficial Pro+ existe, mas indisponibilidade/expiração/invalidação não se contornam com endpoint service_role, upgrade ou cachebuster. A/B restaurados; não tocados nesta rodada.

SQL é implementação concreta **não executada**, fora de migrations. Postflight catalogado em `sql-postflight.sql.review`; sintaxe/ACL/plano/RLS real e JWT A/B devem ser revistos/ensaiados no banco canônico após autorização. Nenhum serviço read-query sem ref comprovado foi usado. Claims validam JWT, a RPC decide autoridade viva; ABA não observado e janela após prova final continuam limitações, não resolvidas por snapshots.

## Validação local da montagem integrada
- 76/76 em9 arquivos: transporte, canal/prova/carga de chamadas, ZIP4, loader, routing, opener, cliente, exclusão e no-signed regression.
- Deno check candidata+rollback PASS; bundle local47 módulos PASS (não hosted).
- Types app/node PASS; app primeiro falhou por docs ausentes na montagem, depois montagem completada e rerun PASS; não relaxar asserts nem ignorar arquivos.
- Build isolado PASS32,44s; nenhum build da aplicação ativa disparado manualmente. Warning de chunks grandes preservado, não falha.
- Sem implantação/frontend promotion/publicação/SQL/dados/sessões/roles/objetos/chaves/planos/monitor/XML. Não é E2E real; nenhum login fictício ou RLS simulado é vendido como homologação.

## Bloqueios restantes para revisão
1. Revisão SQL/ACL/plano real, identidade server-only final e JWT A/B; necessidade do canal justificada pela negação do origin, não aprovado automaticamente.
2. Controle durável CDN original antes de HIT + invalidação/expiração comprovada em FREE. Origin policy não elimina cache já servido. Não liberar candidata como solução integral sem isso.
3. Homologação ZIP real e arquivos legados, testes de tenant/revogação/parcial/epoch/lease/ABA observada; montagem sintética não preserva sessão do usuário para esse teste.
4. Revisão independente do pacote inteiro, inclusive rollback; nenhuma execução depois desta entrega.