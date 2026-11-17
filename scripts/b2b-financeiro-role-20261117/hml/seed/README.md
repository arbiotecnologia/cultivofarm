# Massa fictícia QA do Financeiro B2B — somente HML `vrlcdwmlytukrjezrrnf`

Autorização do usuário: criar dados fictícios de teste e eliminá-los todos depois. Nada aqui roda em produção.
Sem NF, sem cobrança, sem envios. Nenhum gatilho é desativado.

## Ordem (root; nada é reprovisionado)
1. `04-register-saas-hml.sql.review` — registra as 2 assinaturas e 4 overrides já criados (IDs fixos).
2. `05-seed-hml.sql.review` — títulos sentinela A/B/C + origem legada fictícia; salvar `QA_TITLES_JSON` e rodar
   `qa/merge_seed_manifest.py <manifest> <titles.json>` (limites 5000/7000/9000).
3. Crédito: pacote `../credit` (01d → 02d → 03d). Depois `jwt_suite.py` (`CREDIT_02D=installed`), navegador desktop/mobile, CSV,
   revogação (`QA_FIN_REVOKED`).
4. `06a-cleanup-dryrun-hml.sql.rollback` — lista tabela/ID/hash/vínculo de cada linha, recusas e `QA_CLEAN_DIGEST`; termina em ROLLBACK.
5. Revisar a lista; então `SET app.qa_cleanup_digest='<digest>';` + `06-cleanup-hml.sql.review` na MESMA sessão → `QA_CLEAN_PASS`.
6. Contas Auth: painel Supabase do HML → Authentication → Users → buscar cada um dos 5 UUIDs → Delete user (mecanismo oficial;
   a Admin API `DELETE /auth/v1/admin/users/{id}` exige service_role e fica a critério do root). Nenhum outro usuário é tocado.
7. `04d-rollback-credit-hml.sql.review` se o 02d não for mantido; `07-verify-clean-hml.sql.readonly` → tudo 0.

## Exceção temporária (única)
- Seed: só `platform_private.homolog_validation_block_receivable_insert()`; cleanup: só gatilhos de DELETE das tabelas que
  contêm linhas QA. Liberação exige `session_user=postgres` + ticket da própria `txid` + linha manifestada (id pré-registrado
  com descrição `QA-FIN-` ou hash exato da linha). Os corpos são restaurados pelo texto original e conferidos (md5 + definição)
  antes do `COMMIT`; qualquer falha reverte tudo. Outras sessões nunca veem o corpo alterado.
- Limpeza: escopo só por colunas uuid/uuid[] ligadas aos 5 usuários, 3 parceiros, 2 assinaturas, 4 overrides e manifesto
  (id próprio nunca autojustifica). Recusa sem exceção: tabelas `saas_*`/catálogo/comercial/fiscal/organizações/categorias/métodos,
  linhas de outro tenant, linha de negócio ligada a usuário QA só por coluna de ator, fixtures proibidas, referência só textual,
  volume > 2000. Execução exige o digest do dry-run e zero referências restantes.

## Limites honestos
- `test_seed_pg.py` (17/17) usa esquema sintético mínimo: prova a mecânica, NÃO que os gatilhos reais do HML aceitem o seed.
  Se outra guarda real (ex.: gate SaaS, cerca fiscal de títulos, condição de pagamento) recusar, o seed aborta sem efeito e a
  mensagem deve voltar para revisão — nunca contornar.
- Crédito: o seed grava limite fictício; o crédito HML é o legado (`213ac31f…`) e não equivale ao de produção.
- Categoria RECEITA ativa existente é apenas referenciada; sem ela o seed para.
- Parceiros A/B/C e usuários FIN A/B/C, Gestor A e Técnico A são os IDs já criados pelo root (fixos em 05/06/07);
  nada é recriado. A limpeza apaga parceiros, vínculos e perfis desses IDs; contas Auth saem pela Admin API.
