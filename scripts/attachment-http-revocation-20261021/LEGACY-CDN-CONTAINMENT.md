# GET legado / CDN — bloqueio crítico, proposta sem execução

## Diagnóstico atualizado
O complemento B mostra a mesma revogação, mesmo arquivo, requests separados por 1 s: GET antigo `200/1751`, `cf-cache-status:HIT`, `private,max-age=3600`, sem disk cache/SW; query inédita `400/NoSuchKey`, `BYPASS`. Confirma **resposta de CDN remoto mascarando revogação** nesse ensaio. Preservar os dois `sb-request-id` no JSON de evidência; não inventar locator B a partir do arquivo A.

`max-age=3600` não é TTL restante comprovado nem autoriza aguardar uma hora e declarar fim do problema. `NoSuchKey` é a resposta recebida, não prova isolada de exclusão nem identifica o predicado exato do origin. Nenhum objeto foi excluído pelo agente.

## Dois controles necessários, não alternativas
1. **Novo fluxo POST**: candidata existente autentica ator, chama autorização/RLS atuais antes/depois, lê stream limitado e só entrega após confirmação fresca, responde private/no-store. A leitura ao Storage pode ainda receber bytes em cache, mas esses bytes não autorizam a entrega. Sem signedURL, nonce como autorização ou service_role de fallback.
2. **GET antigo**: é preciso mudar o comportamento da infraestrutura que atende o domínio Supabase original. Um proxy no domínio do app/Edge não intercepta URLs `swzpzcwiasxmjutrmvkm.supabase.co` já conhecidas. A URL exata antiga deve chegar à autorização atual em cada request (inclusive cache aquecido), ou ser negada antes de servir o cache.

### Controle durável proposto, dependência externa explícita
- Configuração/correção **no CDN/Storage original** para não servir `/storage/v1/object/authenticated/<buckets privados em escopo>/...` sem autorização fresca: bypass de cache antes do lookup ou reautorização antes de cada HIT; impedir novas respostas privadas reutilizáveis sem revalidação.
- Manter RLS vigente, não conceder acesso mais amplo. Política restritiva de origin, isoladamente, não intercepta um HIT já servido e pode quebrar o download do ator pela candidata. Não propomos removê-la, criar policy permissiva, trocar para chave privilegiada nem headers/GUC como autoridade.
- Não há controle dessa configuração CDN comprovadamente disponível ao projeto neste sandbox. **Bloqueador real para resolver GET legado**: mecanismo suportado do Supabase e correção/configuração server-side revisáveis. Registrar no caso SU-518022 existente; não enviar mensagem nem abrir chamado nesta rodada.

### Purga seletiva suportada: complemento, não correção durável
A documentação oficial atualmente descreve `storage.from(bucket).purgeCache(path)` e `storage.purgeBucketCache(bucket)`; o SDK instalado contém ambos. Requer secret server-side e disponibilidade Pro ou superior; a disponibilidade no projeto **não foi verificada**, nenhum plano deve ser alterado. [Documentação oficial](https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache)

Segundo a documentação, a purga enfileira invalidação, pode levar até 60 s entre nós, não limpa cache de navegador; o request seguinte repovoa o CDN. Portanto:
- Purga não apaga/move/copia objetos e não gira chaves, mas **é operação em produção**, não executada nem autorizada para esta rodada.
- Purgar só, sem o controle durável acima, permite aquecer novamente enquanto autorizado e voltar a servir bytes após outra revogação. Não chamar isso de resolução.
- Após controle durável, propor purga dos locators comprovados (arquivo B exato ainda faltante) e demais cache keys/variantes cobertas pelo mecanismo documentado. Não presumir que uma chamada remove todas as query variants/transformações sem confirmação de escopo.
- Nunca inserir secret no frontend, documento, log ou parâmetro de caller. Nenhum código de purga implantável foi adicionado; não reutilizar ferramenta cujo destino não seja comprovadamente o ref canônico.

## Aceite obrigatório após revisão e execução externa
1. Registrar controle CDN aplicado, escopo/buckets, horário e resultado da purga se disponível; sem alterações de objeto/roles/chaves/plano pelo agente.
2. Repetir URL **exata antiga**, sem query inédita, com bearer real revogado, após cache aquecido enquanto autorizado; nenhuma resposta 200/PDF, independentemente de HIT/BYPASS. Repetir após restauração→novo aquecimento→nova revogação e em A/B/PoPs acessíveis.
3. GET autorizado próprio permanece correto se o contrato permitir GET; cruzado negado. Se GET for fechado inteiramente, validar POST aprovado antes e manter GET fechado inclusive no rollback. Não liberar canal privilegiado só para passar teste.
4. POST: autorizado entrega bytes exatos; revogação antes/durante stream/pós-prova nega, timeout/erro/limite não entrega parcial; Retry somente manual, sem ressuscitar bytes de tentativa velha.
5. Correlacionar request IDs com logs origin/CDN sem JWT/cookies. Falta de HIT em poucos requests não certifica todos os nós nem expiração de caches locais.

## Rollback sem vulnerabilidade restaurada
Manter bypass/reautorização/negação do GET legado. POST e frontend podem cair no deny 503 preparado; **não restaurar cache de uma hora, GET sem checagem, URLs assinadas ou policies removidas**. Purga não tem rollback de conteúdo; objetos/histórico permanecem intactos.

## Pendência para SU-518022 — registrada, NÃO ENVIADA
- Vincular evidência B HIT/BYPASS, UTC, request IDs e versão publicada ao caso existente (ack apenas).
- Obter correção/configuração que autorize antes de servir HIT do endpoint authenticated e escopo verificável de purga/variantes, sem exigir mudança de plano/chave/objeto.
- Obter correlação origin dos dois requests e prova de tratamento de Authorization/Cache-Control no CDN. Bearer, cookies, secrets e dados dos PDFs não devem ser anexados.
- Estado: **causa CDN comprovada externamente; GET legado NÃO resolvido; POST candidato NÃO implantado; produção e XML v96 preservados.**