# Execução server-side limitada — especificação revisável, NÃO EXECUTADA

## Contrato oficial aceito
- Objeto exato: `purgeCache(path)`, request `DELETE /storage/v1/cdn/{bucket}/{path}` no host canônico; `/cdn/{bucket}/{path}` é relativo à base Storage. Não confundir com `DELETE /storage/v1/object/...`, que apagaria objeto e está proibido.
- Bucket inteiro: `purgeBucketCache(bucket)` existe, mas **fora da execução mínima proposta**, pois invalida mais alvos. Exige lista/escopo e revisão independentes próprios.
- Pro+, segredo apenas no servidor, propagação de até 60 segundos. **Preflight externo do proprietário 18:51 UTC: organização Cultivo Farm do ref canônico aparece FREE no dashboard.** Portanto disponibilidade da purga NÃO presumida; requisito documental Pro+ não comprovado, execução fechada. Não mudar plano nem substituir segredo/chave para tentar habilitar.
- Referência: https://supabase.com/docs/guides/storage/cdn/purge-cdn-cache ; implementação instalada `StorageFileApi.purgeCache` usa DELETE em `/cdn/`.

## Destino e autoridade sem ambiguidade
Preparar comando administrativo **offline/server-only**, não Edge pública, endpoint da aplicação, job recorrente ou botão de usuário. Nenhum executor foi adicionado ao runtime. Não é o cliente do download POST: download usa somente bearer do ator; purga usa segredo administrativo exclusivo do processo servidor, nunca devolvido ao chamador.

Antes de escrever executor operacional, conferir constructor final e headers reais de destino localmente sem imprimir seus valores. Se usar segredo opaco `sb_secret_`, enviar em `apikey`, **não** `Authorization: Bearer <segredo opaco>`. Não efetuar login nesse cliente nem reutilizar cliente de login/ator para purga; não alterar grants/RLS para aceitar credencial incorreta. Nunca ler ou emitir segredo em relatório, stdout, HAR, URL ou erro.

## Gates fail-closed antes de qualquer DELETE
1. Revisão independente aprovada do controle durável do GET legado **e** deste escopo de purga; aprovação não presumida pelo pedido de preparar candidata.
2. Evidência do controle aplicado no CDN/Storage original, antes do cache lookup, com escopo e identificador verificáveis. Sem isso, executor nem deve iniciar: purga isolada não resolve revogações futuras.
3. Ref exatamente `swzpzcwiasxmjutrmvkm`, origem HTTPS exatamente `https://swzpzcwiasxmjutrmvkm.supabase.co`; parar se ausente/divergente. Sem destinos alternativos, redirects ou ambiente Cloud.
4. Lista fechada revisada de objetos existentes/locators comprovados, cada par bucket/path validado contra evidência, sem aceitar parâmetro livre de usuário. Candidata inicial: apenas `clientes-docs`; locator B exato ainda não fornecido neste complemento, portanto **lista executável vazia e execução bloqueada**. Não usar o locator A como B nem adivinhar path.
5. Validar path relativo sem query/fragmento, URL, traversal, segmento vazio, wildcard ou barras iniciais; codificar segmentos individualmente. Nenhum endpoint de upload/update/delete/move/copy/list/download é necessário ao executor de purga.
6. Disponibilidade da API/feature e segredo server-side adequado comprovadas. Falta de disponibilidade encerra processo, sem upgrade, criação/rotação de secret, fallback de credencial ou policy permissiva.

## Limites do executor a revisar quando gates forem satisfeitos
- Uma execução explícita para a lista aprovada, sequência serial, exatamente uma chamada por alvo. Sem paralelismo, agenda, loops, retries automáticos, descoberta recursiva ou `purgeBucketCache` automático em falha do path.
- Cada chamada limitada a 15 s pelo sinal de abort; redirects negados e somente DELETE no prefixo `/storage/v1/cdn/clientes-docs/`. Valor proposto operacional, não garantia de conclusão remota.
- Resposta limitada a 4 KiB; considerar apenas status e resposta esperada da API, nunca despejar corpo/headers que possam conter credenciais. Falha/403/404/429/5xx encerra, não muda plano/permissões nem tenta apagar o objeto.
- Timeout/abort após envio deixa resultado **UNKNOWN**, não “não executado”; pode haver invalidação enfileirada mesmo sem resposta. Sem retry automático, conferir resultado/evidência antes de nova revisão.
- Registrar apenas UTC, ref público, hash da lista revisada, ordinal do alvo, status/resultado e ID de request seguro quando presente; paths/identidades e segredo não vão para logs públicos. O manifesto privado revisável contém os locators necessários, não credenciais.
- Sucesso significa **invalidação aceita/enfileirada**, não revogação homologada. Aguardar janela de propagação documentada (até 60 s) antes da bateria HTTP, sem declarar todos os nós limpos a partir de um teste.

## Ordem coordenada, sem implantação nesta rodada
1. Revisar POST/RLS pré-pós e controle CDN original como controles distintos; preservar XML v96 e gates existentes.
2. Validar disponibilidade POST primeiro sem fallback para GET; qualquer fechamento global do GET deve considerar que a candidata ator-only também lê Storage. Não bloquear esse origin e depois improvisar service_role para baixar bytes.
3. Aplicar controle durável original aprovado; executar purga limitada acima só após seus gates; promover frontend somente pela revisão correspondente.
4. Homologar URL antiga exata aquecida→revogação, A/B e repetição após restauração/novo aquecimento; POST e GET cruzados negados. A gestão dos papéis nesses ensaios permanece com o proprietário, não com executor de purga.

## Estado e rollback
Preparação documental completa; executor operacional **não montado** porque faltam controle durável comprovado, locator B exato e disponibilidade da API no projeto FREE informado externamente. Não criar endpoint de manutenção com service_role sem necessidade comprovada, nem pedir segredo para contornar o gate. Prioridade é patch POST canônico e bloqueio legado revisáveis; expiração/invalidação permanece **gate de homologação aberto** até prova HTTP, sem presumir que max-age ou restauração dos papéis revogou caches. Papéis A/B já restaurados pelo proprietário; nenhum ensaio de revogação será iniciado pelo agente.

Rollback mantém GET legado sem entrega de cache não autorizado e POST/frontend em deny503; não restaura assinatura/cache antigo. Purga não tem operação inversa para ressuscitar cache e não altera os objetos/histórico. SU-518022 apenas registro existente, **nenhuma mensagem externa**.