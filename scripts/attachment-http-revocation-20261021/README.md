# Candidata — revogação HTTP de documentos de clientes

**Atualização19:13 — evidência externa do proprietário:** frontend `d58721b03e2d19cc631add8fe4b6176ce776d6ab` publicado, deployment `34acc386-4e14-4a40-b7ce-753c351a545e`, bundle `index-lxh5t2PG.js`. A publicação recriou `download-client-document` v2 com JWT=false; o proprietário restaurou imediatamente v3 ACTIVE/JWT=true/import_map=false, mesmo ezbr `ad2041c454788719b1a7a3af7174e0b3b04c223756f986ea7a8e3bbe559ce364`. XML LIVE v98 tem o mesmo hash de v97, sem drift reportado. Não são execuções deste agente.

### Prevenção local da regressão JWT
- `supabase/config.toml` declara explicitamente `[functions.download-client-document] verify_jwt=true`; nenhum outro arquivo runtime alterado nesta rodada, nenhuma publicação/reimplantação/SQL.
- Teste `src/test/downloadClientDocument.jwtConfig.test.ts` interpreta o TOML e exige booleano true: falhou antes do patch por bloco ausente. A declaração impede depender do default que causou a regressão; o próximo deployment ainda exige conferir a configuração LIVE.
- Proprietário reportou POST real A/B pós-revogação403 e restauração200/hash, papéis restaurados; B2B A/B403; 23 testes frontend/ZIP independentes PASS. RPC backup aplicada externamente. **Deny GET legado NÃO aplicado; CDN/URLs antigas continuam gate aberto, sem resolução global.**

## Registro histórico19:01 após revisão0708012d — estado atualizado acima
- Proprietário: 37 testes servidor/transporte PASS; aplicada SOMENTE `client_document_download_snapshot(text)` pela migration `client_document_atomic_download_snapshot`.
- `download-client-document` v1 ACTIVE/JWT=true/import_map=false, ezbr `ad2041c454788719b1a7a3af7174e0b3b04c223756f986ea7a8e3bbe559ce364`, três fontes exatas. Evidência externa real A: próprio200/1751B ~6,2s, B403; B: A403/próprio200 ~6,7s, mesmo SHA `eab7e35ee414bd13ab72cad855c4090e54b846259f439f58d9b49b54adc65965`, private/no-store. Não execução própria.
- RPC backup e policy deny legado NÃO aplicadas. O ZIP integrado falha fechado se a RPC estiver ausente; sem consulta alternativa/fallback. Revogação POST em homologação pelo proprietário, não certificada pelo agente.
- Loader/frontend: deadline absoluto `performance.now()`15s e timer/AbortSignal, verificação antes/depois de cada await, limite20MiB preservando legados; nenhum GET/signedURL fallback.
- ZIP: até24 arquivos e60MiB reais acumulados; metadados apenas antecipam recusa. Excesso recusa a operação inteira, sem truncar/apagar documentos. Snapshot inicial/final, compressão e cada leitura têm deadline15s/abort/fence; Retry somente manual, resposta tardia não salva ZIP.
- Policy revisável usa `storage.allow_any_operation(ARRAY[...]::text[])` só com list/list_v2/upload/upload_update/delete/delete_many para preservar dependências SELECT; não permite GET/info/head/sign nem operações desconhecidas. Continua RESTRICTIVE, sem substituir RLS vigente. Matriz LIVE necessária antes de aplicar.
- XML v97 reportado pelo proprietário após publicação18:26:18: ZIP14 fontes,13 byte-exatas v96, única diferença ordem CORS equivalente. Nenhum hash ZIP/ezbr novo inventado; fontes XML locais intocadas.
- Validação atual:86/86 testes canônicos em9 arquivos e Deno check candidata/rollback PASS; tipos isolados app/node PASS e harness canônico build/typecheck OK. Sem comando de redeploy/publicação/SQL, alterações de roles/sessões/objetos/chaves/plano ou mensagens externas.
- Se rollback necessário: Edge503 deny e frontend nega clientes-docs/ZIP, nunca restaura GET/signedURL; rollback SQL candidato não executado. GET antigo/CDN ainda gate aberto em plano FREE.

## Histórico abaixo — v1 rejeitada/v2 pré-implantação
As seções seguintes são histórico de revisão; não substituem o estado vigente acima.

## Evidência real recebida, não reproduzida neste sandbox
- Próprio PDF A/B: HTTP 200, 1751 bytes. Cruzado A/B: HTTP 400 NoSuchKey.
- Após retirada exata do papel administrador A, UI pausada, mas URL direta autenticada anterior retornou HTTP 200/1751 bytes com bearer real e cache:no-store.
- Em segunda retirada, URL com query diferente retornou HTTP 400 NoSuchKey. Papel restaurado pelo proprietário com o mesmo ID após cada ensaio.
- Complemento 18:48: proprietário reproduziu B na mesma revogação: URL antiga 18:40:44 UTC `200/1751`, `cf-cache-status:HIT`, `private,max-age=3600`, disk cache/SW false; query inédita 18:40:45 `400/NoSuchKey`, `BYPASS`. **Cache CDN remoto mascarando revogação confirmado por evidência externa**, não captura própria. IDs e limites em `evidence-cdn-external-1848.json`; não reutilizar o locator A como se fosse B.

