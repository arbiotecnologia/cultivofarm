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
