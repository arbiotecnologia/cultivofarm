# Catálogo → Produtos — pacote local revisável

## Resultado
Cadastro único em `/base-tecnica?tab=produtos`; menu separado removido e `/configuracoes/produtos` preserva query/hash. Título Catálogo. CRUD Admin/Gestor no tenant atual; Financeiro consulta, sem CRUD; B2B/Superadmin não ganham edição. Nenhuma flag global foi ativada.

RPCs: `tenant_product_list/save/set_archived`, `tenant_catalog_root_save` para volumes/conteúdo de perfil e `tenant_catalog_formulacoes_replace`. Receiver do SDK preservado, CAS/idempotência, fences de sessão/época, abort nas leituras e invalidação capturada. Financeiro original9d3a9424 preservado (5 controles byte a byte PASS).

## Testes finais
- Catálogo/protocolos/navegação: **56 arquivos, 915/915 PASS** (`catalog-final.log.txt`).
- Fluxos SDK real/fetch sintético: **41/41 PASS** (`flows-final.log.txt`); sem mock RPC nos novos testes.
- Estoque/entrega/envase/etiquetas: **50 arquivos, 720/720 PASS**.
- Estado original comercial/financeiro: **176 arquivos, 2866/2866 PASS**.
- Perfil limitado: maxWorkers2/minWorkers1; paralelismo máximo não certificado.
- Build/typecheck automático: última entrada build OK; typecheck separado não executado (restrição do ambiente). Erros intermediários e falhas anteriores foram mantidos nos logs.

## Limitações explícitas
Produto + composição são duas chamadas, não uma transação única. Falha/ACK perdido da segunda é parcial/incerto e NÃO significa rollback nem composição antiga comprovada. Ambas as chaves ficam preservadas no hook para repetição explícita enquanto montado. Após o achado independente, a tela mantém o diálogo e os argumentos congelados, bloqueia fechamento/edição e oferece Reconciliar composição com as mesmas chaves e CAS, sem compensação ou novo cadastro. Troca de contexto encerra a tela com fences; retenção após reload não foi implementada nesta etapa.
Declarações antigas incompatíveis são preservadas: editar identificação não as substitui; tentar alterar composição bloqueia ANTES do produto. Versão do catálogo, fornecedor/safra e estado ativo no formulário não são enviados silenciosamente: campos ficam indisponíveis; arquivar/reativar usa RPC específica. Unidade de produto não consta da allowlist vigente: não foi inventada nem adicionada por DDL. Volume usa contrato existente mL; preços/regras financeiras não foram alterados.
Conteúdo de perfil próprio pode ser salvo sem promoção de status. Aprovação/fontes/alvos/culturas técnicos permanecem sob contenções existentes; nenhum writer global reaberto. Associação fiscal existente preservada; fiscal pendente/OFF.
Leitores escopados catálogo/volumes e entrega recebem invalidação exata. Estoque legado `estoque_produto` sem suffix de ator não recebe invalidação ampla insegura; read-back completo nas seleções de pedido/estoque/entrega com JWT real permanece pendente. Produto novo não implica estoque disponível nem autorização B2B.

## Evidência real e transporte
CRUD montado foi exercitado com SDK real e fetch sintético. Não prova JWT/RLS/produção. Tentativa de navegador local assinada-out não estabeleceu acesso ao cadastro; não conta como fluxo autenticado. Estado aplicado c57bee/migration v4 e JWT bidirecional são relatos do proprietário, não reexecutados aqui.

## Espelhamento no isolado aec6d152
`catalogo-produtos-local.patch` contém somente src + regras AGENTS, sem SQL/conexão/flags/secrets. `MANIFEST.json` traz hashes originais/finais. Revisar cada caminho e comparar original_sha256 antes; divergência de base deve abortar, não aplicar cegamente. Rodar dry-run (`git apply --check`) no espelho; depois aplicar integralmente com revisão própria, testar e executar JWT real. Base local19d08e diferente da base implantada informada c57bee: patch não certifica compatibilidade byte a byte com o isolado.

Nenhuma publicação, implantação, SQL hosted, cobrança, fiscal ou SMTP executado. GO depende do espelho e provas reais finais. O commit final é gerenciado pela plataforma; o pacote identifica base e hashes, não inventa commit de fechamento.