## Lacuna comprovável em fonte
`downloadAuthenticatedAttachment` faz SDK Storage `.asStream()` com limite 20 MiB e abort 15s, mas não verifica autorização independente após bytes. Os hooks cercam ator/tenant/papéis/epoch/lease no navegador; isso não impede um bearer chamar diretamente uma URL antiga. `clienteDocumentos.ts` (ZIP) ainda baixa diretamente e sem esses limites. Nenhum novo signedURL é necessário para explorar o endpoint direto.

## Patch mínimo revisável
**Revisão632594 NÃO liberada; versão v2 substitui o desenho antigo abaixo. Implementação atual e resultados em `REVISION-632594.md`: RPC atômica pré/pós (2 chamadas), canal bytes server-only aprovado por recurso, origin deny candidato, ZIP com prova final/fence, leitura20MiB preservando legado e CORS pinado. O texto original desta seção descreve v1 rejeitada, não o runtime a promover.**
1. Nova ação de transporte `download-client-document`, apenas leitura, no mesmo preparo/abridor existente. Fonte **fora de supabase/functions**, para impedir deploy automático nesta rodada.
2. Cliente do **ator** apenas, sem service_role. Antes e depois do stream: JWT validado, `h15_actor_organization`, `cliente_storage_object_permitted`, `user_roles`, documento único por path e cliente via RLS. Rechecagem final de permissão/empresa/papéis após a cadeia. Comparação de snapshots; erro, revogação parcial, troca de papel/tenant/metadado negam entrega.
3. Um prazo absoluto de 15s cobre corpo/claims/RPC/metadados/Storage/stream/pós-prova. Corpo até 4096 bytes, arquivo até 10 MiB contado por chunk; metadata só antecipa recusa, não autoriza bytes. Nenhum await de cancel pendurado segura a resposta; stream tardio é descartado.
4. Respostas sucesso/erro private/no-store, CDN-Cache-Control/Surrogate-Control no-store, Vary Authorization/Origin, sem URL nem resposta parcial. Isso é defesa do **novo fluxo**, não atestado de revogação da URL antiga.
5. Candidata frontend usa sessão apenas do cliente canônico, POST para URL completa da função, stream até 10 MiB, prazo/cancel e erro neutro. O helper existente encaminha **apenas clientes-docs**, após adquirir sua fila/concorrência existentes, sem fallback; opener, paginação e fences existentes permanecem. ZIP também precisa passar pelo mesmo helper (patch incluído), sem mudar exclusão/upload. O ZIP completo continua sem fence de escopo/lease por montagem e entrega final: **não homologado**, não confundir a proteção de cada leitura com revogação de bytes já recebidos pelo ZIP.

## O que NÃO está resolvido
- Preflight externo 18:51: organização Cultivo Farm do ref canônico aparece FREE. API de purga existe, mas documentação exige Pro+; **não presumir disponibilidade nem alterar plano**, criar endpoint service_role ou tentar purga. POST/bloqueio legado seguem prioritários; expiração/invalidação sem homologação até prova HTTP. A/B já restaurados pelo proprietário.
- **Endpoint antigo continua reutilizável enquanto não houver contenção comprovada.** Uma Edge de proteção não intercepta GET já conhecido de `/storage/v1/object/authenticated/...`. Sem controle verificável desse endpoint/cache, não declarar “revogação efetiva global”.
- Não adicionar cachebuster como autorização. Negar GET direto em policy restritiva só atua quando a requisição chega ao Storage/RLS; não prova invalidar resposta previamente cacheada. Pode também impedir o download do ator pela candidata; exige desenho de canal server-only/autoridade e revisão própria, nunca trocar para service_role para “funcionar”.
- Atualização factual: existe API oficial de purga seletiva, confirmada no SDK instalado, sem apagar/mover objetos. Disponibilidade no projeto/abrangência de variantes não verificadas; requer secret server-side e Pro ou superior, **sem alterar plano nem executar purga**. Purga isolada repovoa cache e não resolve revogação durável; proposta de bypass/reautorização original + purga e aceite em `LEGACY-CDN-CONTAINMENT.md`.
- Bytes já recebidos não podem ser recuperados. Uma revogação após a última prova e durante a transmissão é uma janela inevitável; estas provas não constituem trava transacional com a alteração de roles, nem detectam ABA não observado sem versão monotônica do recurso.
- Sem snapshot LIVE das definições/ACL/policies nesta rodada: fontes versionadas demonstram contratos, **não equivalência LIVE**. A ferramenta de consulta disponível não expõe project_ref, então não foi usada (fail-closed canônico).

