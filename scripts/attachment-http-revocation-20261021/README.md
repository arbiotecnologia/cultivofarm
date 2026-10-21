# Candidata — revogação HTTP de documentos de clientes

**NÃO IMPLANTADA. Base local/publicada informada: c63bc6bca04eba1abf2beb7d41394ebd0172fa9d, index-SoQppvKm.js. XML v96 preservado.**

## Evidência real recebida, não reproduzida neste sandbox
- Próprio PDF A/B: HTTP 200, 1751 bytes. Cruzado A/B: HTTP 400 NoSuchKey.
- Após retirada exata do papel administrador A, UI pausada, mas URL direta autenticada anterior retornou HTTP 200/1751 bytes com bearer real e cache:no-store.
- Em segunda retirada, URL com query diferente retornou HTTP 400 NoSuchKey. Papel restaurado pelo proprietário com o mesmo ID após cada ensaio.
- A diferença é compatível com uma decisão/resposta reutilizada em algum ponto, **não comprova cache, CDN, navegador, gateway ou SW**. Os ensaios são duas revogações diferentes, não uma comparação controlada na mesma janela. `cache:no-store` no fetch não prova que todo intermediário respeitou o pedido. O push worker informado não tem fetch handler; isso não demonstra a causa nem exonera outros componentes sem a rede.

## Lacuna comprovável em fonte
`downloadAuthenticatedAttachment` faz SDK Storage `.asStream()` com limite 20 MiB e abort 15s, mas não verifica autorização independente após bytes. Os hooks cercam ator/tenant/papéis/epoch/lease no navegador; isso não impede um bearer chamar diretamente uma URL antiga. `clienteDocumentos.ts` (ZIP) ainda baixa diretamente e sem esses limites. Nenhum novo signedURL é necessário para explorar o endpoint direto.

## Patch mínimo revisável
1. Nova ação de transporte `download-client-document`, apenas leitura, no mesmo preparo/abridor existente. Fonte **fora de supabase/functions**, para impedir deploy automático nesta rodada.
2. Cliente do **ator** apenas, sem service_role. Antes e depois do stream: JWT validado, `h15_actor_organization`, `cliente_storage_object_permitted`, `user_roles`, documento único por path e cliente via RLS. Rechecagem final de permissão/empresa/papéis após a cadeia. Comparação de snapshots; erro, revogação parcial, troca de papel/tenant/metadado negam entrega.
3. Um prazo absoluto de 15s cobre corpo/claims/RPC/metadados/Storage/stream/pós-prova. Corpo até 4096 bytes, arquivo até 10 MiB contado por chunk; metadata só antecipa recusa, não autoriza bytes. Nenhum await de cancel pendurado segura a resposta; stream tardio é descartado.
4. Respostas sucesso/erro private/no-store, CDN-Cache-Control/Surrogate-Control no-store, Vary Authorization/Origin, sem URL nem resposta parcial. Isso é defesa do **novo fluxo**, não atestado de revogação da URL antiga.
5. Candidata frontend usa sessão apenas do cliente canônico, POST para URL completa da função, stream até 10 MiB, prazo/cancel e erro neutro. O helper existente encaminha **apenas clientes-docs**, após adquirir sua fila/concorrência existentes, sem fallback; opener, paginação e fences existentes permanecem. ZIP também precisa passar pelo mesmo helper (patch incluído), sem mudar exclusão/upload. O ZIP completo continua sem fence de escopo/lease por montagem e entrega final: **não homologado**, não confundir a proteção de cada leitura com revogação de bytes já recebidos pelo ZIP.

## O que NÃO está resolvido
- **Endpoint antigo continua reutilizável enquanto não houver contenção comprovada.** Uma Edge de proteção não intercepta GET já conhecido de `/storage/v1/object/authenticated/...`. Sem controle verificável desse endpoint/cache, não declarar “revogação efetiva global”.
- Não adicionar cachebuster como autorização. Negar GET direto em policy restritiva só atua quando a requisição chega ao Storage/RLS; não prova invalidar resposta previamente cacheada. Pode também impedir o download do ator pela candidata; exige desenho de canal server-only/autoridade e revisão própria, nunca trocar para service_role para “funcionar”.
- Não existe aqui uma garantia documentada de purga seletiva via API que não modifique objetos/chaves. Não apagar, mover, copiar, reenviar arquivo, tornar bucket público, girar chave ou retirar as policies existentes.
- Bytes já recebidos não podem ser recuperados. Uma revogação após a última prova e durante a transmissão é uma janela inevitável; estas provas não constituem trava transacional com a alteração de roles, nem detectam ABA não observado sem versão monotônica do recurso.
- Sem snapshot LIVE das definições/ACL/policies nesta rodada: fontes versionadas demonstram contratos, **não equivalência LIVE**. A ferramenta de consulta disponível não expõe project_ref, então não foi usada (fail-closed canônico).

## Rede necessária para diferenciar as hipóteses
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

Testes são **laboratório sintético**, não JWT/RLS hosted, não reprodução da causa da resposta real e não homologação das URLs antigas. SU-518022 permanece apenas ack informado; nenhum chamado enviado.

## Validação desta entrega
- 60/60 testes em seis arquivos: 40 novos (27 servidor, 11 loader, 2 roteamento) + 20 regressões opener/documentos/ausência de assinatura.
- Deno check candidata + rollback: exit 0. Bundle **local** candidata: 46 módulos, exit 0; não é validação hosted nem implantação.
- App ativo: harness `build OK`; nenhuma alteração runtime em src (só testes), monitor e XML protegidos por hashes.
- Montagem frontend candidata/types/build de produção **não executados nesta rodada**; roteiro portátil abaixo para revisão. Não afirmar certificação types/build da aplicação com a candidata integrada.

### Montagem portátil pelo revisor
Em checkout limpo da base c63bc6b, conferir `protected-sha256.json`, aplicar `frontend.patch` com `git apply --check` antes de aplicar, copiar `frontend/loadClientDocument.ts` para `src/lib/authz/loadClientDocument.ts`. Copiar os dois arquivos de `edge/` para `supabase/functions/download-client-document/` (renomear index.ts.review para index.ts) **apenas fora do projeto conectado**, para evitar deploy automático. Rodar os três testes review novos + regressões indicadas, `bunx tsgo --noEmit -p tsconfig.app.json`, `bunx tsgo --noEmit -p tsconfig.node.json`, `bun run build`, Deno check/bundle. Registrar exits/hashes sem tokens. Não copiar `node_modules`/dist ao pacote. `frontend/canonical-candidate/` contém os dois arquivos completos montados para comparação byte-exata do patch. Rollback: `rollback/frontend-deny.patch`, manter ZIP passando pelo helper negado; nunca desfazer para o download direto.