## Continuação — achado independente03/11
- Gate Owned permanece false; ProdutosTab não monta OwnedCatalog nem chama suas RPCs antigas. Fonte única tenant_product_list; volumes usam tenant_catalog_root_save.
- Parcial mantém diálogo/argumentos congelados e fecha só após ACK completo no mesmo contexto. Teste montado SDK real prova mesmas duas chamadas/chaves/CAS, nenhuma segunda raiz e tentativa de fechamento recusada.
- Reteste: 4 arquivos/53 PASS; catálogo56/916 PASS; separação financeira5/5 PASS. Logs anteriores preservados; baterias720/2866 são anteriores a este ajuste focado, não repetidas nesta continuação. Build automático OK; sem typecheck separado, JWT, SQL ou publicação.

## Continuação — RBAC independente03/11
- Financeiro mantém leitura em Produtos (inclusive redirect legado com query/hash) sem CRUD, volumes/fichas mutantes ou abas irmãs. URLs diretas de outras abas/aliases/duplicação de tab são recusadas antes de montar leitores; menu e busca usam query-aware RBAC. Nenhum guard de servidor foi alterado.
- Gestor mantém r na rota antiga e rw no Catálogo, com cadastro/edição/arquivamento/reativação próprios exercitados pelo SDK real e fetch sintético.
- A aba Produtos oferece acesso à página fiscal canônica existente somente aos perfis já autorizados e com sua flag vigente. Esse link não concede associação nem CRUD fiscal: a associação global continua contida e o candidato fiscal próprio mantém seu gate OFF. Não há prova de associação fiscal real nesta sessão.
- Disponibilidade de tenant_catalog_root_cfg para volumes e product_technical_profiles foi reportada pelo proprietário; não foi recapturada pelo agente nem exigiu DDL.
- Reteste final: 68 arquivos/1064 PASS; separação financeira Python5/5 PASS; focados5/58 PASS. Primeira regressão falhou em três testes sem roteador após o novo link: wrapper corrigido sem retirar asserts, log inicial preservado. Build automático OK02:34:08UTC; diff --check limpo. Typecheck separado não executado por restrição do ambiente.
- Sessão externa não gerenciada: navegador/JWT/RLS/Storage autenticados e espelho seguem pendentes do auditor; nenhuma operação de banco, SQL, publicação ou implantação executada. Baterias720/2866 continuam históricas, não repetidas nesta continuação.

## Revisão9a88256 — parcial e patch final
- O fechamento/reset após compositionError já estava removido no estado local anterior; nesta revisão o diálogo também mostra ACK product_id/updated_at, estado Produto salvo/Composição pendente e lista dos componentes preservados. O ACK não rebasa a intenção original: replay conserva payload, alvo original, CAS e ambas as chaves.
- O hook recusa alteração da intenção pendente no mesmo escopo antes do REST. A tela mantém campos congelados e handlers síncronos impedem editar/remover componentes durante salvamento/parcial, mesmo em evento disparado diretamente. Nova intenção só depois de reconciliar a anterior.
- Testes montados criam produto com componente200mL: recusa definitiva sem commit e ACK perdido após commit; retry retorna o mesmo produto/mesma composição, uma única raiz e um único commit de composição. ID/versão e rascunho permanecem visíveis, tentativa de remoção não perde componente. Teste do hook recusa nome/composição diferentes sem dispatch adicional e aceita replay exato.
- Reteste final68/1067 Vitest e5/5 separação financeira PASS; focados2/40 PASS. Logs intermediários preservados: seletores/contexto ajustados e teste de evento direto reproduziu remoção indevida antes da barreira síncrona. Build automático OK02:40:25UTC; typecheck separado não executado por restrição do ambiente.
- RBAC Financeiro já consolidado no mesmo patch: somente Produtos, URL/menu/busca e zero readers em abas negadas; Gestor CRUD próprio. SQL, flags, permissões servidor, fiscal/SMTP e financeiro original inalterados.
- Patch final tem29arquivos e hashes de fonte/artefatos verificados. Aplicação/dry-run no isolado e provas JWT/browser/Storage continuam pendentes do auditor; não foi aplicado/públicado nem certificado contra9a88256. Retenção após reload não faz parte desta revisão.