## Complemento de rede para correlação e aceite, não para reabrir diagnóstico
Na mesma janela de revogação, coletar a URL **idêntica** e query distinta sem revelar bearer/cookies; registrar UTC, método/status, tamanho/hash do PDF, `Age`, `Cache-Control`, `Vary`, `CF-Cache-Status`, `ETag`, `Last-Modified`, `Via`, IDs de request/gateway, Initiator, fromServiceWorker/disk/memory quando disponíveis. Registrar headers de request `Cache-Control`/`Pragma` e resposta. Headers ausentes não provam ausência de cache. HAR deve ser sanitizado antes de compartilhar. Comparar decisão de autorização atual por RLS/RPC na mesma janela, com IDs de correlação quando existentes; nada de remover papéis pelo agente.

## Sequência e gates, sem execução
- Revisão independente de fonte/SDK/CORS/deadline/negativos e contratos LIVE no ref canônico.
- Edge primeiro e smoke autenticado não mutante; frontend só depois. Nenhuma implantação autorizada para esta rodada.
- Ensaio A/B com papéis remanescentes, URL direta antiga repetida/query nova, cache aquecido, revogação durante bytes/pós-read, restauração, timeout e Retry manual. Sem certificado/SEFAZ/XML generate.
- Só aceitar a correção integral quando URL direta antiga negada de modo comprovável, sem dados cruzados e sem depender de cachebuster. Caso contrário, estado é **fluxo protegido candidato / endpoint antigo ainda vulnerável ou não homologado**.

## Rollback
`rollback/index.ts.review` responde 503 sem URLs. Rollback do frontend deve manter clientes-docs indisponível, **nunca restaurar download direto/assinatura**. Não modificar/remove policies aplicadas; emergency deny histórico dos sete buckets continua disponível mas não foi executado e não invalida cache por si só. Outros anexos/XML/monitor não fazem parte deste rollback.

## Inventário de caminhos irmãos
| Caminho | Situação nesta rodada |
|---|---|
| clientes-docs: aba Documentos, ZIP | candidato estreito acima; URL direta antiga pendente |
| consultor-arquivos, aplicacao-evidencias, entrega-documentos | mesmo helper central; guards canônicos storage1 por recurso, pré/pós-prova independente ainda precisam de revisão LIVE por família |
| financial-docs, financial-reports, financial-receipts | helper central; permissões financeiras/owners e snapshots de recibos não devem ser substituídos por simples gate de bucket; URL direta antiga também precisa da matriz de rede |
| visitas-pdf | caminho histórico sem contrato LIVE atualizado nesta rodada; não presumir legados seguros |
| order-attachments, entrega-termos | ausência/bloqueios anteriores preservados; não criar bucket nem reaproveitar outro |
| fiscal-xml | v96 estável; autorização run/tenant e stream existentes preservados, não alterados |
| fiscal-certificates, branding/logos | material de chave / público fora do canal genérico; nunca expor certificado ou bloquear logo como arquivo privado sem escopo |

Testes são **laboratório sintético**, não JWT/RLS hosted nem homologação das URLs antigas. A causa CDN do ensaio B foi comprovada externamente pelo complemento de rede; o controle legado permanece bloqueado. SU-518022: evidências/pendências salvas sem envio externo, ack anterior não é resolução.

## Validação desta entrega
- Atualização v2: 76/76 sintéticos em9 arquivos, Deno check/47 módulos bundle, types app/node e build isolado32,44s PASS. SQL/RLS/JWT/GET antigo/ZIP real não homologados. Patches regenerados por arquivos completos, sem contornar bloqueio de git apply. Relatório v2 substitui resultados v1 abaixo.
- 60/60 testes em seis arquivos: 40 novos (27 servidor, 11 loader, 2 roteamento) + 20 regressões opener/documentos/ausência de assinatura.
- Deno check candidata + rollback: exit 0. Bundle **local** candidata: 46 módulos, exit 0; não é validação hosted nem implantação.
- App ativo: harness `build OK`; nenhuma alteração runtime em src (só testes), monitor e XML protegidos por hashes.
- Montagem frontend candidata/types/build de produção **não executados nesta rodada**; roteiro portátil abaixo para revisão. Não afirmar certificação types/build da aplicação com a candidata integrada.
- Aplicação dos patches com `git apply --check` foi **bloqueada pelo ambiente**, não PASS; a comparação byte-exata dos arquivos completos e a revisão/aplicação portátil continuam necessárias. Não executar aplicação em projeto conectado nesta etapa.

### Montagem portátil pelo revisor
Em checkout limpo da base c63bc6b, conferir `protected-sha256.json`, aplicar `frontend.patch` com `git apply --check` antes de aplicar, copiar `frontend/loadClientDocument.ts` para `src/lib/authz/loadClientDocument.ts`. Copiar os dois arquivos de `edge/` para `supabase/functions/download-client-document/` (renomear index.ts.review para index.ts) **apenas fora do projeto conectado**, para evitar deploy automático. Rodar os três testes review novos + regressões indicadas, `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx tsgo --noEmit -p tsconfig.node.json`, `bun run build`, Deno check/bundle. Registrar exits/hashes sem tokens. Não copiar `node_modules`/dist ao pacote. `frontend/canonical-candidate/` contém os dois arquivos completos montados para comparação byte-exata do patch. Rollback: `rollback/frontend-deny.patch`, manter ZIP passando pelo helper negado; nunca desfazer para o download direto.