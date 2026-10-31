# Cancelamento de etiqueta — fechamento independente revisável

## Escopo

Uma única mudança: REVOKE EXECUTE de PUBLIC, anon e authenticated em `public.rpc_cancelar_etiqueta_produto(uuid,text)`. Sem mudança de corpo, owner, service grants, tabelas, políticas ou triggers. Rollback é no-op deny-only, nunca regrant. Nenhuma implantação, publicação, sessão/segredo ou etiqueta real foi acessada.

O corpo capturado coincide com MD5 LIVE informado `c640896710b8eb8a00eb230bbf9e1cbe`. PRE/POST exatos medidos sobre restauração integral + composição aplicada relatada, incluindo envase isolated install/legacy closure/release. Este pacote não reinstala dependências. O auditor deve conferir PRE em leitura na produção; drift/rerun abortam. A ordenação de triggers usa colunas explícitas COLLATE C.

## Prova executada

16/16 PostgreSQL PASS, exit_code 0, em Unix socket descartável. Etiquetas sintéticas com IDs válidos foram inseridas com triggers origin habilitados. Fixtures de autoridade herdadas do harness usam preparação sintética isolada; isso não é JWT/RLS hosted nem prova de provisionamento real.

- FSF não lê etiqueta ARBio pela política restritiva, mas ANTES o DEFINER a cancela: exposição reproduzida, transação revertida e conteúdo etiqueta/eventos/audit restaurado.
- Cancelamento próprio ANTES funciona e foi revertido.
- Perfil inativo ANTES já é negado pelo helper de papel com P0001. A primeira rodada esperava indevidamente sucesso e FALHOU; preservada em logs/first-failed.log. Corrigida expectativa com SQLSTATE exato, sem relaxar teste.
- DEPOIS foreign FSF, own ARBio, anon e inativo recebem exatamente 42501; snapshots integrais de etiqueta/eventos/audit permanecem iguais.
- Apenas ACL cliente mudou; corpo/owner/políticas/triggers/service permanecem iguais. Rollback não reabre, rerun rejeita, leituras próprias e isolamento estrangeiro preservados.
- PRE→delta→POST foi exercitado em transação local; reconstrução de ACL somente dentro de rollback descartável, não há regrant no instalador/rollback entregues.

Frontend: cancelamento removido do componente compartilhado mesmo fora de readOnly; Ver/Imprimir existentes preservados. 5/5 testes montados focados; regressão etiquetas/envase/entregas 504/504 em 32 arquivos. Build automático OK; não há log de typecheck separado. Sem teste de sessão real/browser autenticado nesta preparação.

## Limites

Fechamento direto liberável para revisão independente, não liberação de cancelamento canônico. Sem novo contrato de idempotência/revogação porque toda chamada cliente fica fechada, inclusive própria.

`rpc_substituir_etiqueta_produto(uuid,text)` na captura já tem somente postgres/service_role EXECUTE; não alterar por este pacote. Chama geração e cancelamento como DEFINER: owner/service e outros callers privilegiados não são contidos pela revogação direta e não estão certificados aqui. `indirect-audit.json` registra a ACL capturada, não LIVE. Não alegar isolamento completo de todos os escritores do domínio.

Confirmação física continua NO-GO separado; embalagens/vínculos/dispensa, financeiro/fiscal/automações não são liberados. Instalação e sessão real/PRE/POST serão feitas pelo auditor após revisão.

## Arquivos

`install.sql.review`, `preflight.sql.review`, `postflight.sql.review`, `state.sql.review`, `rollback.sql.review`, `candidate.sql.review`; JSON PRE/POST/resultados/fontes, logs brutos, frontend.diff.txt e SHA256SUMS. Nenhum release com GRANT é necessário: trata-se de fechamento somente.